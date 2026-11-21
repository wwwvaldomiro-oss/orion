import type {
  AnnualCellState,
  AnnualExpenseKind,
  AnnualExpenseRow,
  AnnualExpenseSource,
  AnnualYearRecord,
  BankAccount,
  CardBrand,
  CardMonthSnapshot,
  CardMonthSnapshotTransaction,
  CreditCardAccount,
  MonthlyBill,
  OrionState,
  PayableContract,
  PayableInstallment,
  RevenueContract,
  RevenueEntry,
  RevenueEvent,
  RevenueEventSnapshot,
  RevenueSource,
} from "@/types/orion";
import {
  buildArchiveFolderPath,
  classifyArchiveCategory,
  extractAccessKey,
  normalizeProduct,
  type FiscalDocType,
  type FiscalReceipt,
  type ReceiptItem,
  type ReceiptKind,
  type ReceiptProcessingStatus,
  type ReceiptSourceOrigin,
} from "@/lib/receiptAnalysis";

export type OrionExportRecord = {
  id: string;
  data: Record<string, unknown>;
};

export type OrionExportCollection = {
  module: string;
  records: OrionExportRecord[];
};

export type ParsedOrionExport = {
  format: string;
  version: number;
  sourceApp?: string;
  exportedAt?: string;
  collections: OrionExportCollection[];
  byModule: Record<string, OrionExportRecord[]>;
  totalRecords: number;
};

export type ImportModuleKey =
  | "annual_years"
  | "annual_expenses"
  | "annual_expense_months"
  | "installment_contracts"
  | "installment_entries"
  | "finance_account_profiles"
  | "finance_bills"
  | "revenue_sources"
  | "revenue_contracts"
  | "revenue_entries"
  | "revenue_events"
  | "finance_card_month_snapshots"
  | "fiscal_receipts";

export type ImportConflictStrategy = "keep_existing" | "overwrite_with_json";

export type ImportConflictDetail = {
  module: ImportModuleKey;
  sourceId: string;
  targetId: string;
  label: string;
  changedFields: string[];
};

export type ImportUnlinkedDetail = {
  module: ImportModuleKey;
  sourceId: string;
  label: string;
  missingRefField: string;
  missingRefId: string;
  canStillImport: boolean;
};

export type ModulePreviewStats = {
  module: ImportModuleKey;
  label: string;
  phase: 1 | 2;
  totalInFile: number;
  inserts: number;
  alreadyExists: number;
  conflicts: number;
  unlinked: number;
  totalExpectedCents: number;
  totalSettledCents: number;
};

export type YearPreviewStats = {
  year: number;
  annualRows: number;
  annualExpectedCents: number;
  billsCount: number;
  billsExpectedCents: number;
  billsPaidCents: number;
  revenuesCount: number;
  revenuesExpectedCents: number;
  revenuesReceivedCents: number;
};

export type PlannedDocWrite<T extends { id: string }> = {
  module: ImportModuleKey;
  collectionName:
    | "annualYears"
    | "payableContracts"
    | "annualExpenses"
    | "cards"
    | "banks"
    | "revenueSources"
    | "revenueContracts"
    | "payableInstallments"
    | "monthlyBills"
    | "revenueEntries"
    | "revenueEvents"
    | "cardMonthSnapshots"
    | "fiscalReceipts";
  action: "insert" | "conflict";
  phase: 1 | 2;
  sourceId: string;
  doc: T;
  changedFields?: string[];
  label: string;
  blockedByMissingParent?: boolean;
};

export type ImportPreviewPlan = {
  sourceApp: string;
  exportedAt: string;
  totalRecordsInFile: number;
  idMap: Record<string, string>;
  emptyModulesSkipped: string[];
  unmappedNonEmptyModules: Array<{ module: string; count: number }>;
  moduleStats: ModulePreviewStats[];
  yearStats: YearPreviewStats[];
  conflicts: ImportConflictDetail[];
  unlinked: ImportUnlinkedDetail[];
  writes: Array<PlannedDocWrite<{ id: string }>>;
  totals: {
    inserts: number;
    alreadyExists: number;
    conflicts: number;
    unlinked: number;
  };
};

export type ImportExecutionReport = {
  inserted: number;
  alreadyExists: number;
  conflictsUpdated: number;
  conflictsPreserved: number;
  unlinkedCount: number;
  skippedEmptyModules: number;
  phasesCommitted: number;
  batchesCommitted: number;
  importedAt: string;
};

const MODULE_META: Array<{ module: ImportModuleKey; label: string; phase: 1 | 2 }> = [
  { module: "annual_years", label: "Exercícios Anuais", phase: 1 },
  { module: "installment_contracts", label: "Contratos a Pagar", phase: 1 },
  { module: "annual_expenses", label: "Despesas Anuais (Credores)", phase: 1 },
  { module: "finance_account_profiles", label: "Perfis de Contas & Cartões", phase: 1 },
  { module: "revenue_sources", label: "Fontes de Receita", phase: 1 },
  { module: "revenue_contracts", label: "Contratos a Receber", phase: 1 },
  { module: "annual_expense_months", label: "Despesas Anuais (Previsões Mensais)", phase: 2 },
  { module: "installment_entries", label: "Parcelas de Contratos a Pagar", phase: 2 },
  { module: "finance_bills", label: "Contas Mensais (Faturas & Guias)", phase: 2 },
  { module: "revenue_entries", label: "Recebíveis", phase: 2 },
  { module: "revenue_events", label: "Eventos / Correções de Receita", phase: 2 },
  { module: "finance_card_month_snapshots", label: "Retratos Mensais de Cartão", phase: 2 },
  { module: "fiscal_receipts", label: "Notas Fiscais & Garantias", phase: 2 },
];

const KNOWN_MODULES = new Set<string>(MODULE_META.map((m) => m.module));

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function deterministicDocId(rawId: string): string {
  const trimmed = String(rawId ?? "").trim();
  if (/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) {
    return trimmed;
  }

  let base = trimmed;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        base = parsed.map((part) => String(part ?? "")).join("__");
      }
    } catch {
      // Fallback to raw sanitization
    }
  }

  const sanitized = base.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (sanitized.length >= 1 && sanitized.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    // Only add hash if different inputs could collide on punctuation
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return sanitized;
    }
    const suffix = fnv1aHex(trimmed);
    return `${sanitized.slice(0, 118)}_${suffix}`;
  }

  return `imp_${fnv1aHex(trimmed)}`;
}

function asStr(v: unknown, max: number, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  return v.trim().slice(0, max);
}

function asNullableStr(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s.slice(0, max) : null;
}

function asInt(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Math.trunc(Number(v));
  }
  return fallback;
}

function asNullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Math.trunc(Number(v));
  }
  return null;
}

function asIsoDate(v: unknown, fallback = "2026-01-01"): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    return v.trim().slice(0, 10);
  }
  return fallback;
}

function asNullableIsoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    return v.trim().slice(0, 10);
  }
  return null;
}

function asPeriod(v: unknown, fallbackDate?: string): string {
  if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v.trim())) {
    return v.trim();
  }
  if (fallbackDate && /^\d{4}-\d{2}/.test(fallbackDate)) {
    return fallbackDate.slice(0, 7);
  }
  return "2026-01";
}

function normalizeCardBrand(v: unknown): CardBrand {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s === "VISA" || s === "MASTERCARD" || s === "ELO" || s === "AMEX" || s === "HIPERCARD") {
    return s;
  }
  return "OTHER";
}

function categoryFromAnnualMeta(
  expenseSource: AnnualExpenseSource,
  annualTaxKind: string | null,
): string {
  if (annualTaxKind) {
    return `Impostos (${annualTaxKind.toUpperCase()})`;
  }
  if (expenseSource === "card") return "Cartão de Crédito";
  if (expenseSource === "contract") return "Empréstimos & Acordos";
  if (expenseSource === "annual_tax") return "Impostos Anuais";
  return "Consumo & Fixas";
}

