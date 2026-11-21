import { amountDue } from "@/lib/domain/contracts";
import { clampDueDate, formatBRL, formatDateBR } from "@/lib/domain/money";
import type { FiscalReceipt } from "@/lib/receiptAnalysis";
import type {
  OrionState,
  PaymentAttachmentRef,
  PaymentEvent,
  RevenueEvent,
  WalletTransaction,
} from "@/types/orion";

export type HistoryDirection = "payment" | "receipt";

export type DifferenceTone = "discount" | "surcharge" | "open" | "none";

export type UnifiedHistoryRow = {
  id: string;
  direction: HistoryDirection;
  party: string;
  category: string;
  description: string;
  expectedCents: number;
  dueDate: string | null;
  effectiveDate: string | null;
  isPendingDate: boolean;
  actualCents: number;
  discountCents: number;
  surchargeCents: number;
  openBalanceCents: number;
  isSettled: boolean;
  isPartial: boolean;
  differenceLabel: string;
  differenceTone: DifferenceTone;
  observation: string;
  accountId: string | null;
  accountLabel: string | null;
  bankTransactionId: string | null;
  sourceKind:
    | "payment_event"
    | "bill"
    | "installment"
    | "annual"
    | "card_invoice"
    | "revenue_event"
    | "revenue_entry";
  primaryTargetId: string;
  commitmentKey: string;
  relatedLookupIds: string[];
  inlineAttachments: PaymentAttachmentRef[];
  isCardInvoice: boolean;
  rawRefs: {
    paymentEventId?: string;
    revenueEventId?: string;
    billId?: string;
    installmentId?: string;
    contractId?: string;
    annualRowId?: string;
    period?: string;
    entryId?: string;
    cardId?: string;
  };
};

export type MonthlyHistoryGroup = {
  key: string; // YYYY-MM or "pending"
  label: string;
  isPendingGroup: boolean;
  rows: UnifiedHistoryRow[];
  distinctCount: number;
  rowCount: number;
  totalActualCents: number;
  totalExpectedCents: number;
  subtitle: string;
};

export type HistoryFilters = {
  year: string; // "all" or YYYY
  month: string; // "all" or "01".."12"
  party: string;
};

export type ResolvedAttachmentItem = {
  id: string;
  source: "attachment" | "fiscal_receipt";
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  storagePath?: string;
  documentUrl?: string;
  uploadedAt?: string;
  fiscalReceipt?: FiscalReceipt;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validIsoDate(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return trimmed;
}

export function cleanObservationText(note: string | null | undefined): string {
  if (!note) return "";
  const cleaned = note
    .replace(/Conta de origem não informada/gi, "")
    .replace(/Conta não informada/gi, "")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/^[\s·\-–—]+|[\s·\-–—]+$/g, "")
    .trim();
  return cleaned;
}

export function formatDifferenceDetails(params: {
  expectedCents: number;
  actualCents: number;
  isSettled: boolean;
  discountCents?: number | null;
  surchargeCents?: number | null;
  cumulativePaidOrReceivedCents?: number;
}): {
  differenceLabel: string;
  differenceTone: DifferenceTone;
  discountCents: number;
  surchargeCents: number;
  openBalanceCents: number;
} {
  const expected = Math.max(0, Math.round(params.expectedCents));
  const actual = Math.max(0, Math.round(params.actualCents));
  const cumulative = Math.max(actual, Math.round(params.cumulativePaidOrReceivedCents ?? actual));
  const explicitDiscount = Math.max(0, Math.round(params.discountCents ?? 0));
  const explicitSurcharge = Math.max(0, Math.round(params.surchargeCents ?? 0));

  if (!params.isSettled) {
    const openBalanceCents = Math.max(0, expected - cumulative - explicitDiscount);
    return {
      differenceLabel:
        openBalanceCents > 0 ? `Saldo: ${formatBRL(openBalanceCents)}` : "Parcial",
      differenceTone: "open",
      discountCents: explicitDiscount,
      surchargeCents: explicitSurcharge,
      openBalanceCents,
    };
  }

  const delta = cumulative - expected;
  const discount = explicitDiscount > 0 ? explicitDiscount : delta < 0 ? -delta : 0;
  const surcharge = explicitSurcharge > 0 ? explicitSurcharge : delta > 0 ? delta : 0;

  if (discount > 0 && surcharge === 0) {
    return {
      differenceLabel: `− ${formatBRL(discount)} (desconto)`,
      differenceTone: "discount",
      discountCents: discount,
      surchargeCents: 0,
      openBalanceCents: 0,
    };
  }
  if (surcharge > 0 && discount === 0) {
    return {
      differenceLabel: `+ ${formatBRL(surcharge)} (acréscimo)`,
      differenceTone: "surcharge",
      discountCents: 0,
      surchargeCents: surcharge,
      openBalanceCents: 0,
    };
  }
  if (discount > 0 && surcharge > 0) {
    const net = surcharge - discount;
    if (net < 0) {
      return {
        differenceLabel: `− ${formatBRL(-net)} (desconto líq.)`,
        differenceTone: "discount",
        discountCents: discount,
        surchargeCents: surcharge,
        openBalanceCents: 0,
      };
    }
    if (net > 0) {
      return {
        differenceLabel: `+ ${formatBRL(net)} (acréscimo líq.)`,
        differenceTone: "surcharge",
        discountCents: discount,
        surchargeCents: surcharge,
        openBalanceCents: 0,
      };
    }
  }

  return {
    differenceLabel: "—",
    differenceTone: "none",
    discountCents: 0,
    surchargeCents: 0,
    openBalanceCents: 0,
  };
}

