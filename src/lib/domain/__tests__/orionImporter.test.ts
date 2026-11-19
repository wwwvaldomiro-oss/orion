import { describe, expect, it } from "vitest";
import {
  buildImportPreview,
  deterministicDocId,
  parseOrionExportJson,
} from "@/lib/domain/orionImporter";
import { createEmptyOrionState, type OrionState } from "@/types/orion";

function buildSyntheticExportJson(overrides?: Partial<{
  format: string;
  version: number;
  collections: Array<{ module: string; records: Array<{ id: string; data: Record<string, unknown> }> }>;
}>) {
  const payload = {
    format: overrides?.format ?? "orion-personal-data",
    version: overrides?.version ?? 1,
    sourceApp: "orion-synthetic-test",
    exportedAt: "2026-11-19T12:00:00.000Z",
    collections: overrides?.collections ?? [
      {
        module: "annual_years",
        records: [{ id: "2026", data: { year: 2026, source_name: "Planilha Teste", archived_at: null } }],
      },
      {
        module: "installment_contracts",
        records: [
          {
            id: "contract-pay-1",
            data: {
              name: "Acordo Alpha",
              description: "Parcelamento sintético",
              source_sheet: "Acordos",
              details_json: JSON.stringify({ valor_acordo_cents: 120000, parcelas: 2 }),
              archived_at: null,
              created_at: "2026-01-10T00:00:00Z",
            },
          },
        ],
      },
      {
        module: "annual_expenses",
        records: [
          {
            id: "annual-row-1",
            data: {
              year: 2026,
              creditor: "Fornecedor Energia Teste",
              due_day: 12,
              expense_kind: "consumption",
              expense_source: "consumption",
              annual_tax_kind: null,
              consumption_value_type: "variable",
              position: 1,
              source_contract_id: null,
              source_template_id: "tpl-energia",
            },
          },
          {
            id: "annual-row-2",
            data: {
              year: 2026,
              creditor: "Acordo Alpha",
              due_day: 20,
              expense_kind: "debt",
              expense_source: "contract",
              annual_tax_kind: null,
              consumption_value_type: null,
              position: 2,
              source_contract_id: "contract-pay-1",
              source_template_id: null,
            },
          },
        ],
      },
      {
        module: "annual_expense_months",
        records: [
          {
            id: '["annual-row-1",1]',
            data: { annual_expense_id: "annual-row-1", month: 1, expected_cents: 25400 },
          },
          {
            id: '["annual-row-1",2]',
            data: { annual_expense_id: "annual-row-1", month: 2, expected_cents: null },
          },
        ],
      },
      {
        module: "finance_account_profiles",
        records: [
          {
            id: "profile-card-1",
            data: {
              account_id: "acc-card-1",
              display_name: "Cartão Teste Platinum",
              card_brand: "VISA",
              annual_expense_id: "annual-row-2",
            },
          },
          {
            id: "profile-bank-1",
            data: {
              account_id: "acc-bank-1",
              display_name: "Banco Exemplo Digital",
              card_brand: null,
              annual_expense_id: null,
            },
          },
        ],
      },
      {
        module: "installment_entries",
        records: [
          {
            id: "inst-entry-1",
            data: {
              contract_id: "contract-pay-1",
              number: 1,
              due_date: "2026-02-20",
              expected_cents: 60000,
              is_settled: false,
              paid_cents: 20000,
              paid_date: "2026-02-18",
              note: "Pagamento parcial teste",
            },
          },
        ],
      },
      {
        module: "finance_bills",
        records: [
          {
            id: "bill-1",
            data: {
              creditor: "Fornecedor Energia Teste",
              description: "Conta de luz jan/2026",
              source_period: "2026-01",
              due_date: "2026-01-12",
              expected_cents: 25400,
              is_settled: false,
              paid_cents: 10000,
              paid_date: "2026-01-10",
              paid_note: "Adiantamento parcial",
              source_annual_id: "annual-row-1",
              contract_id: null,
              installment_number: null,
              expense_kind: "consumption",
            },
          },
        ],
      },
      {
        module: "revenue_sources",
        records: [
          {
            id: "rev-src-1",
            data: {
              title: "Salário Teste",
              category: "Salário",
              expected_cents: 500000,
              first_due: "2026-01-05",
              recurring: true,
              details: "Fonte mensal sintética",
            },
          },
        ],
      },
      {
        module: "revenue_entries",
        records: [
          {
            id: "rev-entry-open",
            data: {
              source_id: "rev-src-1",
              title: "Salário Teste Fev",
              category: "Salário",
              due_date: "2026-02-05",
              expected_cents: 500000,
              received_cents: null,
              received_date: null,
              adjustment: null,
              note: null,
            },
          },
          {
            id: "rev-entry-paid",
            data: {
              source_id: "rev-src-1",
              title: "Salário Teste Jan",
              category: "Salário",
              due_date: "2026-01-05",
              expected_cents: 500000,
              received_cents: 500000,
              received_date: "2026-01-05",
              adjustment: 0,
              note: "Recebido integral",
            },
          },
        ],
      },
      {
        module: "revenue_events",
        records: [
          {
            id: "rev-ev-1",
            data: {
              entry_id: "rev-entry-paid",
              kind: "recebimento",
              reason: "Baixa inicial",
              created_at: "2026-01-05T10:00:00Z",
              before_data: { received_cents: null, received_date: null },
              after_data: { received_cents: 500000, received_date: "2026-01-05" },
            },
          },
        ],
      },
      {
        module: "finance_card_month_snapshots",
        records: [
          {
            id: '["acc-card-1","2026-01"]',
            data: {
              account_id: "acc-card-1",
              period: "2026-01",
              captured_at: "2026-01-31T23:50:00Z",
              closing_date: "2026-01-20",
              due_date: "2026-01-28",
              invoice_cents: 45000,
              provider_invoice_id: "inv-abc",
              total_limit_cents: 500000,
              available_limit_cents: 455000,
              used_limit_cents: 45000,
              transactions: [
                {
                  id: "tx-1",
                  date: "2026-01-14",
                  description: "Supermercado Teste",
                  amount: 450.0,
                  category: "Alimentação",
                },
              ],
            },
          },
          {
            id: '["orphan-card-xyz","2026-01"]',
            data: {
              account_id: "orphan-card-xyz",
              period: "2026-01",
              captured_at: "2026-01-31T23:55:00Z",
              closing_date: null,
              due_date: null,
              invoice_cents: null,
              provider_invoice_id: null,
              total_limit_cents: 300000,
              available_limit_cents: 300000,
              used_limit_cents: 0,
              transactions: [],
            },
          },
        ],
      },
      {
        module: "personal_agenda_items",
        records: [],
      },
    ],
  };
  return JSON.stringify(payload);
}

