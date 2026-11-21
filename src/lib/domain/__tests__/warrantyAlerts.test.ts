import { describe, expect, it } from "vitest";
import type { FiscalReceipt } from "@/lib/receiptAnalysis";
import { evaluateWarrantyAlerts, runDailyWarrantyCheck } from "@/lib/domain/warrantyAlerts";

function makeAcquisition(
  id: string,
  productName: string,
  warrantyEndsAt: string,
  agendaRecordId?: string,
): FiscalReceipt {
  return {
    id,
    kind: "aquisicoes",
    store: "Loja Exemplo",
    cnpj: "",
    issuedAt: "2026-01-01",
    accessKey: "",
    number: "1",
    series: "1",
    paymentMethod: "Pix",
    totalCents: 150000,
    items: [{ description: productName, quantity: 1, unit: "un", unitPriceCents: 150000, totalCents: 150000 }],
    warranty: {
      productName,
      warrantyMonths: 12,
      warrantyEndsAt,
      ...(agendaRecordId ? { agendaRecordId } : {}),
    },
  };
}

describe("warrantyAlerts", () => {
  it("detects warranties due today, expiring within 30 days, and recently expired", () => {
    const receipts: FiscalReceipt[] = [
      makeAcquisition("nf-1", "Notebook Pro", "2026-11-20", "ag-1"),
      makeAcquisition("nf-2", "Geladeira Frost Free", "2026-12-05"),
      makeAcquisition("nf-3", "Monitor 27\"", "2026-11-10"),
      makeAcquisition("nf-4", "TV 4K", "2027-06-01"),
      makeAcquisition("nf-5", "Ar Condicionado Antigo", "2025-01-01"),
    ];

    const summary = evaluateWarrantyAlerts(receipts, "2026-11-20");
    expect(summary.totalTracked).toBe(5);
    expect(summary.expiringCount).toBe(2);
    expect(summary.expiredCount).toBe(1);
    expect(summary.alerts.map((a) => [a.receipt.id, a.status, a.daysRemaining])).toEqual([
      ["nf-3", "expired", -10],
      ["nf-1", "due_today", 0],
      ["nf-2", "expiring_soon", 15],
    ]);
    expect(summary.alerts[1]?.hasAgendaAlert).toBe(true);
    expect(summary.alerts[2]?.hasAgendaAlert).toBe(false);
  });

  it("runs daily check once per calendar day per user", () => {
    const store = new Map<string, string>();
    const memoryStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const receipts = [makeAcquisition("nf-2", "Geladeira", "2026-12-01")];

    const first = runDailyWarrantyCheck(receipts, "2026-11-20", "user-1", memoryStorage);
    expect(first.ranNow).toBe(true);
    expect(first.summary.expiringCount).toBe(1);

    const secondSameDay = runDailyWarrantyCheck(receipts, "2026-11-20", "user-1", memoryStorage);
    expect(secondSameDay.ranNow).toBe(false);

    const nextDay = runDailyWarrantyCheck(receipts, "2026-11-21", "user-1", memoryStorage);
    expect(nextDay.ranNow).toBe(true);
  });
});
