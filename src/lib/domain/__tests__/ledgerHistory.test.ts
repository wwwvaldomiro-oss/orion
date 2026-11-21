import { describe, expect, it } from "vitest";
import {
  buildHistoryCopyReport,
  buildPaymentHistoryRows,
  buildReceiptHistoryRows,
  cleanObservationText,
  filterHistoryRows,
  groupHistoryByMonth,
  resolveActivePaymentEvents,
  resolveActiveRevenueEvents,
  resolveRowAttachments,
  suggestOpenFinanceMatches,
  validIsoDate,
} from "@/lib/domain/ledgerHistory";
import { createEmptyOrionState, type OrionState } from "@/types/orion";

function baseState(): OrionState {
  const s = createEmptyOrionState();
  return {
    ...s,
    banks: [
      {
        id: "bank-1",
        institution: "Banco do Brasil",
        name: "Conta Corrente",
        accountType: "CHECKING",
        number: "1234-5",
        balanceCents: 500000,
        color: "#173d4a",
      },
    ],
  };
}

describe("ledgerHistory — sanitização e validação de datas", () => {
  it("valida estritamente datas YYYY-MM-DD reais sem fabricar datas", () => {
    expect(validIsoDate("2026-11-18")).toBe("2026-11-18");
    expect(validIsoDate("2026-02-30")).toBeNull();
    expect(validIsoDate("")).toBeNull();
    expect(validIsoDate(null)).toBeNull();
    expect(validIsoDate(undefined)).toBeNull();
  });

  it("remove textos legados de conta não informada das observações", () => {
    expect(cleanObservationText("Conta de origem não informada")).toBe("");
    expect(cleanObservationText("Conta não informada · Pago via Pix")).toBe("Pago via Pix");
    expect(cleanObservationText("Quitado com desconto · Conta de origem não informada")).toBe(
      "Quitado com desconto",
    );
  });
});