function buildBankLabelMap(state: Pick<OrionState, "banks">): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of state.banks) {
    map.set(b.id, `${b.institution} · ${b.name}`);
  }
  return map;
}

/**
 * Resolves the active non-superseded, non-reversed cash disbursement PaymentEvents.
 * Preserves the full append-only event stream for audit trails separately.
 */
export function resolveActivePaymentEvents(events: PaymentEvent[]): PaymentEvent[] {
  const reversedIds = new Set<string>();
  const correctionReplacementByTarget = new Map<string, PaymentEvent>();

  const ordered = [...events].sort((a, b) => a.eventCreatedAt.localeCompare(b.eventCreatedAt));
  for (const ev of ordered) {
    if (ev.kind === "estorno" && ev.targetEventId) {
      reversedIds.add(ev.targetEventId);
    } else if (ev.kind === "correcao" && ev.targetEventId) {
      correctionReplacementByTarget.set(ev.targetEventId, ev);
    }
  }

  const active: PaymentEvent[] = [];
  for (const ev of ordered) {
    if (ev.kind === "estorno") continue;
    if (ev.kind === "correcao" && ev.targetEventId) continue;
    if (reversedIds.has(ev.id)) continue;

    // Follow chained corrections if an event was corrected multiple times
    let current = ev;
    const seen = new Set<string>([current.id]);
    while (correctionReplacementByTarget.has(current.id)) {
      const next = correctionReplacementByTarget.get(current.id)!;
      if (seen.has(next.id)) break;
      seen.add(next.id);
      if (reversedIds.has(next.id)) {
        current = { ...next, kind: "estorno" };
        break;
      }
      current = next;
    }

    if (current.kind === "estorno" || reversedIds.has(current.id)) continue;
    active.push(current);
  }

  return active;
}

/**
 * Resolves active non-superseded, non-reversed receipt RevenueEvents.
 */
export function resolveActiveRevenueEvents(events: RevenueEvent[]): RevenueEvent[] {
  const reversedIds = new Set<string>();
  const correctionReplacementByTarget = new Map<string, RevenueEvent>();

  const ordered = [...events].sort((a, b) => a.eventCreatedAt.localeCompare(b.eventCreatedAt));
  for (const ev of ordered) {
    if (ev.kind === "estorno" && ev.targetEventId) {
      reversedIds.add(ev.targetEventId);
    } else if (ev.kind === "correcao" && ev.targetEventId) {
      correctionReplacementByTarget.set(ev.targetEventId, ev);
    }
  }

  const active: RevenueEvent[] = [];
  for (const ev of ordered) {
    if (ev.kind === "estorno") continue;
    if (ev.kind === "correcao" && ev.targetEventId) continue;
    if (reversedIds.has(ev.id)) continue;

    let current = ev;
    const seen = new Set<string>([current.id]);
    while (correctionReplacementByTarget.has(current.id)) {
      const next = correctionReplacementByTarget.get(current.id)!;
      if (seen.has(next.id)) break;
      seen.add(next.id);
      if (reversedIds.has(next.id)) {
        current = { ...next, kind: "estorno" };
        break;
      }
      current = next;
    }

    if (current.kind === "estorno" || reversedIds.has(current.id)) continue;
    active.push(current);
  }

  return active;
}

