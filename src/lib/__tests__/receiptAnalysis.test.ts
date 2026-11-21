import { describe, expect, it } from "vitest";
import {
  buildFiscalExportPackage,
  cleanName,
  computeMarketIntelligence,
  extractAccessKey,
  normalizeProduct,
  receiptReport,
  suggestReceiptKind,
  suggestTransactionMatches,
  type FiscalReceipt,
} from "@/lib/receiptAnalysis";
import { buildImportPreview, parseOrionExportJson } from "@/lib/domain/orionImporter";
import { createEmptyOrionState, type OrionState } from "@/types/orion";

describe("receiptAnalysis", () => {
  it("normaliza nomes com acentuação e espaços extras", () => {
    expect(cleanName("  Supermercado São João  ")).toBe("supermercado sao joao");
    expect(cleanName("Café & Pão 100%")).toBe("cafe pao 100");
  });

  it("extrai chave de acesso de 44 dígitos de URL de QR Code ou texto", () => {
    const key = "53261112345678000190650010000123451000123456";
    expect(extractAccessKey(`https://www.fazenda.df.gov.br/nfce/qrcode?p=${key}|2|1|1|abc`)).toBe(key);
    expect(extractAccessKey("5326 1112 3456 7800 0190 6500 1000 0123 4510 0012 3456")).toBe(key);
    expect(extractAccessKey("chave-invalida-123")).toBe("");
  });

  it("sugere tipo de nota fiscal conforme estabelecimento", () => {
    expect(suggestReceiptKind("Supermercado Atacadão DF")).toBe("mercado");
    expect(suggestReceiptKind("Magazine Luiza S/A")).toBe("aquisicoes");
    expect(suggestReceiptKind("Papelaria Central")).toBe("geral");
  });

  it("consolida produtos e estabelecimentos corretamente", () => {
    const notes: FiscalReceipt[] = [
      {
        id: "n1",
        kind: "mercado",
        store: "Mercado Teste",
        cnpj: "",
        issuedAt: "2026-11-10",
        accessKey: "",
        number: "1",
        series: "1",
        paymentMethod: "Pix",
        totalCents: 3500,
        items: [
          { description: "Café Torrado", quantity: 2, unit: "un", unitPriceCents: 1500, totalCents: 3000 },
          { description: "Pão Francês", quantity: 1, unit: "un", unitPriceCents: 500, totalCents: 500 },
        ],
      },
      {
        id: "n2",
        kind: "mercado",
        store: "Mercado Teste",
        cnpj: "",
        issuedAt: "2026-11-15",
        accessKey: "",
        number: "2",
        series: "1",
        paymentMethod: "Crédito",
        totalCents: 1800,
        items: [
          { description: "Cafe torrado", quantity: 1, unit: "un", unitPriceCents: 1800, totalCents: 1800 },
        ],
      },
    ];

    const report = receiptReport(notes);
    expect(report.stores).toHaveLength(1);
    expect(report.stores[0]?.visits).toBe(2);
    expect(report.stores[0]?.totalCents).toBe(5300);

    const cafe = report.products.find((p) => cleanName(p.name) === "cafe torrado");
    expect(cafe?.count).toBe(2);
    expect(cafe?.quantity).toBe(3);
    expect(cafe?.averageCents).toBe(1600);
    expect(cafe?.minCents).toBe(1500);
    expect(cafe?.maxCents).toBe(1800);
  });

  it("normaliza produtos preservando diferenças de embalagem e agrupando sinônimos", () => {
    const a = normalizeProduct("ARROZ BRANCO T1 PAC 5KG");
    const b = normalizeProduct("Arroz Tipo 1 Pacote 5 kg");
    const c = normalizeProduct("Arroz Tipo 1 1kg");

    expect(a.packSize).toBe("5kg");
    expect(b.packSize).toBe("5kg");
    expect(a.normalizedKey).toBe(b.normalizedKey);
    expect(c.packSize).toBe("1kg");
    expect(a.normalizedKey).not.toBe(c.normalizedKey);
  });

  it("calcula os 10 indicadores de Mercado com aumento/queda percentual e frequência média", () => {
    const notes: FiscalReceipt[] = [
      {
        id: "m1",
        kind: "mercado",
        store: "Atacadão DF",
        cnpj: "",
        issuedAt: "2026-10-01",
        accessKey: "",
        number: "1",
        series: "1",
        paymentMethod: "Pix",
        discountCents: 200,
        totalCents: 5200,
        items: [
          { description: "ARROZ BRANCO T1 5KG", quantity: 1, unit: "UN", unitPriceCents: 2500, totalCents: 2500 },
          { description: "CAFE MOIDO 500G", quantity: 1, unit: "UN", unitPriceCents: 2000, totalCents: 2000 },
          { description: "BANANA PRATA", quantity: 1.5, unit: "KG", unitPriceCents: 600, totalCents: 900 },
        ],
      },
      {
        id: "m2",
        kind: "mercado",
        store: "Supermercado Asa Norte",
        cnpj: "",
        issuedAt: "2026-10-15",
        accessKey: "",
        number: "2",
        series: "1",
        paymentMethod: "Cartão de Crédito",
        discountCents: 0,
        totalCents: 4600,
        items: [
          { description: "ARROZ TIPO 1 PACOTE 5 KG", quantity: 1, unit: "UN", unitPriceCents: 3000, totalCents: 3000 },
          { description: "CAFE TORRADO E MOIDO 500G", quantity: 1, unit: "UN", unitPriceCents: 1600, totalCents: 1600 },
        ],
      },
    ];

    const intel = computeMarketIntelligence(notes, { kind: "mercado" });
    expect(intel.totalSpentCents).toBe(9800);
    expect(intel.totalDiscountCents).toBe(200);
    expect(intel.receiptCount).toBe(2);
    expect(intel.monthlySeries).toEqual([{ month: "2026-10", totalCents: 9800, visits: 2 }]);
    expect(intel.storeComparison).toHaveLength(2);
    expect(intel.priceIncreases[0]?.changePercent).toBe(20); // 25 -> 30
    expect(intel.priceDrops[0]?.changePercent).toBe(-20); // 20 -> 16
    expect(intel.frequencyByProduct[0]?.avgIntervalDays).toBe(14);
    expect(intel.highestUnitPrice[0]?.maxCents).toBe(3000);
  });

  it("sugere vínculo financeiro com Pix, Crédito e Pluggy sem duplicar despesa", () => {
    const matches = suggestTransactionMatches(
      { store: "Supermercado Central DF", issuedAt: "2026-11-10", totalCents: 12540, paymentMethod: "Pix" },
      [
        {
          id: "tx-pix-1",
          accountId: "bank-1",
          accountName: "Banco Inter",
          accountType: "BANK",
          institution: "Inter",
          description: "PIX SUPERMERCADO CENTRAL",
          amountCents: -12540,
          date: "2026-11-10",
          category: "Mercado",
        },
        {
          id: "pluggy_tx_99",
          accountId: "card-1",
          accountName: "Visa Infinite",
          accountType: "CREDIT",
          institution: "Caixa",
          description: "FARMACIA DROGASIL",
          amountCents: -28900,
          date: "2026-11-10",
          category: "Saúde",
        },
        {
          id: "pluggy_tx_100",
          accountId: "card-1",
          accountName: "Visa Infinite",
          accountType: "CREDIT",
          institution: "Caixa",
          description: "MERCADO CENTRAL DF",
          amountCents: -12540,
          date: "2026-11-11",
          category: "Mercado",
        },
      ],
      [
        {
          id: "card-1",
          institution: "Caixa",
          name: "Visa Infinite",
          brand: "VISA",
          number: "4455",
          creditLimitCents: 1000000,
          availableCents: 800000,
          closingDay: 5,
          dueDay: 15,
        },
      ],
      [
        {
          id: "bank-1",
          institution: "Inter",
          name: "Banco Inter",
          accountType: "CHECKING",
          number: "0001",
          balanceCents: 250000,
          color: "#173d4a",
        },
      ],
    );

    expect(matches).toHaveLength(2);
    expect(matches[0]?.transaction.id).toBe("tx-pix-1");
    expect(matches[0]?.amountDiffCents).toBe(0);
    expect(matches[0]?.paymentChannel).toContain("Pix / Débito");
    expect(matches[1]?.transaction.id).toBe("pluggy_tx_100");
    expect(matches[1]?.paymentChannel).toContain("Pluggy · Cartão de Crédito");
  });

  it("exporta pacote universal e evita duplicação por accessKey na reimportação", () => {
    const receipt: FiscalReceipt = {
      id: "nf-1",
      kind: "mercado",
      docType: "nfce_65",
      uf: "DF",
      store: "Supermercado Teste",
      cnpj: "12.345.678/0001-90",
      issuedAt: "2026-11-12",
      accessKey: "53261112345678000190650010000123451000123456",
      number: "12345",
      series: "1",
      paymentMethod: "Pix",
      totalCents: 4500,
      items: [{ description: "Arroz 5kg", quantity: 1, unit: "UN", unitPriceCents: 4500, totalCents: 4500 }],
      fileHash: "abc123hash",
    };

    const pkg = buildFiscalExportPackage([receipt]);
    expect(pkg.format).toBe("orion-personal-data");
    expect(pkg.manifest.count).toBe(1);
    expect(pkg.manifest.itemCount).toBe(1);
    expect(pkg.productsIndex).toHaveLength(1);
    expect(pkg.productsIndex[0]?.description).toBe("Arroz 5kg");

    const parsed = parseOrionExportJson(JSON.stringify(pkg));
    const emptyState = createEmptyOrionState();
    const firstImport = buildImportPreview(parsed, emptyState);
    expect(firstImport.totals.inserts).toBe(1);

    const stateWithExisting: OrionState = {
      ...emptyState,
      fiscalReceipts: [{ ...receipt, id: "existing-other-id" }],
    };
    const duplicateImport = buildImportPreview(parsed, stateWithExisting);
    expect(duplicateImport.totals.inserts).toBe(0);
    expect(duplicateImport.totals.alreadyExists).toBe(1);
  });
});