describe("ledgerHistory — histórico de pagamentos", () => {
  it("agrupa pagamentos em ordem decrescente pelo mês efetivo de pagamento (nunca pelo vencimento)", () => {
    const state = baseState();
    state.monthlyBills = [
      {
        id: "bill-oct-paid-nov",
        period: "2026-10",
        creditor: "Energia CEB",
        category: "Energia & Água",
        dueDate: "2026-10-28",
        expectedCents: 35000,
        paidDate: "2026-11-03",
        paidCents: 35000,
        isSettled: true,
        accountId: "bank-1",
      },
      {
        id: "bill-oct",
        period: "2026-10",
        creditor: "Condomínio",
        category: "Moradia",
        dueDate: "2026-10-10",
        expectedCents: 80000,
        paidDate: "2026-10-10",
        paidCents: 80000,
        isSettled: true,
      },
    ];

    const rows = buildPaymentHistoryRows(state);
    const groups = groupHistoryByMonth(rows, "payment");

    expect(groups.map((g) => g.key)).toEqual(["2026-11", "2026-10"]);
    expect(groups[0]!.label).toBe("Novembro de 2026");
    expect(groups[0]!.subtitle).toContain("1 compromisso pago");
    expect(groups[0]!.rows[0]!.party).toBe("Energia CEB");
    expect(groups[1]!.label).toBe("Outubro de 2026");
  });

  it("mantém múltiplos pagamentos parciais sem duplicar contagem do compromisso e exibe saldo aberto", () => {
    const state = baseState();
    state.monthlyBills = [
      {
        id: "bill-p",
        period: "2026-11",
        creditor: "Oficina Central",
        category: "Veículo",
        dueDate: "2026-11-20",
        expectedCents: 100000,
        paidDate: "2026-11-12",
        paidCents: 70000,
        isSettled: false,
      },
    ];
    state.paymentEvents = [
      {
        id: "pev-1",
        billId: "bill-p",
        creditor: "Oficina Central",
        category: "Veículo",
        dueDate: "2026-11-20",
        expectedCents: 100000,
        paidCents: 40000,
        paidDate: "2026-11-05",
        isSettled: false,
        kind: "parcial",
        reason: "1º pagamento parcial",
        eventCreatedAt: "2026-11-05T10:00:00.000Z",
        note: "Entrada manutenção",
      },
      {
        id: "pev-2",
        billId: "bill-p",
        creditor: "Oficina Central",
        category: "Veículo",
        dueDate: "2026-11-20",
        expectedCents: 100000,
        paidCents: 30000,
        paidDate: "2026-11-12",
        isSettled: false,
        kind: "parcial",
        reason: "2º pagamento parcial",
        eventCreatedAt: "2026-11-12T15:00:00.000Z",
        note: "Parcela intermediária",
      },
    ];

    const rows = buildPaymentHistoryRows(state);
    expect(rows).toHaveLength(2);
    const groups = groupHistoryByMonth(rows, "payment");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.distinctCount).toBe(1);
    expect(groups[0]!.totalActualCents).toBe(70000);
    expect(groups[0]!.subtitle).toContain("1 compromisso pago");
    expect(groups[0]!.rows[0]!.openBalanceCents).toBe(30000);
    expect(groups[0]!.rows[0]!.differenceTone).toBe("open");
  });

  it("classifica pagamento sem data efetiva em 'Pendente de conferência' sem inventar data", () => {
    const state = baseState();
    state.monthlyBills = [
      {
        id: "bill-nodate",
        period: "2026-11",
        creditor: "IPTU Parcela",
        category: "Impostos",
        dueDate: "2026-11-15",
        expectedCents: 45000,
        paidDate: null,
        paidCents: 45000,
        isSettled: true,
      },
    ];

    const rows = buildPaymentHistoryRows(state);
    expect(rows[0]!.isPendingDate).toBe(true);
    expect(rows[0]!.effectiveDate).toBeNull();

    const groups = groupHistoryByMonth(rows, "payment");
    expect(groups[0]!.key).toBe("pending");
    expect(groups[0]!.label).toBe("Pendente de conferência");
    expect(groups[0]!.isPendingGroup).toBe(true);
  });

  it("calcula corretamente diferenças de desconto e acréscimo", () => {
    const state = baseState();
    state.paymentEvents = [
      {
        id: "pev-disc",
        creditor: "Internet Fibra",
        dueDate: "2026-11-10",
        expectedCents: 20000,
        paidCents: 18000,
        paidDate: "2026-11-08",
        discountCents: 2000,
        isSettled: true,
        kind: "pagamento",
        reason: "Pago com desconto",
        eventCreatedAt: "2026-11-08T09:00:00.000Z",
      },
      {
        id: "pev-sur",
        creditor: "Água",
        dueDate: "2026-11-01",
        expectedCents: 10000,
        paidCents: 11250,
        paidDate: "2026-11-15",
        surchargeCents: 1250,
        isSettled: true,
        kind: "pagamento",
        reason: "Pago com multa/juros",
        eventCreatedAt: "2026-11-15T09:00:00.000Z",
      },
    ];

    const rows = buildPaymentHistoryRows(state);
    const discRow = rows.find((r) => r.id === "pev-disc")!;
    const surRow = rows.find((r) => r.id === "pev-sur")!;

    expect(discRow.differenceTone).toBe("discount");
    expect(discRow.differenceLabel).toContain("desconto");
    expect(surRow.differenceTone).toBe("surcharge");
    expect(surRow.differenceLabel).toContain("acréscimo");
  });

  it("suporta quitação antecipada e fatura de cartão consolidada sem duplicação", () => {
    const state = baseState();
    state.monthlyBills = [
      {
        id: "bill-card",
        period: "2026-11",
        creditor: "Fatura Visa Infinite",
        category: "Cartões",
        dueDate: "2026-11-25",
        expectedCents: 320000,
        paidDate: "2026-11-24",
        paidCents: 320000,
        isSettled: true,
        isCardInvoice: true,
        cardId: "card-1",
      },
    ];
    state.paymentEvents = [
      {
        id: "pev-card",
        billId: "bill-card",
        cardId: "card-1",
        creditor: "Fatura Visa Infinite",
        dueDate: "2026-11-25",
        expectedCents: 320000,
        paidCents: 320000,
        paidDate: "2026-11-24",
        isSettled: true,
        kind: "pagamento",
        reason: "Pagamento da fatura",
        eventCreatedAt: "2026-11-24T12:00:00.000Z",
      },
      {
        id: "pev-early",
        installmentId: "inst-9",
        contractId: "ctr-1",
        creditor: "Financiamento · Parcela #9",
        dueDate: "2027-02-10",
        expectedCents: 150000,
        paidCents: 135000,
        paidDate: "2026-11-18",
        discountCents: 15000,
        isSettled: true,
        kind: "quitacao_antecipada",
        reason: "Antecipação de parcela",
        eventCreatedAt: "2026-11-18T14:00:00.000Z",
      },
    ];

    const rows = buildPaymentHistoryRows(state);
    expect(rows).toHaveLength(2);
    const cardRow = rows.find((r) => r.id === "pev-card")!;
    const earlyRow = rows.find((r) => r.id === "pev-early")!;
    expect(cardRow.isCardInvoice).toBe(true);
    expect(cardRow.sourceKind).toBe("card_invoice");
    expect(earlyRow.discountCents).toBe(15000);
    const groups = groupHistoryByMonth(rows, "payment");
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["pev-card", "pev-early"]);
  });

  it("aplica correções (correcao) e estornos (estorno) mantendo trilha imutável e evitando duplicação legada", () => {
    const state = baseState();
    state.monthlyBills = [
      {
        id: "bill-rev",
        period: "2026-11",
        creditor: "Seguro Auto",
        category: "Veículo",
        dueDate: "2026-11-10",
        expectedCents: 50000,
        paidDate: null,
        paidCents: null,
        isSettled: false,
      },
    ];
    state.paymentEvents = [
      {
        id: "pev-orig",
        creditor: "Academia",
        dueDate: "2026-11-05",
        expectedCents: 15000,
        paidCents: 15000,
        paidDate: "2026-11-05",
        isSettled: true,
        kind: "pagamento",
        reason: "Baixa inicial",
        eventCreatedAt: "2026-11-05T10:00:00.000Z",
      },
      {
        id: "pev-cor",
        targetEventId: "pev-orig",
        creditor: "Academia",
        dueDate: "2026-11-05",
        expectedCents: 15000,
        paidCents: 14000,
        paidDate: "2026-11-06",
        discountCents: 1000,
        isSettled: true,
        kind: "correcao",
        reason: "Ajuste para valor com desconto",
        eventCreatedAt: "2026-11-06T11:00:00.000Z",
      },
      {
        id: "pev-to-reverse",
        billId: "bill-rev",
        creditor: "Seguro Auto",
        dueDate: "2026-11-10",
        expectedCents: 50000,
        paidCents: 50000,
        paidDate: "2026-11-10",
        isSettled: true,
        kind: "pagamento",
        reason: "Baixa indevida",
        eventCreatedAt: "2026-11-10T10:00:00.000Z",
      },
      {
        id: "pev-estorno",
        billId: "bill-rev",
        targetEventId: "pev-to-reverse",
        creditor: "Seguro Auto",
        dueDate: "2026-11-10",
        expectedCents: 50000,
        paidCents: 0,
        paidDate: null,
        isSettled: false,
        kind: "estorno",
        reason: "Lançamento estornado",
        eventCreatedAt: "2026-11-11T09:00:00.000Z",
      },
    ];

    const active = resolveActivePaymentEvents(state.paymentEvents);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe("pev-cor");

    const rows = buildPaymentHistoryRows(state);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actualCents).toBe(14000);
    expect(rows[0]!.effectiveDate).toBe("2026-11-06");
  });

  it("evita duplicidade entre paymentEvents e fallbacks legados (annualExpenses, installments)", () => {
    const state = baseState();
    state.annualExpenses = [
      {
        id: "ann-1",
        year: 2026,
        creditor: "Condomínio",
        category: "Moradia",
        dueDay: 10,
        months: {
          "11": { expectedCents: 80000, paidCents: 80000, paidDate: "2026-11-10", isSettled: true },
          "10": { expectedCents: 80000, paidCents: 80000, paidDate: "2026-10-10", isSettled: true },
        },
      },
    ];
    state.paymentEvents = [
      {
        id: "pev-ann",
        annualRowId: "ann-1",
        period: "2026-11",
        creditor: "Condomínio",
        category: "Moradia",
        dueDate: "2026-11-10",
        expectedCents: 80000,
        paidCents: 80000,
        paidDate: "2026-11-10",
        isSettled: true,
        kind: "pagamento",
        reason: "Quitado",
        eventCreatedAt: "2026-11-10T10:00:00.000Z",
      },
    ];

    const rows = buildPaymentHistoryRows(state);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.effectiveDate === "2026-11-10")).toHaveLength(1);
    expect(rows.filter((r) => r.effectiveDate === "2026-10-10")).toHaveLength(1);
  });
});