export function buildPaymentHistoryRows(state: OrionState): UnifiedHistoryRow[] {
  const bankMap = buildBankLabelMap(state);
  const billById = new Map(state.monthlyBills.map((b) => [b.id, b]));
  const instById = new Map(state.payableInstallments.map((i) => [i.id, i]));
  const contractById = new Map(state.payableContracts.map((c) => [c.id, c]));
  const annualById = new Map(state.annualExpenses.map((a) => [a.id, a]));
  const annualByContractId = new Map<string, string>();
  for (const a of state.annualExpenses) {
    if (a.sourceContractId) annualByContractId.set(a.sourceContractId, a.id);
  }

  const rows: UnifiedHistoryRow[] = [];
  const coveredBillIds = new Set<string>();
  const coveredInstallmentIds = new Set<string>();
  const coveredAnnualPeriodKeys = new Set<string>();
  const coveredContractInstKeys = new Set<string>();

  // Track obligations explicitly reversed with no remaining active events so legacy mirrors don't resurrect them
  const explicitlyReversedTargets = new Set<string>();
  for (const ev of state.paymentEvents) {
    if (ev.kind === "estorno") {
      if (ev.billId) explicitlyReversedTargets.add(`bill:${ev.billId}`);
      if (ev.installmentId) explicitlyReversedTargets.add(`inst:${ev.installmentId}`);
      if (ev.annualRowId && ev.period) {
        explicitlyReversedTargets.add(`annual:${ev.annualRowId}:${ev.period}`);
      }
    }
  }

  const activeEvents = resolveActivePaymentEvents(state.paymentEvents);

  // Sum cumulative active payments per commitment key so openBalanceCents reflects multi-partial progress
  const activeSumByCommitment = new Map<string, number>();
  const commitmentKeyForEvent = (ev: PaymentEvent): string => {
    if (ev.billId) return `bill:${ev.billId}`;
    if (ev.installmentId) return `inst:${ev.installmentId}`;
    if (ev.annualRowId && ev.period) return `annual:${ev.annualRowId}:${ev.period}`;
    return `event:${ev.id}`;
  };

  for (const ev of activeEvents) {
    const cKey = commitmentKeyForEvent(ev);
    activeSumByCommitment.set(cKey, (activeSumByCommitment.get(cKey) ?? 0) + ev.paidCents);
  }

  for (const ev of activeEvents) {
    const linkedBill = ev.billId ? billById.get(ev.billId) : undefined;
    const linkedInst = ev.installmentId ? instById.get(ev.installmentId) : undefined;
    const contractId = ev.contractId ?? linkedBill?.contractId ?? linkedInst?.contractId ?? null;
    const installmentNumber = linkedBill?.installmentNumber ?? linkedInst?.number ?? null;
    const contract = contractId ? contractById.get(contractId) : undefined;

    if (ev.billId) coveredBillIds.add(ev.billId);
    if (ev.installmentId) coveredInstallmentIds.add(ev.installmentId);
    if (ev.annualRowId && ev.period) coveredAnnualPeriodKeys.add(`${ev.annualRowId}:${ev.period}`);
    if (linkedBill?.sourceAnnualId && linkedBill.period) {
      coveredAnnualPeriodKeys.add(`${linkedBill.sourceAnnualId}:${linkedBill.period}`);
    }
    if (contractId && installmentNumber != null) {
      coveredContractInstKeys.add(`${contractId}:${installmentNumber}`);
      const mappedAnnualId = annualByContractId.get(contractId);
      const p = ev.period ?? linkedBill?.period ?? linkedInst?.dueDate.slice(0, 7);
      if (mappedAnnualId && p) coveredAnnualPeriodKeys.add(`${mappedAnnualId}:${p}`);
    }

    const cKey = commitmentKeyForEvent(ev);
    const effectiveDate = validIsoDate(ev.paidDate);
    const expectedCents = linkedBill?.expectedCents ?? linkedInst?.expectedCents ?? ev.expectedCents;
    const cumulative = Math.max(
      activeSumByCommitment.get(cKey) ?? ev.paidCents,
      linkedBill?.paidCents ?? 0,
      linkedInst?.paidCents ?? 0,
    );
    const isSettled = Boolean(ev.isSettled || linkedBill?.isSettled || linkedInst?.isSettled);
    const diff = formatDifferenceDetails({
      expectedCents,
      actualCents: ev.paidCents,
      isSettled,
      discountCents: ev.discountCents,
      surchargeCents: ev.surchargeCents,
      cumulativePaidOrReceivedCents: cumulative,
    });

    const lookupIds = Array.from(
      new Set(
        [
          ev.id,
          ev.targetEventId,
          ev.billId,
          ev.installmentId,
          ev.annualRowId && ev.period ? `${ev.annualRowId}:${ev.period}` : undefined,
        ].filter((x): x is string => Boolean(x)),
      ),
    );

    const attachments = Array.from(
      new Map(
        [
          ...(ev.attachments ?? []),
          ...(linkedBill?.attachments ?? []),
          ...(linkedInst?.attachments ?? []),
        ].map((att) => [att.id || att.storagePath || att.fileName, att]),
      ).values(),
    );

    const accountId = ev.accountId ?? linkedBill?.accountId ?? linkedInst?.accountId ?? null;
    const isCardInvoice = Boolean(ev.cardId || linkedBill?.isCardInvoice || linkedBill?.cardId);
    const description =
      linkedBill?.description && linkedBill.description !== ev.creditor
        ? linkedBill.description
        : contract && installmentNumber
          ? `${contract.name} · Parcela #${installmentNumber}`
          : "";

    rows.push({
      id: ev.id,
      direction: "payment",
      party: ev.creditor || linkedBill?.creditor || contract?.name || "Credor",
      category: ev.category || linkedBill?.category || "Despesas",
      description,
      expectedCents,
      dueDate: validIsoDate(ev.dueDate || linkedBill?.dueDate || linkedInst?.dueDate),
      effectiveDate,
      isPendingDate: !effectiveDate,
      actualCents: ev.paidCents,
      discountCents: diff.discountCents,
      surchargeCents: diff.surchargeCents,
      openBalanceCents: diff.openBalanceCents,
      isSettled,
      isPartial: !isSettled && ev.paidCents > 0,
      differenceLabel: diff.differenceLabel,
      differenceTone: diff.differenceTone,
      observation: cleanObservationText(ev.note ?? ev.afterData?.note ?? linkedBill?.note ?? linkedInst?.note),
      accountId,
      accountLabel: accountId ? (bankMap.get(accountId) ?? accountId) : null,
      bankTransactionId: ev.bankTransactionId ?? linkedBill?.bankTransactionId ?? linkedInst?.bankTransactionId ?? null,
      sourceKind: isCardInvoice ? "card_invoice" : "payment_event",
      primaryTargetId:
        ev.billId ??
        ev.installmentId ??
        (ev.annualRowId && ev.period ? `${ev.annualRowId}:${ev.period}` : ev.id),
      commitmentKey: cKey,
      relatedLookupIds: lookupIds,
      inlineAttachments: attachments,
      isCardInvoice,
      rawRefs: {
        paymentEventId: ev.id,
        billId: ev.billId ?? undefined,
        installmentId: ev.installmentId ?? undefined,
        contractId: contractId ?? undefined,
        annualRowId: ev.annualRowId ?? linkedBill?.sourceAnnualId ?? undefined,
        period: ev.period ?? linkedBill?.period ?? undefined,
        cardId: ev.cardId ?? linkedBill?.cardId ?? undefined,
      },
    });
  }

  // Fallback 1: Legacy MonthlyBills without active PaymentEvent
  for (const b of state.monthlyBills) {
    if (coveredBillIds.has(b.id)) continue;
    const hasPaymentRecord =
      b.isSettled || (b.paidCents !== null && b.paidCents > 0) || Boolean(b.paidDate);
    if (!hasPaymentRecord) continue;
    if (
      explicitlyReversedTargets.has(`bill:${b.id}`) &&
      !b.isSettled &&
      !b.paidCents &&
      !b.paidDate
    ) {
      continue;
    }

    coveredBillIds.add(b.id);
    if (b.sourceAnnualId) coveredAnnualPeriodKeys.add(`${b.sourceAnnualId}:${b.period}`);
    if (b.contractId && b.installmentNumber != null) {
      coveredContractInstKeys.add(`${b.contractId}:${b.installmentNumber}`);
      const mappedAnnualId = annualByContractId.get(b.contractId);
      if (mappedAnnualId) coveredAnnualPeriodKeys.add(`${mappedAnnualId}:${b.period}`);
    }

    const effectiveDate = validIsoDate(b.paidDate);
    const actualCents = b.paidCents ?? (b.isSettled ? b.expectedCents : 0);
    const diff = formatDifferenceDetails({
      expectedCents: b.expectedCents,
      actualCents,
      isSettled: b.isSettled,
      discountCents: b.discountCents,
      surchargeCents: b.surchargeCents,
      cumulativePaidOrReceivedCents: actualCents,
    });
    const lookupIds = Array.from(
      new Set(
        [
          b.id,
          b.sourceAnnualId ? `${b.sourceAnnualId}:${b.period}` : undefined,
        ].filter((x): x is string => Boolean(x)),
      ),
    );

    rows.push({
      id: `bill:${b.id}`,
      direction: "payment",
      party: b.creditor,
      category: b.category,
      description: b.description && b.description !== b.creditor ? b.description : "",
      expectedCents: b.expectedCents,
      dueDate: validIsoDate(b.dueDate),
      effectiveDate,
      isPendingDate: !effectiveDate,
      actualCents,
      discountCents: diff.discountCents,
      surchargeCents: diff.surchargeCents,
      openBalanceCents: diff.openBalanceCents,
      isSettled: b.isSettled,
      isPartial: !b.isSettled && actualCents > 0,
      differenceLabel: diff.differenceLabel,
      differenceTone: diff.differenceTone,
      observation: cleanObservationText(b.note),
      accountId: b.accountId ?? null,
      accountLabel: b.accountId ? (bankMap.get(b.accountId) ?? b.accountId) : null,
      bankTransactionId: b.bankTransactionId ?? null,
      sourceKind: b.isCardInvoice ? "card_invoice" : "bill",
      primaryTargetId: b.id,
      commitmentKey: `bill:${b.id}`,
      relatedLookupIds: lookupIds,
      inlineAttachments: b.attachments ?? [],
      isCardInvoice: Boolean(b.isCardInvoice || b.cardId),
      rawRefs: {
        billId: b.id,
        contractId: b.contractId ?? undefined,
        annualRowId: b.sourceAnnualId,
        period: b.period,
        cardId: b.cardId ?? undefined,
      },
    });
  }

  // Fallback 2: Legacy PayableInstallments without active PaymentEvent or MonthlyBill mirror
  for (const inst of state.payableInstallments) {
    if (coveredInstallmentIds.has(inst.id)) continue;
    if (coveredContractInstKeys.has(`${inst.contractId}:${inst.number}`)) continue;
    const hasPaymentRecord =
      inst.isSettled || (inst.paidCents !== null && inst.paidCents > 0) || Boolean(inst.paidDate);
    if (!hasPaymentRecord) continue;

    coveredInstallmentIds.add(inst.id);
    coveredContractInstKeys.add(`${inst.contractId}:${inst.number}`);
    const mappedAnnualId = annualByContractId.get(inst.contractId);
    const period = inst.dueDate.slice(0, 7);
    if (mappedAnnualId && period) coveredAnnualPeriodKeys.add(`${mappedAnnualId}:${period}`);

    const contract = contractById.get(inst.contractId);
    const effectiveDate = validIsoDate(inst.paidDate);
    const actualCents = inst.paidCents ?? (inst.isSettled ? inst.expectedCents : 0);
    const diff = formatDifferenceDetails({
      expectedCents: inst.expectedCents,
      actualCents,
      isSettled: inst.isSettled,
      discountCents: inst.discountCents,
      surchargeCents: inst.surchargeCents,
      cumulativePaidOrReceivedCents: actualCents,
    });

    rows.push({
      id: `inst:${inst.id}`,
      direction: "payment",
      party: contract ? `${contract.name} · Parcela #${inst.number}` : `Parcela #${inst.number}`,
      category: "Contrato Parcelado",
      description: contract?.description ?? "",
      expectedCents: inst.expectedCents,
      dueDate: validIsoDate(inst.dueDate),
      effectiveDate,
      isPendingDate: !effectiveDate,
      actualCents,
      discountCents: diff.discountCents,
      surchargeCents: diff.surchargeCents,
      openBalanceCents: diff.openBalanceCents,
      isSettled: inst.isSettled,
      isPartial: !inst.isSettled && actualCents > 0,
      differenceLabel: diff.differenceLabel,
      differenceTone: diff.differenceTone,
      observation: cleanObservationText(inst.note),
      accountId: inst.accountId ?? null,
      accountLabel: inst.accountId ? (bankMap.get(inst.accountId) ?? inst.accountId) : null,
      bankTransactionId: inst.bankTransactionId ?? null,
      sourceKind: "installment",
      primaryTargetId: inst.id,
      commitmentKey: `inst:${inst.id}`,
      relatedLookupIds: [inst.id],
      inlineAttachments: inst.attachments ?? [],
      isCardInvoice: false,
      rawRefs: {
        installmentId: inst.id,
        contractId: inst.contractId,
        annualRowId: mappedAnnualId,
        period,
      },
    });
  }

  // Fallback 3: Legacy AnnualExpense cells marked paid/settled without MonthlyBill or Installment mirror
  for (const row of annualById.values()) {
    for (const [mKey, cell] of Object.entries(row.months)) {
      const p = `${row.year}-${mKey}`;
      const annKey = `${row.id}:${p}`;
      if (coveredAnnualPeriodKeys.has(annKey)) continue;
      const hasPaymentRecord =
        cell.isSettled || (cell.paidCents !== null && cell.paidCents > 0) || Boolean(cell.paidDate);
      if (!hasPaymentRecord) continue;

      const expectedCents = cell.expectedCents ?? cell.paidCents ?? 0;
      const actualCents = cell.paidCents ?? (cell.isSettled ? expectedCents : 0);
      const effectiveDate = validIsoDate(cell.paidDate);
      const dueDate = clampDueDate(row.year, Number(mKey), row.dueDay);
      const diff = formatDifferenceDetails({
        expectedCents,
        actualCents,
        isSettled: cell.isSettled,
        cumulativePaidOrReceivedCents: actualCents,
      });

      rows.push({
        id: `annual:${annKey}`,
        direction: "payment",
        party: row.creditor,
        category: row.category,
        description: `Grade Anual · ${mKey}/${row.year}`,
        expectedCents,
        dueDate: validIsoDate(dueDate),
        effectiveDate,
        isPendingDate: !effectiveDate,
        actualCents,
        discountCents: diff.discountCents,
        surchargeCents: diff.surchargeCents,
        openBalanceCents: diff.openBalanceCents,
        isSettled: cell.isSettled,
        isPartial: !cell.isSettled && actualCents > 0,
        differenceLabel: diff.differenceLabel,
        differenceTone: diff.differenceTone,
        observation: cleanObservationText(cell.note),
        accountId: null,
        accountLabel: null,
        bankTransactionId: null,
        sourceKind: "annual",
        primaryTargetId: annKey,
        commitmentKey: `annual:${annKey}`,
        relatedLookupIds: [annKey, row.id],
        inlineAttachments: [],
        isCardInvoice: row.expenseSource === "card",
        rawRefs: {
          annualRowId: row.id,
          period: p,
        },
      });
    }
  }

  return rows;
}