function parseDetailsJson(v: unknown): Record<string, number | string | boolean | null> | undefined {
  let obj: unknown = v;
  if (typeof v === "string") {
    try {
      obj = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  const clean: Record<string, number | string | boolean | null> = {};
  for (const [k, val] of Object.entries(obj as Record<string, unknown>)) {
    if (
      val === null ||
      typeof val === "number" ||
      typeof val === "string" ||
      typeof val === "boolean"
    ) {
      clean[k.slice(0, 80)] = typeof val === "string" ? val.slice(0, 200) : val;
    }
  }
  return clean;
}

function normalizeEventSnapshot(v: unknown): RevenueEventSnapshot | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const snap: RevenueEventSnapshot = {};
  if ("received_cents" in o || "receivedCents" in o) {
    snap.receivedCents = asNullableInt(o["received_cents"] ?? o["receivedCents"]);
  }
  if ("received_date" in o || "receivedDate" in o) {
    snap.receivedDate = asNullableIsoDate(o["received_date"] ?? o["receivedDate"]);
  }
  if ("note" in o) {
    snap.note = asNullableStr(o["note"], 300);
  }
  return snap;
}

function normalizeSnapshotTransactions(v: unknown): CardMonthSnapshotTransaction[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 200).map((item, idx) => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const category = asNullableStr(o["category"], 60);
    return {
      id: asStr(o["id"], 128) || `tx-${idx + 1}`,
      date: asStr(o["date"], 20),
      description: asStr(o["description"], 180) || "Lançamento",
      amount: typeof o["amount"] === "number" && Number.isFinite(o["amount"]) ? o["amount"] : 0,
      ...(category ? { category } : {}),
    };
  });
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => stableEqual(item, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const oa = a as Record<string, unknown>;
    const ob = b as Record<string, unknown>;
    const keysA = Object.keys(oa).filter((k) => oa[k] !== undefined);
    const keysB = Object.keys(ob).filter((k) => ob[k] !== undefined);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => stableEqual(oa[k], ob[k]));
  }
  return false;
}

function diffComparableFields(
  existingObj: Record<string, unknown>,
  incomingObj: Record<string, unknown>,
  keys: string[],
): string[] {
  const changed: string[] = [];
  for (const key of keys) {
    const a = existingObj[key] ?? null;
    const b = incomingObj[key] ?? null;
    if (!stableEqual(a, b)) {
      changed.push(key);
    }
  }
  return changed;
}

export function parseOrionExportJson(rawText: string): ParsedOrionExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Arquivo inválido: não foi possível interpretar o conteúdo como JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Estrutura inválida: esperado objeto raiz no formato orion-personal-data.");
  }

  const root = parsed as Record<string, unknown>;
  if (root["format"] !== "orion-personal-data") {
    throw new Error(
      `Formato não suportado ("${String(root["format"] ?? "desconhecido")}"). Esperado "orion-personal-data".`,
    );
  }
  if (root["version"] !== 1) {
    throw new Error(
      `Versão não suportada (${String(root["version"] ?? "desconhecida")}). Esperada versão 1.`,
    );
  }
  if (!Array.isArray(root["collections"])) {
    throw new Error("Estrutura inválida: campo collections[] ausente.");
  }

  const collections: OrionExportCollection[] = [];
  const byModule: Record<string, OrionExportRecord[]> = {};
  let totalRecords = 0;

  for (const entry of root["collections"]) {
    if (!entry || typeof entry !== "object") continue;
    const colObj = entry as Record<string, unknown>;
    const mod = typeof colObj["module"] === "string" ? colObj["module"].trim() : "";
    if (!mod) continue;
    const recsRaw = Array.isArray(colObj["records"]) ? colObj["records"] : [];
    const records: OrionExportRecord[] = [];
    for (const r of recsRaw) {
      if (!r || typeof r !== "object") continue;
      const recObj = r as Record<string, unknown>;
      const id = recObj["id"] !== undefined && recObj["id"] !== null ? String(recObj["id"]) : "";
      const data =
        recObj["data"] && typeof recObj["data"] === "object" && !Array.isArray(recObj["data"])
          ? (recObj["data"] as Record<string, unknown>)
          : {};
      if (!id) continue;
      records.push({ id, data });
    }
    collections.push({ module: mod, records });
    byModule[mod] = [...(byModule[mod] ?? []), ...records];
    totalRecords += records.length;
  }

  return {
    format: "orion-personal-data",
    version: 1,
    sourceApp: typeof root["sourceApp"] === "string" ? root["sourceApp"] : undefined,
    exportedAt: typeof root["exportedAt"] === "string" ? root["exportedAt"] : undefined,
    collections,
    byModule,
    totalRecords,
  };
}

function findExistingByIdOrSource<T extends { id: string; sourceRecordId?: string }>(
  list: T[],
  targetId: string,
  sourceId: string,
): T | undefined {
  return list.find((item) => item.id === targetId || item.sourceRecordId === sourceId);
}