describe("ledgerHistory — histórico de recebimentos e anexos", () => {
  it("resolve eventos de receita com correção, estorno e fallback legado sem duplicação", () => {
    const state = baseState();
    state.revenueEntries = [
      {
        id: "re-1",
        title: "Aluguel Apartamento",
        category: "Aluguel",
        dueDate: "2026-11-05",
        expectedCents: 250000,
        receivedDate: "2026-11-06",
        receivedCents: 260000,
        surchargeCents: 10000,
        accountId: "bank-1",
      },
      {
        id: "re-legacy",
        title: "Consultoria Legada",
        category: "Honorários",
        dueDate: "2026-10-15",
        expectedCents: 120000,
        receivedDate: "2026-10-15",
        receivedCents: 120000,
      },
    ];
    state.revenueEvents = [
      {
        id: "rev-1",
        entryId: "re-1",
        kind: "recebimento",
        reason: "Recebido com 1 dia de atraso",
        eventCreatedAt: "2026-11-06T09:00:00.000Z",
        afterData: {
          receivedDate: "2026-11-06",
          receivedCents: 250000,
          isSettled: true,
        },
      },
      {
        id: "rev-1-fix",
        entryId: "re-1",
        targetEventId: "rev-1",
        kind: "correcao",
        reason: "Inclusão de multa por atraso",
        eventCreatedAt: "2026-11-07T09:00:00.000Z",
        afterData: {
          receivedDate: "2026-11-06",
          receivedCents: 260000,
          surchargeCents: 10000,
          isSettled: true,
          note: "Pix com juros",
        },
      },
    ];

    const active = resolveActiveRevenueEvents(state.revenueEvents);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe("rev-1-fix");

    const rows = buildReceiptHistoryRows(state);
    expect(rows).toHaveLength(2);
    const novRow = rows.find((r) => r.primaryTargetId === "re-1")!;
    expect(novRow.actualCents).toBe(260000);
    expect(novRow.differenceTone).toBe("surcharge");
    expect(novRow.observation).toBe("Pix com juros");
  });

  it("mescla e deduplica comprovantes inline e fiscalReceipts vinculados ao registro", () => {
    const state = baseState();
    state.paymentEvents = [
      {
        id: "pev-att",
        billId: "bill-att",
        creditor: "Fornecedor Alpha",
        dueDate: "2026-11-10",
        expectedCents: 50000,
        paidCents: 50000,
        paidDate: "2026-11-10",
        isSettled: true,
        kind: "pagamento",
        reason: "Pago",
        eventCreatedAt: "2026-11-10T12:00:00.000Z",
        attachments: [
          {
            id: "att-1",
            fileName: "comprovante-pix.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12000,
            storagePath: "users/u1/fiscalReceipts/bill-att/pix.pdf",
            uploadedAt: "2026-11-10T12:01:00.000Z",
          },
        ],
      },
    ];
    state.fiscalReceipts = [
      {
        id: "nf-1",
        kind: "geral",
        store: "Fornecedor Alpha",
        cnpj: "00.000.000/0001-00",
        issuedAt: "2026-11-10",
        accessKey: "123",
        number: "1",
        series: "1",
        paymentMethod: "Pix",
        totalCents: 50000,
        items: [],
        archiveCategory: "Serviços",
        linkedTransactionId: "bill-att",
        storagePath: "users/u1/fiscalReceipts/nf-1/nota.pdf",
        fileName: "nota-fiscal.pdf",
        fileMimeType: "application/pdf",
      },
      {
        id: "nf-dup",
        kind: "geral",
        store: "Fornecedor Alpha",
        cnpj: "00.000.000/0001-00",
        issuedAt: "2026-11-10",
        accessKey: "124",
        number: "2",
        series: "1",
        paymentMethod: "Pix",
        totalCents: 50000,
        items: [],
        archiveCategory: "Serviços",
        linkedTransactionId: "pev-att",
        storagePath: "users/u1/fiscalReceipts/bill-att/pix.pdf",
        fileName: "comprovante-pix.pdf",
        fileMimeType: "application/pdf",
      },
    ];

    const rows = buildPaymentHistoryRows(state);
    const items = resolveRowAttachments(rows[0]!, state.fiscalReceipts);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.fileName)).toEqual(["comprovante-pix.pdf", "nota-fiscal.pdf"]);
  });

  it("filtra sem diferenciar acentos e gera relatório textual coerente", () => {
    const state = baseState();
    state.paymentEvents = [
      {
        id: "p1",
        creditor: "Condomínio São José",
        dueDate: "2026-11-10",
        expectedCents: 80000,
        paidCents: 80000,
        paidDate: "2026-11-10",
        isSettled: true,
        kind: "pagamento",
        reason: "Pago",
        eventCreatedAt: "2026-11-10T10:00:00.000Z",
      },
      {
        id: "p2",
        creditor: "Energia",
        dueDate: "2026-10-15",
        expectedCents: 20000,
        paidCents: 20000,
        paidDate: "2026-10-15",
        isSettled: true,
        kind: "pagamento",
        reason: "Pago",
        eventCreatedAt: "2026-10-15T10:00:00.000Z",
      },
    ];

    const rows = buildPaymentHistoryRows(state);
    const filters = { year: "2026", month: "11", party: "sao jose" };
    const filtered = filterHistoryRows(rows, filters);
    expect(filtered).toHaveLength(1);

    const groups = groupHistoryByMonth(filtered, "payment");
    const report = buildHistoryCopyReport("payment", groups, filters);
    expect(report).toContain("RELATÓRIO — HISTÓRICO DE PAGAMENTOS");
    expect(report).toContain("NOVEMBRO DE 2026");
    expect(report).toContain("Condomínio São José");
    expect(report).toContain("TOTAL GERAL (1 registros): R$ 800,00");
  });

  it("sugere transações Open Finance compatíveis por direção, conta e proximidade de valor", () => {
    const state = baseState();
    state.transactions = [
      {
        id: "tx-in",
        accountId: "bank-1",
        accountType: "BANK",
        accountName: "CC",
        institution: "BB",
        description: "PIX RECEBIDO",
        amountCents: 80000,
        date: "2026-11-10",
        category: "Transferência",
      },
      {
        id: "tx-exact",
        accountId: "bank-1",
        accountType: "BANK",
        accountName: "CC",
        institution: "BB",
        description: "PAGAMENTO BOLETO",
        amountCents: -80000,
        date: "2026-11-10",
        category: "Moradia",
      },
      {
        id: "tx-card",
        accountId: "card-1",
        accountType: "CREDIT",
        accountName: "Visa",
        institution: "BB",
        description: "COMPRA CARTAO",
        amountCents: -80000,
        date: "2026-11-10",
        category: "Compras",
      },
    ];

    const payMatches = suggestOpenFinanceMatches(
      state.transactions,
      "payment",
      "bank-1",
      80000,
      "2026-11-10",
    );
    expect(payMatches).toHaveLength(1);
    expect(payMatches[0]!.id).toBe("tx-exact");

    const recMatches = suggestOpenFinanceMatches(
      state.transactions,
      "receipt",
      "bank-1",
      80000,
      "2026-11-10",
    );
    expect(recMatches).toHaveLength(1);
    expect(recMatches[0]!.id).toBe("tx-in");
  });
});