export function buildReceiptHistoryRows(state: OrionState): UnifiedHistoryRow[] {
  const bankMap = buildBankLabelMap(state);
  const entryById = new Map(state.revenueEntries.map((e) => [e.id, e]));
  const contractById = new Map(state.revenueContracts.map((c) => [c.id, c]));

  const rows: UnifiedHistoryRow[] = [];
  const coveredEntryIds = new Set<string>();
  const explicitlyReversedEntries = new Set<string>();
  for (const ev of state.revenueEvents) {
    if (ev.kind === "estorno" && ev.entryId) explicitlyReversedEntries.add(ev.entryId);
  }

  const activeEvents = resolveActiveRevenueEvents(state.revenueEvents);

  // Sum cumulative active receipts per entryId
  const activeSumByEntry = new Map<string, number>();
  for (const ev of activeEvents) {
    const amount = ev.afterData?.receivedCents ?? 0;
    activeSumByEntry.set(ev.entryId, (activeSumByEntry.get(ev.entryId) ?? 0) + Math.max(0, amount));
  }

  for (const ev of activeEvents) {
    const entry = entryById.get(ev.entryId);
    const amount = ev.afterData?.receivedCents ?? entry?.receivedCents ?? 0;
    const rawDate = ev.afterData?.receivedDate ?? entry?.receivedDate ?? null;
    const effectiveDate = validIsoDate(rawDate);
    if (amount <= 0 && !effectiveDate) continue;

    coveredEntryIds.add(ev.entryId);
    const contract = entry?.contractId ? contractById.get(entry.contractId) : undefined;
    const expectedCents = entry ? amountDue(entry) : amount;
    const cumulative = Math.max(
      activeSumByEntry.get(ev.entryId) ?? amount,
      entry?.receivedCents ?? 0,
    );
    const isSettled =
      ev.afterData?.isSettled !== undefined
        ? Boolean(ev.afterData.isSettled)
        : cumulative >= expectedCents;
    const diff = formatDifferenceDetails({
      expectedCents,
      actualCents: amount,
      isSettled,
      discountCents: ev.afterData?.discountCents ?? entry?.discountCents,
      surchargeCents: ev.afterData?.surchargeCents ?? entry?.surchargeCents,
      cumulativePaidOrReceivedCents: cumulative,
    });

    const accountId = ev.afterData?.accountId ?? ev.accountId ?? entry?.accountId ?? null;
    const lookupIds = Array.from(
      new Set([ev.id, ev.targetEventId, ev.entryId].filter((x): x is string => Boolean(x))),
    );
    const attachments = Array.from(
      new Map(
        [...(ev.attachments ?? []), ...(entry?.attachments ?? [])].map((att) => [
          att.id || att.storagePath || att.fileName,
          att,
        ]),
      ).values(),
    );

    rows.push({
      id: ev.id,
      direction: "receipt",
      party: entry?.title ?? contract?.title ?? `Receita ${ev.entryId.slice(0, 8)}`,
      category: entry?.category ?? "Receita",
      description: contract ? `${contract.buyer} · ${entry?.category ?? "Contrato"}` : "",
      expectedCents,
      dueDate: validIsoDate(entry?.dueDate),
      effectiveDate,
      isPendingDate: !effectiveDate,
      actualCents: amount,
      discountCents: diff.discountCents,
      surchargeCents: diff.surchargeCents,
      openBalanceCents: diff.openBalanceCents,
      isSettled,
      isPartial: !isSettled && amount > 0,
      differenceLabel: diff.differenceLabel,
      differenceTone: diff.differenceTone,
      observation: cleanObservationText(ev.afterData?.note ?? entry?.note ?? ev.reason),
      accountId,
      accountLabel: accountId ? (bankMap.get(accountId) ?? accountId) : null,
      bankTransactionId: ev.afterData?.bankTransactionId ?? ev.bankTransactionId ?? entry?.bankTransactionId ?? null,
      sourceKind: "revenue_event",
      primaryTargetId: ev.entryId,
      commitmentKey: `rev:${ev.entryId}`,
      relatedLookupIds: lookupIds,
      inlineAttachments: attachments,
      isCardInvoice: false,
      rawRefs: {
        revenueEventId: ev.id,
        entryId: ev.entryId,
        contractId: entry?.contractId,
      },
    });
  }

  // Legacy RevenueEntries not yet backed by active RevenueEvents
  for (const e of state.revenueEntries) {
    if (coveredEntryIds.has(e.id)) continue;
    const hasReceipt =
      Boolean(e.receivedDate) || (e.receivedCents !== null && e.receivedCents > 0);
    if (!hasReceipt) continue;
    if (explicitlyReversedEntries.has(e.id) && !e.receivedDate && !e.receivedCents) continue;

    const contract = e.contractId ? contractById.get(e.contractId) : undefined;
    const expectedCents = amountDue(e);
    const actualCents = e.receivedCents ?? expectedCents;
    const effectiveDate = validIsoDate(e.receivedDate);
    const isSettled = actualCents >= expectedCents;
    const diff = formatDifferenceDetails({
      expectedCents,
      actualCents,
      isSettled,
      discountCents: e.discountCents,
      surchargeCents: e.surchargeCents,
      cumulativePaidOrReceivedCents: actualCents,
    });

    rows.push({
      id: `rev:${e.id}`,
      direction: "receipt",
      party: e.title,
      category: e.category,
      description: contract ? contract.buyer : "",
      expectedCents,
      dueDate: validIsoDate(e.dueDate),
      effectiveDate,
      isPendingDate: !effectiveDate,
      actualCents,
      discountCents: diff.discountCents,
      surchargeCents: diff.surchargeCents,
      openBalanceCents: diff.openBalanceCents,
      isSettled,
      isPartial: !isSettled && actualCents > 0,
      differenceLabel: diff.differenceLabel,
      differenceTone: diff.differenceTone,
      observation: cleanObservationText(e.note),
      accountId: e.accountId ?? null,
      accountLabel: e.accountId ? (bankMap.get(e.accountId) ?? e.accountId) : null,
      bankTransactionId: e.bankTransactionId ?? null,
      sourceKind: "revenue_entry",
      primaryTargetId: e.id,
      commitmentKey: `rev:${e.id}`,
      relatedLookupIds: [e.id],
      inlineAttachments: e.attachments ?? [],
      isCardInvoice: false,
      rawRefs: {
        entryId: e.id,
        contractId: e.contractId,
      },
    });
  }

  return rows;
}