export function buildImportPreview(
  parsed: ParsedOrionExport,
  currentState: OrionState,
): ImportPreviewPlan {
  const idMap: Record<string, string> = {};
  const statsMap = new Map<ImportModuleKey, ModulePreviewStats>();
  for (const meta of MODULE_META) {
    statsMap.set(meta.module, {
      module: meta.module,
      label: meta.label,
      phase: meta.phase,
      totalInFile: (parsed.byModule[meta.module] ?? []).length,
      inserts: 0,
      alreadyExists: 0,
      conflicts: 0,
      unlinked: 0,
      totalExpectedCents: 0,
      totalSettledCents: 0,
    });
  }

  const emptyModulesSkipped: string[] = [];
  const unmappedNonEmptyModules: Array<{ module: string; count: number }> = [];
  for (const col of parsed.collections) {
    if (col.records.length === 0) {
      emptyModulesSkipped.push(col.module);
    } else if (!KNOWN_MODULES.has(col.module)) {
      unmappedNonEmptyModules.push({ module: col.module, count: col.records.length });
    }
  }

  const conflicts: ImportConflictDetail[] = [];
  const unlinked: ImportUnlinkedDetail[] = [];
  const writes: Array<PlannedDocWrite<{ id: string }>> = [];

  // Track known IDs after Phase 1 (both existing state + incoming Phase 1)
  const knownPayableContractIds = new Set<string>(
    currentState.payableContracts.map((c) => c.id),
  );
  const knownAnnualRowIds = new Set<string>(currentState.annualExpenses.map((a) => a.id));
  const annualDueDayById = new Map<string, number>();
  for (const row of currentState.annualExpenses) {
    annualDueDayById.set(row.id, row.dueDay);
  }
  const knownRevenueSourceIds = new Set<string>(currentState.revenueSources.map((s) => s.id));
  const knownRevenueContractIds = new Set<string>(currentState.revenueContracts.map((c) => c.id));
  const knownRevenueEntryIds = new Set<string>(currentState.revenueEntries.map((e) => e.id));
  const knownAccountIds = new Set<string>([
    ...currentState.cards.map((c) => c.id),
    ...currentState.banks.map((b) => b.id),
  ]);
  const accountNameById = new Map<string, string>();
  for (const c of currentState.cards) accountNameById.set(c.id, c.name || c.institution);
  for (const b of currentState.banks) accountNameById.set(b.id, b.name || b.institution);

  const incomingAnnualRowsById = new Map<string, AnnualExpenseRow>();

  // --- PHASE 1.1: annual_years ---
  for (const rec of parsed.byModule["annual_years"] ?? []) {
    const year = asInt(rec.data["year"], 2026);
    const targetId = deterministicDocId(String(year));
    idMap[rec.id] = targetId;
    const totalExpenseCentsRaw = rec.data["totalExpenseCents"] ?? rec.data["total_expense_cents"];
    const categoryTotalsRaw = rec.data["categoryTotalsCents"] ?? rec.data["category_totals_cents"];
    const monthlyCategoryRaw =
      rec.data["monthlyCategoryCents"] ?? rec.data["monthly_category_cents"];
    const snapshotUpdatedRaw = rec.data["snapshotUpdatedAt"] ?? rec.data["snapshot_updated_at"];

    const incoming: AnnualYearRecord = {
      id: targetId,
      year,
      ...(asNullableStr(rec.data["source_name"], 140)
        ? { sourceName: asStr(rec.data["source_name"], 140) }
        : {}),
      archivedAt: asNullableStr(rec.data["archived_at"], 40),
      ...(typeof totalExpenseCentsRaw === "number" && totalExpenseCentsRaw >= 0
        ? { totalExpenseCents: Math.trunc(totalExpenseCentsRaw) }
        : {}),
      ...(categoryTotalsRaw && typeof categoryTotalsRaw === "object" && !Array.isArray(categoryTotalsRaw)
        ? { categoryTotalsCents: categoryTotalsRaw as Record<string, number> }
        : {}),
      ...(monthlyCategoryRaw && typeof monthlyCategoryRaw === "object" && !Array.isArray(monthlyCategoryRaw)
        ? { monthlyCategoryCents: monthlyCategoryRaw as Record<string, Record<string, number>> }
        : {}),
      ...(asNullableStr(snapshotUpdatedRaw, 40)
        ? { snapshotUpdatedAt: asStr(snapshotUpdatedRaw, 40) }
        : {}),
      sourceRecordId: rec.id,
    };
    const existing = findExistingByIdOrSource(currentState.annualYears, targetId, rec.id);
    const st = statsMap.get("annual_years")!;
    if (!existing) {
      st.inserts++;
      writes.push({
        module: "annual_years",
        collectionName: "annualYears",
        action: "insert",
        phase: 1,
        sourceId: rec.id,
        doc: incoming,
        label: `Exercício ${year}`,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        ["year", "sourceName", "archivedAt"],
      );
      if (changed.length === 0) {
        st.alreadyExists++;
      } else {
        st.conflicts++;
        conflicts.push({
          module: "annual_years",
          sourceId: rec.id,
          targetId: existing.id,
          label: `Exercício ${year}`,
          changedFields: changed,
        });
        writes.push({
          module: "annual_years",
          collectionName: "annualYears",
          action: "conflict",
          phase: 1,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: `Exercício ${year}`,
        });
      }
    }
  }

  // --- PHASE 1.2: installment_contracts -> payableContracts ---
  for (const rec of parsed.byModule["installment_contracts"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;
    knownPayableContractIds.add(targetId);

    const detailsJson = parseDetailsJson(rec.data["details_json"]);
    const sourceSheet = asNullableStr(rec.data["source_sheet"], 120);
    const contractCreatedAt = asNullableStr(rec.data["created_at"], 40);
    const incoming: PayableContract = {
      id: targetId,
      name: asStr(rec.data["name"], 140) || "Contrato",
      description: asStr(rec.data["description"], 300),
      ...(sourceSheet ? { sourceSheet } : {}),
      ...(detailsJson ? { detailsJson } : {}),
      archivedAt: asNullableStr(rec.data["archived_at"], 40),
      ...(contractCreatedAt ? { contractCreatedAt } : {}),
      sourceRecordId: rec.id,
    };

    const st = statsMap.get("installment_contracts")!;
    if (detailsJson && typeof detailsJson["valor_acordo_cents"] === "number") {
      st.totalExpectedCents += Math.trunc(detailsJson["valor_acordo_cents"]);
    } else if (detailsJson && typeof detailsJson["valor_contratado_cents"] === "number") {
      st.totalExpectedCents += Math.trunc(detailsJson["valor_contratado_cents"]);
    }

    const existing = findExistingByIdOrSource(currentState.payableContracts, targetId, rec.id);
    if (!existing) {
      st.inserts++;
      writes.push({
        module: "installment_contracts",
        collectionName: "payableContracts",
        action: "insert",
        phase: 1,
        sourceId: rec.id,
        doc: incoming,
        label: incoming.name,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        ["name", "description", "sourceSheet", "detailsJson", "archivedAt"],
      );
      if (changed.length === 0) {
        st.alreadyExists++;
      } else {
        st.conflicts++;
        conflicts.push({
          module: "installment_contracts",
          sourceId: rec.id,
          targetId: existing.id,
          label: incoming.name,
          changedFields: changed,
        });
        writes.push({
          module: "installment_contracts",
          collectionName: "payableContracts",
          action: "conflict",
          phase: 1,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: incoming.name,
        });
      }
    }
  }

  // --- PHASE 1.3: annual_expenses -> annualExpenses (months merged in Phase 2) ---
  for (const rec of parsed.byModule["annual_expenses"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;
    knownAnnualRowIds.add(targetId);

    const existing = findExistingByIdOrSource(currentState.annualExpenses, targetId, rec.id);
    const rawKind = rec.data["expense_kind"] === "debt" ? "debt" : "consumption";
    const rawSource: AnnualExpenseSource =
      rec.data["expense_source"] === "contract" ||
      rec.data["expense_source"] === "card" ||
      rec.data["expense_source"] === "annual_tax"
        ? (rec.data["expense_source"] as AnnualExpenseSource)
        : "consumption";
    const annualTaxKind = asNullableStr(rec.data["annual_tax_kind"], 30);
    const consumptionValueType = asNullableStr(rec.data["consumption_value_type"], 30);
    const rawSourceContractId = asNullableStr(rec.data["source_contract_id"], 128);
    const mappedContractId = rawSourceContractId
      ? (idMap[rawSourceContractId] ?? deterministicDocId(rawSourceContractId))
      : null;
    const rawSourceTemplateId = asNullableStr(rec.data["source_template_id"], 128);
    const dueDay = Math.min(31, Math.max(1, asInt(rec.data["due_day"], 10)));
    annualDueDayById.set(targetId, dueDay);

    if (mappedContractId && !knownPayableContractIds.has(mappedContractId)) {
      statsMap.get("annual_expenses")!.unlinked++;
      unlinked.push({
        module: "annual_expenses",
        sourceId: rec.id,
        label: `${asStr(rec.data["creditor"], 140)} (${asInt(rec.data["year"], 2026)})`,
        missingRefField: "source_contract_id",
        missingRefId: rawSourceContractId ?? mappedContractId,
        canStillImport: true,
      });
    }

    const rowBase: AnnualExpenseRow = {
      id: existing?.id ?? targetId,
      year: asInt(rec.data["year"], 2026),
      creditor: asStr(rec.data["creditor"], 140) || "Credor",
      category: existing?.category || categoryFromAnnualMeta(rawSource, annualTaxKind),
      dueDay,
      months: existing ? { ...existing.months } : {},
      expenseKind: rawKind as AnnualExpenseKind,
      expenseSource: rawSource,
      annualTaxKind,
      consumptionValueType,
      position: asInt(rec.data["position"], 0),
      sourceContractId: mappedContractId,
      sourceTemplateId: rawSourceTemplateId,
      sourceRecordId: rec.id,
    };

    incomingAnnualRowsById.set(rowBase.id, rowBase);
  }

  // --- PHASE 2 PRE-MERGE FOR annual_expense_months INTO annualExpenses.months ---
  const monthsStats = statsMap.get("annual_expense_months")!;
  const touchedAnnualIds = new Set<string>(incomingAnnualRowsById.keys());

  for (const rec of parsed.byModule["annual_expense_months"] ?? []) {
    const rawAnnualId = asStr(rec.data["annual_expense_id"], 128);
    const resolvedAnnualId = idMap[rawAnnualId] ?? deterministicDocId(rawAnnualId);
    const monthNum = asInt(rec.data["month"], 1);
    const mKey = String(Math.min(12, Math.max(1, monthNum))).padStart(2, "0");
    const expectedCents = asNullableInt(rec.data["expected_cents"]);

    if (expectedCents !== null) {
      monthsStats.totalExpectedCents += expectedCents;
    }

    let parentRow = incomingAnnualRowsById.get(resolvedAnnualId);
    if (!parentRow) {
      const existingParent = findExistingByIdOrSource(
        currentState.annualExpenses,
        resolvedAnnualId,
        rawAnnualId,
      );
      if (existingParent) {
        parentRow = {
          ...existingParent,
          months: { ...existingParent.months },
        };
        incomingAnnualRowsById.set(parentRow.id, parentRow);
      }
    }

    if (!parentRow) {
      monthsStats.unlinked++;
      unlinked.push({
        module: "annual_expense_months",
        sourceId: rec.id,
        label: `Mês ${mKey} (${rawAnnualId})`,
        missingRefField: "annual_expense_id",
        missingRefId: rawAnnualId,
        canStillImport: false,
      });
      continue;
    }

    touchedAnnualIds.add(parentRow.id);
    const existingParentInDb = currentState.annualExpenses.find((r) => r.id === parentRow!.id);
    const prevCellInDb = existingParentInDb?.months?.[mKey];
    const currentCell = parentRow.months[mKey];

    const mergedCell: AnnualCellState = {
      expectedCents,
      paidCents: currentCell?.paidCents ?? prevCellInDb?.paidCents ?? null,
      paidDate: currentCell?.paidDate ?? prevCellInDb?.paidDate ?? null,
      isSettled: currentCell?.isSettled ?? prevCellInDb?.isSettled ?? false,
      ...(currentCell?.note ?? prevCellInDb?.note
        ? { note: currentCell?.note ?? prevCellInDb?.note }
        : {}),
    };
    parentRow.months[mKey] = mergedCell;

    if (!prevCellInDb) {
      monthsStats.inserts++;
    } else if ((prevCellInDb.expectedCents ?? null) === expectedCents) {
      monthsStats.alreadyExists++;
    } else {
      monthsStats.conflicts++;
      conflicts.push({
        module: "annual_expense_months",
        sourceId: rec.id,
        targetId: `${parentRow.id}:${mKey}`,
        label: `${parentRow.creditor} (${parentRow.year}-${mKey})`,
        changedFields: ["expectedCents"],
      });
    }
  }

  // Classify touched AnnualExpenseRow docs
  const annualStats = statsMap.get("annual_expenses")!;
  for (const rowId of touchedAnnualIds) {
    const incomingRow = incomingAnnualRowsById.get(rowId);
    if (!incomingRow) continue;
    const rowMonthSum = Object.values(incomingRow.months).reduce(
      (s, c) => s + (c?.expectedCents ?? 0),
      0,
    );
    annualStats.totalExpectedCents += rowMonthSum;

    const existing = currentState.annualExpenses.find(
      (r) => r.id === incomingRow.id || r.sourceRecordId === incomingRow.sourceRecordId,
    );
    if (!existing) {
      annualStats.inserts++;
      writes.push({
        module: "annual_expenses",
        collectionName: "annualExpenses",
        action: "insert",
        phase: 1,
        sourceId: incomingRow.sourceRecordId ?? incomingRow.id,
        doc: incomingRow,
        label: `${incomingRow.creditor} (${incomingRow.year})`,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incomingRow as unknown as Record<string, unknown>,
        [
          "year",
          "creditor",
          "dueDay",
          "expenseKind",
          "expenseSource",
          "annualTaxKind",
          "consumptionValueType",
          "position",
          "sourceContractId",
          "sourceTemplateId",
          "months",
        ],
      );
      if (changed.length === 0) {
        annualStats.alreadyExists++;
      } else {
        annualStats.conflicts++;
        conflicts.push({
          module: "annual_expenses",
          sourceId: incomingRow.sourceRecordId ?? incomingRow.id,
          targetId: existing.id,
          label: `${incomingRow.creditor} (${incomingRow.year})`,
          changedFields: changed,
        });
        writes.push({
          module: "annual_expenses",
          collectionName: "annualExpenses",
          action: "conflict",
          phase: 1,
          sourceId: incomingRow.sourceRecordId ?? incomingRow.id,
          doc: { ...incomingRow, id: existing.id },
          changedFields: changed,
          label: `${incomingRow.creditor} (${incomingRow.year})`,
        });
      }
    }
  }

  // --- PHASE 1.4: finance_account_profiles -> cards / banks ---
  for (const rec of parsed.byModule["finance_account_profiles"] ?? []) {
    const rawAccountId = asStr(rec.data["account_id"], 128) || deterministicDocId(rec.id);
    const targetId = deterministicDocId(rawAccountId);
    idMap[rec.id] = targetId;
    idMap[rawAccountId] = targetId;

    const displayName = asStr(rec.data["display_name"], 80) || "Conta";
    const cardBrandRaw = asNullableStr(rec.data["card_brand"], 20);
    const rawAnnualId = asNullableStr(rec.data["annual_expense_id"], 128);
    const mappedAnnualId = rawAnnualId
      ? (idMap[rawAnnualId] ?? deterministicDocId(rawAnnualId))
      : null;

    knownAccountIds.add(targetId);
    accountNameById.set(targetId, displayName);

    const profStats = statsMap.get("finance_account_profiles")!;

    if (cardBrandRaw || mappedAnnualId) {
      if (mappedAnnualId && !knownAnnualRowIds.has(mappedAnnualId)) {
        profStats.unlinked++;
        unlinked.push({
          module: "finance_account_profiles",
          sourceId: rec.id,
          label: displayName,
          missingRefField: "annual_expense_id",
          missingRefId: rawAnnualId ?? mappedAnnualId,
          canStillImport: true,
        });
      }

      const existing = findExistingByIdOrSource(currentState.cards, targetId, rec.id);
      const linkedDueDay = mappedAnnualId ? (annualDueDayById.get(mappedAnnualId) ?? 25) : 25;
      const incomingCard: CreditCardAccount = {
        id: existing?.id ?? targetId,
        institution: existing?.institution || displayName,
        name: displayName,
        brand: normalizeCardBrand(cardBrandRaw),
        number: existing?.number || "0000",
        creditLimitCents: existing?.creditLimitCents ?? 0,
        availableCents: existing?.availableCents ?? 0,
        closingDay: existing?.closingDay ?? Math.max(1, linkedDueDay > 10 ? linkedDueDay - 10 : 15),
        dueDay: existing?.dueDay ?? linkedDueDay,
        ...(existing?.manualLimitCents !== undefined
          ? { manualLimitCents: existing.manualLimitCents }
          : {}),
        ...(existing?.manualUsedCents !== undefined
          ? { manualUsedCents: existing.manualUsedCents }
          : {}),
        ...(mappedAnnualId ? { linkedAnnualExpenseId: mappedAnnualId } : {}),
        sourceRecordId: rec.id,
      };

      if (!existing) {
        profStats.inserts++;
        writes.push({
          module: "finance_account_profiles",
          collectionName: "cards",
          action: "insert",
          phase: 1,
          sourceId: rec.id,
          doc: incomingCard,
          label: `${displayName} (${incomingCard.brand})`,
        });
      } else {
        const changed = diffComparableFields(
          existing as unknown as Record<string, unknown>,
          incomingCard as unknown as Record<string, unknown>,
          ["name", "brand", "linkedAnnualExpenseId"],
        );
        if (changed.length === 0) {
          profStats.alreadyExists++;
        } else {
          profStats.conflicts++;
          conflicts.push({
            module: "finance_account_profiles",
            sourceId: rec.id,
            targetId: existing.id,
            label: displayName,
            changedFields: changed,
          });
          writes.push({
            module: "finance_account_profiles",
            collectionName: "cards",
            action: "conflict",
            phase: 1,
            sourceId: rec.id,
            doc: incomingCard,
            changedFields: changed,
            label: displayName,
          });
        }
      }
    } else {
      const existing = findExistingByIdOrSource(currentState.banks, targetId, rec.id);
      const incomingBank: BankAccount = {
        id: existing?.id ?? targetId,
        institution: displayName,
        name: displayName,
        accountType: existing?.accountType ?? "CHECKING",
        number: existing?.number || "0001",
        balanceCents: existing?.balanceCents ?? 0,
        color: existing?.color || "#173d4a",
        sourceRecordId: rec.id,
      };

      if (!existing) {
        profStats.inserts++;
        writes.push({
          module: "finance_account_profiles",
          collectionName: "banks",
          action: "insert",
          phase: 1,
          sourceId: rec.id,
          doc: incomingBank,
          label: `${displayName} (Conta)`,
        });
      } else {
        const changed = diffComparableFields(
          existing as unknown as Record<string, unknown>,
          incomingBank as unknown as Record<string, unknown>,
          ["institution", "name"],
        );
        if (changed.length === 0) {
          profStats.alreadyExists++;
        } else {
          profStats.conflicts++;
          conflicts.push({
            module: "finance_account_profiles",
            sourceId: rec.id,
            targetId: existing.id,
            label: displayName,
            changedFields: changed,
          });
          writes.push({
            module: "finance_account_profiles",
            collectionName: "banks",
            action: "conflict",
            phase: 1,
            sourceId: rec.id,
            doc: incomingBank,
            changedFields: changed,
            label: displayName,
          });
        }
      }
    }
  }

  // --- PHASE 1.5: revenue_sources -> revenueSources ---
  for (const rec of parsed.byModule["revenue_sources"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;
    knownRevenueSourceIds.add(targetId);

    const firstDue = asNullableIsoDate(rec.data["first_due"]) ?? undefined;
    const dueDay = firstDue ? Math.min(31, Math.max(1, Number(firstDue.slice(8, 10)) || 10)) : 10;
    const details = asNullableStr(rec.data["details"], 400) ?? undefined;
    const expectedCents = Math.max(1, asInt(rec.data["expected_cents"], 1));
    const incoming: RevenueSource = {
      id: targetId,
      title: asStr(rec.data["title"], 140) || "Receita",
      category: asStr(rec.data["category"], 60) || "Outros",
      expectedCents,
      dueDay,
      recurrence: rec.data["recurring"] === false ? "single" : "monthly",
      active: true,
      ...(firstDue ? { firstDue } : {}),
      ...(details ? { details } : {}),
      sourceRecordId: rec.id,
    };

    const st = statsMap.get("revenue_sources")!;
    st.totalExpectedCents += expectedCents;

    const existing = findExistingByIdOrSource(currentState.revenueSources, targetId, rec.id);
    if (!existing) {
      st.inserts++;
      writes.push({
        module: "revenue_sources",
        collectionName: "revenueSources",
        action: "insert",
        phase: 1,
        sourceId: rec.id,
        doc: incoming,
        label: incoming.title,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        ["title", "category", "expectedCents", "dueDay", "recurrence", "firstDue", "details"],
      );
      if (changed.length === 0) {
        st.alreadyExists++;
      } else {
        st.conflicts++;
        conflicts.push({
          module: "revenue_sources",
          sourceId: rec.id,
          targetId: existing.id,
          label: incoming.title,
          changedFields: changed,
        });
        writes.push({
          module: "revenue_sources",
          collectionName: "revenueSources",
          action: "conflict",
          phase: 1,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: incoming.title,
        });
      }
    }
  }

  // --- PHASE 1.6: revenue_contracts (if present) ---
  for (const rec of parsed.byModule["revenue_contracts"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;
    knownRevenueContractIds.add(targetId);

    const incoming: RevenueContract = {
      id: targetId,
      title: asStr(rec.data["title"], 160) || "Contrato",
      buyer: asStr(rec.data["buyer"], 140) || "Pagador",
      cpf: asStr(rec.data["cpf"], 30),
      phone: asStr(rec.data["phone"], 40),
      email: asStr(rec.data["email"], 140),
      city: asStr(rec.data["city"], 100),
      state: asStr(rec.data["state"], 4),
      address: asStr(rec.data["address"], 200),
      postalCode: asStr(rec.data["postal_code"] ?? rec.data["postalCode"], 20),
      totalCents: Math.max(1, asInt(rec.data["total_cents"] ?? rec.data["totalCents"], 1)),
      downPaymentCents: Math.max(
        0,
        asInt(rec.data["down_payment_cents"] ?? rec.data["downPaymentCents"], 0),
      ),
      interestPercent: Number(rec.data["interest_percent"] ?? rec.data["interestPercent"] ?? 0),
      finePercent: Number(rec.data["fine_percent"] ?? rec.data["finePercent"] ?? 0),
      correctionIndex: (asStr(rec.data["correction_index"], 20) ||
        "Sem correção") as RevenueContract["correctionIndex"],
      status: (asStr(rec.data["status"], 20) || "Em andamento") as RevenueContract["status"],
      createdAt: asIsoDate(rec.data["contract_date"] ?? rec.data["created_at"], "2026-01-01"),
      ...(asNullableStr(rec.data["note"], 300)
        ? { note: asStr(rec.data["note"], 300) }
        : {}),
    };
    const st = statsMap.get("revenue_contracts")!;
    st.totalExpectedCents += incoming.totalCents;
    const existing = currentState.revenueContracts.find((c) => c.id === targetId);
    if (!existing) {
      st.inserts++;
      writes.push({
        module: "revenue_contracts",
        collectionName: "revenueContracts",
        action: "insert",
        phase: 1,
        sourceId: rec.id,
        doc: incoming,
        label: incoming.title,
      });
    } else {
      st.alreadyExists++;
    }
  }

  // --- PHASE 2.2: installment_entries -> payableInstallments ---
  for (const rec of parsed.byModule["installment_entries"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;
    const rawContractId = asStr(rec.data["contract_id"], 128);
    const resolvedContractId = idMap[rawContractId] ?? deterministicDocId(rawContractId);
    const parentMissing = !knownPayableContractIds.has(resolvedContractId);

    const expectedCents = Math.max(0, asInt(rec.data["expected_cents"], 0));
    const paidCents = asNullableInt(rec.data["paid_cents"]);
    const paidDate = asNullableIsoDate(rec.data["paid_date"]);
    const isSettled = Boolean(rec.data["is_settled"]);
    const note = asNullableStr(rec.data["note"], 300);
    const number = Math.max(1, asInt(rec.data["number"], 1));
    const dueDate = asIsoDate(rec.data["due_date"], "2026-01-01");

    const incoming: PayableInstallment = {
      id: targetId,
      contractId: resolvedContractId,
      number,
      dueDate,
      expectedCents,
      isSettled,
      paidCents,
      paidDate,
      ...(note ? { note } : {}),
      accountId: null,
      sourceRecordId: rec.id,
    };

    const st = statsMap.get("installment_entries")!;
    st.totalExpectedCents += expectedCents;
    if (paidCents !== null) st.totalSettledCents += paidCents;

    if (parentMissing) {
      st.unlinked++;
      unlinked.push({
        module: "installment_entries",
        sourceId: rec.id,
        label: `Parcela #${number} (${dueDate})`,
        missingRefField: "contract_id",
        missingRefId: rawContractId,
        canStillImport: false,
      });
      continue;
    }

    const existing = findExistingByIdOrSource(currentState.payableInstallments, targetId, rec.id);
    if (!existing) {
      st.inserts++;
      writes.push({
        module: "installment_entries",
        collectionName: "payableInstallments",
        action: "insert",
        phase: 2,
        sourceId: rec.id,
        doc: incoming,
        label: `${resolvedContractId} · Parcela ${number}`,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        ["contractId", "number", "dueDate", "expectedCents", "isSettled", "paidCents", "paidDate", "note"],
      );
      if (changed.length === 0) {
        st.alreadyExists++;
      } else {
        st.conflicts++;
        conflicts.push({
          module: "installment_entries",
          sourceId: rec.id,
          targetId: existing.id,
          label: `${resolvedContractId} · Parcela ${number}`,
          changedFields: changed,
        });
        writes.push({
          module: "installment_entries",
          collectionName: "payableInstallments",
          action: "conflict",
          phase: 2,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: `${resolvedContractId} · Parcela ${number}`,
        });
      }
    }
  }

  // --- PHASE 2.3: finance_bills -> monthlyBills ---
  for (const rec of parsed.byModule["finance_bills"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;

    const dueDate = asIsoDate(rec.data["due_date"], "2026-01-01");
    const period = asPeriod(rec.data["source_period"], dueDate);
    const rawAnnualId = asNullableStr(rec.data["source_annual_id"], 128);
    const resolvedAnnualId = rawAnnualId
      ? (idMap[rawAnnualId] ?? deterministicDocId(rawAnnualId))
      : undefined;
    const rawContractId = asNullableStr(rec.data["contract_id"], 128);
    const resolvedContractId = rawContractId
      ? (idMap[rawContractId] ?? deterministicDocId(rawContractId))
      : null;

    const billStats = statsMap.get("finance_bills")!;
    if (resolvedAnnualId && !knownAnnualRowIds.has(resolvedAnnualId)) {
      billStats.unlinked++;
      unlinked.push({
        module: "finance_bills",
        sourceId: rec.id,
        label: `${asStr(rec.data["creditor"], 140)} (${period})`,
        missingRefField: "source_annual_id",
        missingRefId: rawAnnualId ?? resolvedAnnualId,
        canStillImport: true,
      });
    }
    if (resolvedContractId && !knownPayableContractIds.has(resolvedContractId)) {
      billStats.unlinked++;
      unlinked.push({
        module: "finance_bills",
        sourceId: rec.id,
        label: `${asStr(rec.data["creditor"], 140)} (${period})`,
        missingRefField: "contract_id",
        missingRefId: rawContractId ?? resolvedContractId,
        canStillImport: true,
      });
    }

    const expectedCents = Math.max(0, asInt(rec.data["expected_cents"], 0));
    const paidCents = asNullableInt(rec.data["paid_cents"]);
    const paidDate = asNullableIsoDate(rec.data["paid_date"]);
    const isSettled = Boolean(rec.data["is_settled"]);
    const note = asNullableStr(rec.data["paid_note"], 300) ?? undefined;
    const description = asNullableStr(rec.data["description"], 200) ?? undefined;
    const expenseKind: AnnualExpenseKind =
      rec.data["expense_kind"] === "debt" ? "debt" : "consumption";
    const installmentNumber = asNullableInt(rec.data["installment_number"]);

    const category =
      resolvedContractId
        ? "Empréstimos & Acordos"
        : expenseKind === "debt"
          ? "Cartão / Dívida"
          : "Consumo & Fixas";

    const incoming: MonthlyBill = {
      id: targetId,
      period,
      creditor: asStr(rec.data["creditor"], 140) || "Credor",
      category,
      ...(description ? { description } : {}),
      dueDate,
      expectedCents,
      paidDate,
      paidCents,
      isSettled,
      ...(resolvedAnnualId ? { sourceAnnualId: resolvedAnnualId } : {}),
      contractId: resolvedContractId,
      installmentNumber,
      expenseKind,
      accountId: null,
      ...(note ? { note } : {}),
      sourceRecordId: rec.id,
    };

    billStats.totalExpectedCents += expectedCents;
    if (paidCents !== null) billStats.totalSettledCents += paidCents;

    const existing = findExistingByIdOrSource(currentState.monthlyBills, targetId, rec.id);
    if (!existing) {
      billStats.inserts++;
      writes.push({
        module: "finance_bills",
        collectionName: "monthlyBills",
        action: "insert",
        phase: 2,
        sourceId: rec.id,
        doc: incoming,
        label: `${incoming.creditor} (${period})`,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        [
          "period",
          "creditor",
          "description",
          "dueDate",
          "expectedCents",
          "paidDate",
          "paidCents",
          "isSettled",
          "sourceAnnualId",
          "contractId",
          "installmentNumber",
          "expenseKind",
          "note",
        ],
      );
      if (changed.length === 0) {
        billStats.alreadyExists++;
      } else {
        billStats.conflicts++;
        conflicts.push({
          module: "finance_bills",
          sourceId: rec.id,
          targetId: existing.id,
          label: `${incoming.creditor} (${period})`,
          changedFields: changed,
        });
        writes.push({
          module: "finance_bills",
          collectionName: "monthlyBills",
          action: "conflict",
          phase: 2,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: `${incoming.creditor} (${period})`,
        });
      }
    }
  }

  // --- PHASE 2.4: revenue_entries -> revenueEntries ---
  for (const rec of parsed.byModule["revenue_entries"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;
    knownRevenueEntryIds.add(targetId);

    const rawSourceId = asNullableStr(rec.data["source_id"], 128);
    const resolvedSourceId = rawSourceId
      ? (idMap[rawSourceId] ?? deterministicDocId(rawSourceId))
      : undefined;
    const rawContractId = asNullableStr(rec.data["contract_id"], 128);
    const resolvedContractId = rawContractId
      ? (idMap[rawContractId] ?? deterministicDocId(rawContractId))
      : undefined;

    const revStats = statsMap.get("revenue_entries")!;
    if (resolvedSourceId && !knownRevenueSourceIds.has(resolvedSourceId)) {
      revStats.unlinked++;
      unlinked.push({
        module: "revenue_entries",
        sourceId: rec.id,
        label: asStr(rec.data["title"], 160),
        missingRefField: "source_id",
        missingRefId: rawSourceId ?? resolvedSourceId,
        canStillImport: true,
      });
    }
    if (resolvedContractId && !knownRevenueContractIds.has(resolvedContractId)) {
      revStats.unlinked++;
      unlinked.push({
        module: "revenue_entries",
        sourceId: rec.id,
        label: asStr(rec.data["title"], 160),
        missingRefField: "contract_id",
        missingRefId: rawContractId ?? resolvedContractId,
        canStillImport: true,
      });
    }

    const expectedCents = Math.max(1, asInt(rec.data["expected_cents"], 1));
    const receivedCents = asNullableInt(rec.data["received_cents"]);
    const receivedDate = asNullableIsoDate(rec.data["received_date"]);
    const adjustmentCents = asNullableInt(rec.data["adjustment"]);
    const installmentNumber = asNullableInt(rec.data["number"]);
    const note = asNullableStr(rec.data["note"], 300) ?? undefined;

    const incoming: RevenueEntry = {
      id: targetId,
      ...(resolvedSourceId ? { sourceId: resolvedSourceId } : {}),
      ...(resolvedContractId ? { contractId: resolvedContractId } : {}),
      ...(installmentNumber !== null && installmentNumber >= 1 ? { installmentNumber } : {}),
      title: asStr(rec.data["title"], 160) || "Receita",
      category: asStr(rec.data["category"], 60) || "Outros",
      dueDate: asIsoDate(rec.data["due_date"], "2026-01-01"),
      expectedCents,
      receivedDate,
      receivedCents,
      adjustmentCents,
      accountId: null,
      ...(note ? { note } : {}),
      sourceRecordId: rec.id,
    };

    revStats.totalExpectedCents += expectedCents;
    if (receivedCents !== null) revStats.totalSettledCents += receivedCents;

    const existing = findExistingByIdOrSource(currentState.revenueEntries, targetId, rec.id);
    if (!existing) {
      revStats.inserts++;
      writes.push({
        module: "revenue_entries",
        collectionName: "revenueEntries",
        action: "insert",
        phase: 2,
        sourceId: rec.id,
        doc: incoming,
        label: `${incoming.title} (${incoming.dueDate})`,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        [
          "sourceId",
          "contractId",
          "installmentNumber",
          "title",
          "category",
          "dueDate",
          "expectedCents",
          "receivedDate",
          "receivedCents",
          "adjustmentCents",
          "note",
        ],
      );
      if (changed.length === 0) {
        revStats.alreadyExists++;
      } else {
        revStats.conflicts++;
        conflicts.push({
          module: "revenue_entries",
          sourceId: rec.id,
          targetId: existing.id,
          label: `${incoming.title} (${incoming.dueDate})`,
          changedFields: changed,
        });
        writes.push({
          module: "revenue_entries",
          collectionName: "revenueEntries",
          action: "conflict",
          phase: 2,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: `${incoming.title} (${incoming.dueDate})`,
        });
      }
    }
  }

  // --- PHASE 2.5: revenue_events -> revenueEvents ---
  for (const rec of parsed.byModule["revenue_events"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;

    const rawEntryId = asStr(rec.data["entry_id"], 128);
    const resolvedEntryId = idMap[rawEntryId] ?? deterministicDocId(rawEntryId);
    const evStats = statsMap.get("revenue_events")!;

    if (!knownRevenueEntryIds.has(resolvedEntryId)) {
      evStats.unlinked++;
      unlinked.push({
        module: "revenue_events",
        sourceId: rec.id,
        label: `Evento ${asStr(rec.data["kind"], 40)}`,
        missingRefField: "entry_id",
        missingRefId: rawEntryId,
        canStillImport: true,
      });
    }

    const beforeData = normalizeEventSnapshot(rec.data["before_data"]);
    const afterData = normalizeEventSnapshot(rec.data["after_data"]);
    const incoming: RevenueEvent = {
      id: targetId,
      entryId: resolvedEntryId,
      kind: asStr(rec.data["kind"], 40) || "recebimento",
      reason: asStr(rec.data["reason"], 300),
      eventCreatedAt: asStr(rec.data["created_at"], 40),
      beforeData,
      afterData,
      sourceRecordId: rec.id,
    };

    if (afterData?.receivedCents !== undefined && afterData.receivedCents !== null) {
      evStats.totalSettledCents += afterData.receivedCents;
    }

    const existing = findExistingByIdOrSource(currentState.revenueEvents, targetId, rec.id);
    if (!existing) {
      evStats.inserts++;
      writes.push({
        module: "revenue_events",
        collectionName: "revenueEvents",
        action: "insert",
        phase: 2,
        sourceId: rec.id,
        doc: incoming,
        label: `${incoming.kind} · ${incoming.entryId.slice(0, 8)}`,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        ["entryId", "kind", "reason", "eventCreatedAt", "beforeData", "afterData"],
      );
      if (changed.length === 0) {
        evStats.alreadyExists++;
      } else {
        evStats.conflicts++;
        conflicts.push({
          module: "revenue_events",
          sourceId: rec.id,
          targetId: existing.id,
          label: `${incoming.kind} · ${incoming.entryId.slice(0, 8)}`,
          changedFields: changed,
        });
        writes.push({
          module: "revenue_events",
          collectionName: "revenueEvents",
          action: "conflict",
          phase: 2,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: `${incoming.kind} · ${incoming.entryId.slice(0, 8)}`,
        });
      }
    }
  }

  // --- PHASE 2.6: finance_card_month_snapshots -> cardMonthSnapshots ---
  for (const rec of parsed.byModule["finance_card_month_snapshots"] ?? []) {
    const rawAccountId = asStr(rec.data["account_id"], 128);
    const resolvedAccountId = idMap[rawAccountId] ?? deterministicDocId(rawAccountId);
    const period = asPeriod(rec.data["period"]);
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;

    const hasAccountProfile = knownAccountIds.has(resolvedAccountId);
    const snapStats = statsMap.get("finance_card_month_snapshots")!;

    if (!hasAccountProfile) {
      snapStats.unlinked++;
      unlinked.push({
        module: "finance_card_month_snapshots",
        sourceId: rec.id,
        label: `Retrato ${period} (conta ${rawAccountId.slice(0, 8)}…)`,
        missingRefField: "account_id",
        missingRefId: rawAccountId,
        canStillImport: true,
      });
    }

    const accountName = accountNameById.get(resolvedAccountId);
    const invoiceCents = asNullableInt(rec.data["invoice_cents"]);
    const incoming: CardMonthSnapshot = {
      id: targetId,
      accountId: resolvedAccountId,
      ...(accountName ? { accountName } : {}),
      isUnlinked: !hasAccountProfile,
      period,
      capturedAt: asStr(rec.data["captured_at"], 40),
      closingDate: asNullableIsoDate(rec.data["closing_date"]),
      dueDate: asNullableIsoDate(rec.data["due_date"]),
      invoiceCents,
      providerInvoiceId: asNullableStr(rec.data["provider_invoice_id"], 128),
      totalLimitCents: asNullableInt(rec.data["total_limit_cents"]),
      availableLimitCents: asNullableInt(rec.data["available_limit_cents"]),
      usedLimitCents: asNullableInt(rec.data["used_limit_cents"]),
      transactions: normalizeSnapshotTransactions(rec.data["transactions"]),
      sourceRecordId: rec.id,
    };

    if (invoiceCents !== null) snapStats.totalExpectedCents += invoiceCents;

    const existing = findExistingByIdOrSource(currentState.cardMonthSnapshots, targetId, rec.id);
    if (!existing) {
      snapStats.inserts++;
      writes.push({
        module: "finance_card_month_snapshots",
        collectionName: "cardMonthSnapshots",
        action: "insert",
        phase: 2,
        sourceId: rec.id,
        doc: incoming,
        label: `${accountName ?? `Conta ${rawAccountId.slice(0, 8)}…`} (${period})`,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        [
          "accountId",
          "period",
          "capturedAt",
          "closingDate",
          "dueDate",
          "invoiceCents",
          "providerInvoiceId",
          "totalLimitCents",
          "availableLimitCents",
          "usedLimitCents",
          "transactions",
        ],
      );
      if (changed.length === 0) {
        snapStats.alreadyExists++;
      } else {
        snapStats.conflicts++;
        conflicts.push({
          module: "finance_card_month_snapshots",
          sourceId: rec.id,
          targetId: existing.id,
          label: `${accountName ?? `Conta ${rawAccountId.slice(0, 8)}…`} (${period})`,
          changedFields: changed,
        });
        writes.push({
          module: "finance_card_month_snapshots",
          collectionName: "cardMonthSnapshots",
          action: "conflict",
          phase: 2,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: `${accountName ?? `Conta ${rawAccountId.slice(0, 8)}…`} (${period})`,
        });
      }
    }
  }

  // --- PHASE 2.7: fiscal_receipts -> fiscalReceipts ---
  for (const rec of parsed.byModule["fiscal_receipts"] ?? []) {
    const targetId = deterministicDocId(rec.id);
    idMap[rec.id] = targetId;

    const rawKind = asStr(rec.data["kind"], 20);
    const kind: ReceiptKind =
      rawKind === "mercado" || rawKind === "aquisicoes" ? rawKind : "geral";
    const rawDocType = asStr(rec.data["doc_type"] ?? rec.data["docType"], 20);
    const docType: FiscalDocType =
      rawDocType === "nfe_55" || rawDocType === "nfse" || rawDocType === "recibo"
        ? rawDocType
        : "nfce_65";

    const rawItems = Array.isArray(rec.data["items"]) ? rec.data["items"] : [];
    const items: ReceiptItem[] = rawItems.slice(0, 150).map((rawItem) => {
      const o = rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};
      const desc = asStr(o["description"], 250) || "Item";
      const norm = normalizeProduct(
        asStr(o["normalizedName"] ?? o["normalized_name"], 250) || desc,
        asNullableStr(o["ean"], 20) ?? undefined,
      );
      const qty =
        typeof o["quantity"] === "number" && Number.isFinite(o["quantity"]) && o["quantity"] > 0
          ? o["quantity"]
          : 1;
      const unitPriceCents = Math.max(
        0,
        asInt(o["unitPriceCents"] ?? o["unit_price_cents"], 0),
      );
      const discountCents = Math.max(0, asInt(o["discountCents"] ?? o["discount_cents"], 0));
      const totalCents = Math.max(
        0,
        asInt(o["totalCents"] ?? o["total_cents"], Math.round(qty * unitPriceCents)),
      );
      return {
        ...(asNullableStr(o["code"], 40) ? { code: asStr(o["code"], 40) } : {}),
        ...(asNullableStr(o["ean"], 20) ? { ean: asStr(o["ean"], 20) } : {}),
        originalDescription: asStr(o["originalDescription"] ?? desc, 250),
        description: desc,
        normalizedName: norm.normalizedName,
        normalizedKey: norm.normalizedKey,
        ...(norm.brand ? { brand: norm.brand } : {}),
        ...(norm.packSize ? { packSize: norm.packSize } : {}),
        quantity: qty,
        unit: asStr(o["unit"], 12) || "un",
        unitPriceCents,
        ...(discountCents > 0 ? { discountCents } : {}),
        totalCents,
      };
    });

    const store = asStr(rec.data["store"], 160) || "Estabelecimento";
    const issuedAt = asIsoDate(rec.data["issued_at"] ?? rec.data["issuedAt"], "2026-01-01");
    const accessKey = extractAccessKey(
      asStr(rec.data["access_key"] ?? rec.data["accessKey"], 60),
    );
    const fileHash = asNullableStr(rec.data["file_hash"] ?? rec.data["fileHash"], 80) ?? undefined;
    const totalCents = Math.max(
      0,
      asInt(rec.data["total_cents"] ?? rec.data["totalCents"], 0),
    );
    const archiveCategory =
      asNullableStr(rec.data["archive_category"] ?? rec.data["archiveCategory"], 60) ??
      classifyArchiveCategory(store, kind, items);

    const rawStatus = asStr(rec.data["processing_status"] ?? rec.data["processingStatus"], 20);
    const processingStatus: ReceiptProcessingStatus =
      rawStatus === "partial" || rawStatus === "pending" || rawStatus === "error"
        ? rawStatus
        : "complete";
    const rawOrigin = asStr(rec.data["source_origin"] ?? rec.data["sourceOrigin"], 20);
    const sourceOrigin: ReceiptSourceOrigin =
      rawOrigin === "qr" ||
      rawOrigin === "url" ||
      rawOrigin === "xml" ||
      rawOrigin === "ocr" ||
      rawOrigin === "manual"
        ? rawOrigin
        : "import";

    const incoming: FiscalReceipt = {
      id: targetId,
      kind,
      docType,
      ...(asNullableStr(rec.data["uf"], 4) ? { uf: asStr(rec.data["uf"], 4) } : {}),
      store,
      cnpj: asStr(rec.data["cnpj"], 30),
      ...(asNullableStr(rec.data["emitter_address"] ?? rec.data["emitterAddress"], 220)
        ? { emitterAddress: asStr(rec.data["emitter_address"] ?? rec.data["emitterAddress"], 220) }
        : {}),
      issuedAt,
      ...(asNullableStr(rec.data["issued_time"] ?? rec.data["issuedTime"], 10)
        ? { issuedTime: asStr(rec.data["issued_time"] ?? rec.data["issuedTime"], 10) }
        : {}),
      accessKey,
      number: asStr(rec.data["number"], 30),
      series: asStr(rec.data["series"], 20),
      paymentMethod: asStr(rec.data["payment_method"] ?? rec.data["paymentMethod"], 80),
      ...(asInt(rec.data["discount_cents"] ?? rec.data["discountCents"], 0) > 0
        ? { discountCents: asInt(rec.data["discount_cents"] ?? rec.data["discountCents"], 0) }
        : {}),
      totalCents,
      items,
      archiveCategory,
      folderPath:
        asNullableStr(rec.data["folder_path"] ?? rec.data["folderPath"], 120) ??
        buildArchiveFolderPath(issuedAt, archiveCategory),
      ...(asNullableStr(rec.data["storage_path"] ?? rec.data["storagePath"], 400)
        ? { storagePath: asStr(rec.data["storage_path"] ?? rec.data["storagePath"], 400) }
        : {}),
      ...(asNullableStr(rec.data["file_name"] ?? rec.data["fileName"], 160)
        ? { fileName: asStr(rec.data["file_name"] ?? rec.data["fileName"], 160) }
        : {}),
      ...(asNullableStr(rec.data["file_mime_type"] ?? rec.data["fileMimeType"], 80)
        ? { fileMimeType: asStr(rec.data["file_mime_type"] ?? rec.data["fileMimeType"], 80) }
        : {}),
      ...(fileHash ? { fileHash } : {}),
      ...(asNullableStr(rec.data["document_url"] ?? rec.data["documentUrl"], 1000)
        ? { documentUrl: asStr(rec.data["document_url"] ?? rec.data["documentUrl"], 1000) }
        : {}),
      ...(asNullableStr(rec.data["source_url"] ?? rec.data["sourceUrl"], 1000)
        ? { sourceUrl: asStr(rec.data["source_url"] ?? rec.data["sourceUrl"], 1000) }
        : {}),
      ...(asNullableStr(rec.data["linked_transaction_id"] ?? rec.data["linkedTransactionId"], 128)
        ? {
            linkedTransactionId: asStr(
              rec.data["linked_transaction_id"] ?? rec.data["linkedTransactionId"],
              128,
            ),
          }
        : {}),
      processingStatus,
      sourceOrigin,
      sourceRecordId: rec.id,
    };

    const st = statsMap.get("fiscal_receipts")!;
    st.totalExpectedCents += totalCents;

    const existing = currentState.fiscalReceipts.find(
      (n) =>
        n.id === targetId ||
        n.sourceRecordId === rec.id ||
        (accessKey && n.accessKey === accessKey) ||
        (fileHash && n.fileHash === fileHash),
    );

    if (!existing) {
      st.inserts++;
      writes.push({
        module: "fiscal_receipts",
        collectionName: "fiscalReceipts",
        action: "insert",
        phase: 2,
        sourceId: rec.id,
        doc: incoming,
        label: `${store} (${issuedAt})`,
      });
    } else {
      const changed = diffComparableFields(
        existing as unknown as Record<string, unknown>,
        incoming as unknown as Record<string, unknown>,
        ["store", "issuedAt", "totalCents", "accessKey", "kind"],
      );
      const itemSig = (list: ReceiptItem[]) =>
        list.map((it) => `${it.description}|${it.quantity}|${it.totalCents}`);
      if (JSON.stringify(itemSig(existing.items ?? [])) !== JSON.stringify(itemSig(incoming.items))) {
        changed.push("items");
      }
      if (changed.length === 0) {
        st.alreadyExists++;
      } else {
        st.conflicts++;
        conflicts.push({
          module: "fiscal_receipts",
          sourceId: rec.id,
          targetId: existing.id,
          label: `${store} (${issuedAt})`,
          changedFields: changed,
        });
        writes.push({
          module: "fiscal_receipts",
          collectionName: "fiscalReceipts",
          action: "conflict",
          phase: 2,
          sourceId: rec.id,
          doc: { ...incoming, id: existing.id },
          changedFields: changed,
          label: `${store} (${issuedAt})`,
        });
      }
    }
  }

  // Compute Year Breakdown Stats (projected state preview)
  const yearSet = new Set<number>();
  for (const w of writes) {
    if (w.collectionName === "annualYears") {
      yearSet.add((w.doc as unknown as AnnualYearRecord).year);
    } else if (w.collectionName === "annualExpenses") {
      yearSet.add((w.doc as unknown as AnnualExpenseRow).year);
    } else if (w.collectionName === "monthlyBills") {
      yearSet.add(Number((w.doc as unknown as MonthlyBill).period.slice(0, 4)));
    } else if (w.collectionName === "revenueEntries") {
      yearSet.add(Number((w.doc as unknown as RevenueEntry).dueDate.slice(0, 4)));
    }
  }
  for (const y of currentState.annualYears) yearSet.add(y.year);

  const yearStatsMap = new Map<number, YearPreviewStats>();
  for (const y of [...yearSet].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)) {
    yearStatsMap.set(y, {
      year: y,
      annualRows: 0,
      annualExpectedCents: 0,
      billsCount: 0,
      billsExpectedCents: 0,
      billsPaidCents: 0,
      revenuesCount: 0,
      revenuesExpectedCents: 0,
      revenuesReceivedCents: 0,
    });
  }

  for (const rec of parsed.byModule["annual_expenses"] ?? []) {
    const y = asInt(rec.data["year"], 2026);
    const ys = yearStatsMap.get(y);
    if (ys) ys.annualRows++;
  }
  for (const [, row] of incomingAnnualRowsById) {
    const ys = yearStatsMap.get(row.year);
    if (ys) {
      for (const cell of Object.values(row.months)) {
        if (cell?.expectedCents) ys.annualExpectedCents += cell.expectedCents;
      }
    }
  }
  for (const rec of parsed.byModule["finance_bills"] ?? []) {
    const due = asIsoDate(rec.data["due_date"], "2026-01-01");
    const period = asPeriod(rec.data["source_period"], due);
    const y = Number(period.slice(0, 4));
    const ys = yearStatsMap.get(y);
    if (ys) {
      ys.billsCount++;
      ys.billsExpectedCents += Math.max(0, asInt(rec.data["expected_cents"], 0));
      ys.billsPaidCents += asNullableInt(rec.data["paid_cents"]) ?? 0;
    }
  }
  for (const rec of parsed.byModule["revenue_entries"] ?? []) {
    const due = asIsoDate(rec.data["due_date"], "2026-01-01");
    const y = Number(due.slice(0, 4));
    const ys = yearStatsMap.get(y);
    if (ys) {
      ys.revenuesCount++;
      ys.revenuesExpectedCents += Math.max(0, asInt(rec.data["expected_cents"], 0));
      ys.revenuesReceivedCents += asNullableInt(rec.data["received_cents"]) ?? 0;
    }
  }

  const moduleStats = MODULE_META.map((m) => statsMap.get(m.module)!);
  const totals = moduleStats.reduce(
    (acc, m) => ({
      inserts: acc.inserts + m.inserts,
      alreadyExists: acc.alreadyExists + m.alreadyExists,
      conflicts: acc.conflicts + m.conflicts,
      unlinked: acc.unlinked + m.unlinked,
    }),
    { inserts: 0, alreadyExists: 0, conflicts: 0, unlinked: 0 },
  );

  return {
    sourceApp: parsed.sourceApp ?? "Órion",
    exportedAt: parsed.exportedAt ?? "",
    totalRecordsInFile: parsed.totalRecords,
    idMap,
    emptyModulesSkipped,
    unmappedNonEmptyModules,
    moduleStats,
    yearStats: [...yearStatsMap.values()],
    conflicts,
    unlinked,
    writes,
    totals,
  };
}