function applyWritesToState(baseState: OrionState, writes: ReturnType<typeof buildImportPreview>["writes"]): OrionState {
  const next: OrionState = {
    ...baseState,
    annualYears: [...baseState.annualYears],
    payableContracts: [...baseState.payableContracts],
    annualExpenses: [...baseState.annualExpenses],
    cards: [...baseState.cards],
    banks: [...baseState.banks],
    revenueSources: [...baseState.revenueSources],
    revenueContracts: [...baseState.revenueContracts],
    payableInstallments: [...baseState.payableInstallments],
    monthlyBills: [...baseState.monthlyBills],
    revenueEntries: [...baseState.revenueEntries],
    revenueEvents: [...baseState.revenueEvents],
    cardMonthSnapshots: [...baseState.cardMonthSnapshots],
  };

  for (const w of writes) {
    const list = next[w.collectionName] as Array<{ id: string }>;
    const idx = list.findIndex((item) => item.id === w.doc.id);
    if (idx >= 0) {
      list[idx] = w.doc;
    } else {
      list.push(w.doc);
    }
  }
  return next;
}

describe("orionImporter", () => {
  it("rejeita JSON inválido, formato incompatível ou versão incorreta", () => {
    expect(() => parseOrionExportJson("{bad")).toThrow(/JSON/);
    expect(() => parseOrionExportJson(buildSyntheticExportJson({ format: "outro-app" }))).toThrow(
      /Formato não suportado/,
    );
    expect(() => parseOrionExportJson(buildSyntheticExportJson({ version: 2 }))).toThrow(
      /Versão não suportada/,
    );
  });

  it("gera IDs determinísticos seguros para chaves compostas e UUIDs", () => {
    const uuidId = deterministicDocId("2d52cd73-8ea1-4d04-8b2f-27bc7b739c2b");
    expect(uuidId).toBe("2d52cd73-8ea1-4d04-8b2f-27bc7b739c2b");

    const compositeA = deterministicDocId('["annual-row-1",1]');
    const compositeB = deterministicDocId('["annual-row-1",1]');
    expect(compositeA).toBe(compositeB);
    expect(compositeA).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);

    const snapshotId = deterministicDocId('["orphan-card-xyz","2026-01"]');
    expect(snapshotId).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
  });

  it("ordena dependências em Fase 1 (pais) antes da Fase 2 (filhos) e preserva metadados", () => {
    const parsed = parseOrionExportJson(buildSyntheticExportJson());
    const preview = buildImportPreview(parsed, createEmptyOrionState());

    expect(preview.emptyModulesSkipped).toContain("personal_agenda_items");
    expect(preview.totals.inserts).toBe(16);
    expect(preview.totals.conflicts).toBe(0);

    // Fase 1 deve preceder Fase 2 ou todos os pais devem estar em writes com phase 1
    const annualWrite = preview.writes.find((w) => w.module === "annual_expenses" && w.sourceId === "annual-row-1");
    expect(annualWrite?.phase).toBe(1);
    const annualDoc = annualWrite?.doc as unknown as OrionState["annualExpenses"][number];
    expect(annualDoc.expenseKind).toBe("consumption");
    expect(annualDoc.expenseSource).toBe("consumption");
    expect(annualDoc.consumptionValueType).toBe("variable");
    expect(annualDoc.sourceTemplateId).toBe("tpl-energia");
    expect(annualDoc.months["01"]?.expectedCents).toBe(25400);
    expect(annualDoc.months["02"]?.expectedCents).toBeNull();

    // Parcelas e faturas parciais preservam paidCents/isSettled e accountId = null (sem saldo colateral)
    const billWrite = preview.writes.find((w) => w.module === "finance_bills");
    expect(billWrite?.phase).toBe(2);
    const billDoc = billWrite?.doc as unknown as OrionState["monthlyBills"][number];
    expect(billDoc.isSettled).toBe(false);
    expect(billDoc.paidCents).toBe(10000);
    expect(billDoc.accountId).toBeNull();

    const instWrite = preview.writes.find((w) => w.module === "installment_entries");
    expect(instWrite?.phase).toBe(2);
    const instDoc = instWrite?.doc as unknown as OrionState["payableInstallments"][number];
    expect(instDoc.isSettled).toBe(false);
    expect(instDoc.paidCents).toBe(20000);
    expect(instDoc.accountId).toBeNull();

    // Recebíveis em aberto preservam null
    const openRev = preview.writes.find(
      (w) => w.module === "revenue_entries" && w.sourceId === "rev-entry-open",
    )?.doc as unknown as OrionState["revenueEntries"][number];
    expect(openRev.receivedCents).toBeNull();
    expect(openRev.receivedDate).toBeNull();
  });

  it("marca retrato de cartão sem account_profile como Sem vínculo e nunca altera limite atual do cartão", () => {
    const parsed = parseOrionExportJson(buildSyntheticExportJson());
    const preview = buildImportPreview(parsed, createEmptyOrionState());

    expect(preview.unlinked.length).toBe(1);
    expect(preview.unlinked[0]?.module).toBe("finance_card_month_snapshots");
    expect(preview.unlinked[0]?.missingRefId).toBe("orphan-card-xyz");
    expect(preview.unlinked[0]?.canStillImport).toBe(true);

    const cardWrite = preview.writes.find((w) => w.collectionName === "cards")?.doc as unknown as OrionState["cards"][number];
    // Retrato histórico (45.000 usado / 500.000 limite) NÃO deve sobrescrever o cadastro atual do cartão
    expect(cardWrite.creditLimitCents).toBe(0);
    expect(cardWrite.availableCents).toBe(0);
  });

  it("é idempotente na reimportação e não apaga coleções existentes quando módulo vem vazio", () => {
    const initial = createEmptyOrionState();
    initial.personalAgenda.push({
      id: "agenda-existing-1",
      kind: "appointment",
      title: "Compromisso preservado",
      startDate: "2026-05-01",
      time: "09:00",
      description: "Não pode ser apagado por módulo vazio",
      recurrence: "none",
      favorite: false,
      reminder: false,
      items: [],
    });

    const parsed = parseOrionExportJson(buildSyntheticExportJson());
    const firstPass = buildImportPreview(parsed, initial);
    const afterFirstState = applyWritesToState(initial, firstPass.writes);

    expect(afterFirstState.personalAgenda).toHaveLength(1);

    const secondPass = buildImportPreview(parsed, afterFirstState);
    expect(secondPass.totals.inserts).toBe(0);
    expect(secondPass.totals.conflicts).toBe(0);
    expect(secondPass.writes).toHaveLength(0);
    expect(secondPass.totals.alreadyExists).toBe(16);
  });

  it("detecta conflitos quando campos do destino divergem do JSON", () => {
    const initial = createEmptyOrionState();
    const parsed = parseOrionExportJson(buildSyntheticExportJson());
    const firstPass = buildImportPreview(parsed, initial);
    const state = applyWritesToState(initial, firstPass.writes);

    // Altera expectedCents de uma conta existente no destino
    const firstBill = state.monthlyBills[0];
    expect(firstBill).toBeDefined();
    if (!firstBill) throw new Error("Expected first bill");
    state.monthlyBills[0] = {
      ...firstBill,
      expectedCents: 99999,
    };

    const conflictPreview = buildImportPreview(parsed, state);
    expect(conflictPreview.totals.conflicts).toBe(1);
    expect(conflictPreview.conflicts[0]?.module).toBe("finance_bills");
    expect(conflictPreview.conflicts[0]?.changedFields).toContain("expectedCents");
  });
});