export function filterHistoryRows(
  rows: UnifiedHistoryRow[],
  filters: HistoryFilters,
): UnifiedHistoryRow[] {
  const q = filters.party
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return rows.filter((row) => {
    if (filters.year !== "all") {
      const refYear = row.effectiveDate?.slice(0, 4) ?? row.dueDate?.slice(0, 4) ?? "";
      if (refYear !== filters.year) return false;
    }
    if (filters.month !== "all") {
      if (!row.effectiveDate || row.effectiveDate.slice(5, 7) !== filters.month) {
        return false;
      }
    }
    if (q) {
      const hay = `${row.party} ${row.description} ${row.category} ${row.observation}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function formatMonthYearTitle(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  const monthName = MONTH_NAMES_PT[idx];
  if (!y || !monthName) return ym;
  return `${monthName} de ${y}`;
}

export function groupHistoryByMonth(
  rows: UnifiedHistoryRow[],
  direction: HistoryDirection,
): MonthlyHistoryGroup[] {
  const byMonth = new Map<string, UnifiedHistoryRow[]>();
  const pendingRows: UnifiedHistoryRow[] = [];

  for (const row of rows) {
    if (!row.effectiveDate || row.isPendingDate) {
      pendingRows.push(row);
      continue;
    }
    const ym = row.effectiveDate.slice(0, 7);
    byMonth.set(ym, [...(byMonth.get(ym) ?? []), row]);
  }

  const sortRows = (list: UnifiedHistoryRow[]) =>
    [...list].sort((a, b) => {
      const effCmp = (b.effectiveDate ?? "").localeCompare(a.effectiveDate ?? "");
      if (effCmp !== 0) return effCmp;
      const dueCmp = (b.dueDate ?? "").localeCompare(a.dueDate ?? "");
      if (dueCmp !== 0) return dueCmp;
      return a.party.localeCompare(b.party, "pt-BR");
    });

  const makeSummary = (list: UnifiedHistoryRow[], isPending = false) => {
    const distinctCommitments = new Set(list.map((r) => r.commitmentKey)).size;
    const totalActualCents = list.reduce((s, r) => s + r.actualCents, 0);
    const totalExpectedCents = list.reduce((s, r) => s + r.expectedCents, 0);
    const noun =
      direction === "payment"
        ? distinctCommitments === 1
          ? "compromisso pago"
          : "compromissos pagos"
        : distinctCommitments === 1
          ? "recebimento confirmado"
          : "recebimentos confirmados";
    const subtitle = isPending
      ? `${distinctCommitments} registro(s) sem data efetiva confirmada · ${formatBRL(totalActualCents)}`
      : `${distinctCommitments} ${noun} · ${formatBRL(totalActualCents)}`;
    return { distinctCommitments, totalActualCents, totalExpectedCents, subtitle };
  };

  const groups: MonthlyHistoryGroup[] = [];

  if (pendingRows.length > 0) {
    const sorted = sortRows(pendingRows);
    const s = makeSummary(sorted, true);
    groups.push({
      key: "pending",
      label: "Pendente de conferência",
      isPendingGroup: true,
      rows: sorted,
      distinctCount: s.distinctCommitments,
      rowCount: sorted.length,
      totalActualCents: s.totalActualCents,
      totalExpectedCents: s.totalExpectedCents,
      subtitle: s.subtitle,
    });
  }

  const sortedKeys = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
  for (const key of sortedKeys) {
    const sorted = sortRows(byMonth.get(key) ?? []);
    const s = makeSummary(sorted, false);
    groups.push({
      key,
      label: formatMonthYearTitle(key),
      isPendingGroup: false,
      rows: sorted,
      distinctCount: s.distinctCommitments,
      rowCount: sorted.length,
      totalActualCents: s.totalActualCents,
      totalExpectedCents: s.totalExpectedCents,
      subtitle: s.subtitle,
    });
  }

  return groups;
}

export function resolveRowAttachments(
  row: Pick<UnifiedHistoryRow, "relatedLookupIds" | "inlineAttachments">,
  fiscalReceipts: FiscalReceipt[],
): ResolvedAttachmentItem[] {
  const lookupSet = new Set(row.relatedLookupIds);
  const items: ResolvedAttachmentItem[] = [];
  const seenKeys = new Set<string>();

  for (const att of row.inlineAttachments) {
    const dedupKey = att.storagePath || att.id || att.fileName;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);
    items.push({
      id: att.id,
      source: "attachment",
      fileName: att.fileName,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      storagePath: att.storagePath,
      documentUrl: att.documentUrl,
      uploadedAt: att.uploadedAt,
    });
  }

  for (const note of fiscalReceipts) {
    if (!note.linkedTransactionId || !lookupSet.has(note.linkedTransactionId)) continue;
    const dedupKey = note.storagePath || `nf:${note.id}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);
    items.push({
      id: note.id,
      source: "fiscal_receipt",
      fileName: note.fileName || `${note.store} (${formatDateBR(note.issuedAt)})`,
      mimeType: note.fileMimeType || "application/pdf",
      storagePath: note.storagePath,
      documentUrl: note.documentUrl,
      uploadedAt: note.issuedAt,
      fiscalReceipt: note,
    });
  }

  return items;
}

export function extractAvailableHistoryYears(rows: UnifiedHistoryRow[]): string[] {
  const years = new Set<string>();
  for (const r of rows) {
    const y = r.effectiveDate?.slice(0, 4) ?? r.dueDate?.slice(0, 4);
    if (y && /^\d{4}$/.test(y)) years.add(y);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export function extractDistinctParties(rows: UnifiedHistoryRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.party.trim()) set.add(r.party.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function buildHistoryCopyReport(
  direction: HistoryDirection,
  groups: MonthlyHistoryGroup[],
  filters: HistoryFilters,
): string {
  const title =
    direction === "payment" ? "RELATÓRIO — HISTÓRICO DE PAGAMENTOS" : "RELATÓRIO — HISTÓRICO DE RECEBIMENTOS";
  const partyCol = direction === "payment" ? "Credor" : "Fonte pagadora";
  const dateCol = direction === "payment" ? "Pagamento" : "Recebimento";
  const actualCol = direction === "payment" ? "Valor pago" : "Valor recebido";

  const filterParts: string[] = [];
  filterParts.push(`Ano: ${filters.year === "all" ? "Todos" : filters.year}`);
  filterParts.push(
    `Mês: ${filters.month === "all" ? "Todos" : (MONTH_NAMES_PT[Number(filters.month) - 1] ?? filters.month)}`,
  );
  if (filters.party.trim()) filterParts.push(`${partyCol}: ${filters.party.trim()}`);

  const lines: string[] = [title, `Filtros: ${filterParts.join(" | ")}`, ""];
  let grandTotal = 0;
  let grandDistinct = 0;

  for (const g of groups) {
    grandTotal += g.totalActualCents;
    grandDistinct += g.distinctCount;
    lines.push(`${g.label.toUpperCase()} — ${g.subtitle}`);
    lines.push(`${partyCol} | Valor previsto | Vencimento | ${dateCol} | ${actualCol} | Diferença | Observação`);
    for (const r of g.rows) {
      const effText = r.isPendingDate ? "Pendente de conferência" : formatDateBR(r.effectiveDate);
      const dueText = formatDateBR(r.dueDate);
      lines.push(
        [
          r.party,
          formatBRL(r.expectedCents),
          dueText,
          effText,
          formatBRL(r.actualCents),
          r.differenceLabel,
          r.observation || "—",
        ].join(" | "),
      );
    }
    lines.push("");
  }

  lines.push(`TOTAL GERAL (${grandDistinct} registros): ${formatBRL(grandTotal)}`);
  return lines.join("\n");
}

export function suggestOpenFinanceMatches(
  transactions: WalletTransaction[],
  direction: HistoryDirection,
  accountId: string | null | undefined,
  targetCents: number,
  targetDate: string | null | undefined,
): WalletTransaction[] {
  const bankTxs = transactions.filter((t) => {
    if (t.accountType !== "BANK") return false;
    if (accountId && t.accountId !== accountId) return false;
    if (direction === "payment" && t.amountCents >= 0) return false;
    if (direction === "receipt" && t.amountCents <= 0) return false;
    return true;
  });

  const absTarget = Math.abs(targetCents);
  return [...bankTxs]
    .sort((a, b) => {
      const diffA = Math.abs(Math.abs(a.amountCents) - absTarget);
      const diffB = Math.abs(Math.abs(b.amountCents) - absTarget);
      if (diffA !== diffB) return diffA - diffB;
      if (targetDate) {
        const dA = Math.abs(Date.parse(a.date) - Date.parse(targetDate));
        const dB = Math.abs(Date.parse(b.date) - Date.parse(targetDate));
        if (Number.isFinite(dA) && Number.isFinite(dB) && dA !== dB) return dA - dB;
      }
      return b.date.localeCompare(a.date);
    })
    .slice(0, 15);
}
