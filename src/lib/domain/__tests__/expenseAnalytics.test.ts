import { describe, expect, it } from "vitest";
import {
  buildAnnualCategoryHistory,
  buildLast12MonthsCategoryChart,
  buildYearSnapshotPayload,
  collectMonthlyCategoryTotals,
  rolling12Months,
} from "@/lib/domain/expenseAnalytics";
import { createEmptyOrionState, type OrionState } from "@/types/orion";

function makeSampleState(): OrionState {
  const base = createEmptyOrionState();
  return {
    ...base,
    annualYears: [
      {
        id: "2025",
        year: 2025,
        sourceName: "Consolidado Órion",
        totalExpenseCents: 180000,
        categoryTotalsCents: { Moradia: 150000, Saúde: 30000 },
        monthlyCategoryCents: {
          "12": { Moradia: 150000, Saúde: 30000 },
        },
        snapshotUpdatedAt: "2026-01-05T10:00:00.000Z",
      },
    ],
    annualExpenses: [
      {
        id: "ann-1",
        year: 2026,
        creditor: "Condomínio",
        category: "Moradia",
        dueDay: 10,
        months: {
          "10": { expectedCents: 80000, paidCents: 80000, paidDate: "2026-10-10", isSettled: true },
          "11": { expectedCents: 80000, paidCents: null, paidDate: null, isSettled: false },
        },
      },
    ],
    monthlyBills: [
      // Linked to ann-1 in 2026-11 (should NOT double count with annualExpenses!)
      {
        id: "bill-linked",
        period: "2026-11",
        creditor: "Condomínio",
        category: "Moradia",
        dueDate: "2026-11-10",
        expectedCents: 80000,
        paidDate: null,
        paidCents: null,
        isSettled: false,
        sourceAnnualId: "ann-1",
      },
      {
        id: "bill-quick",
        period: "2026-11",
        creditor: "Energia",
        category: "Energia & Água",
        dueDate: "2026-11-15",
        expectedCents: 25000,
        paidDate: "2026-11-15",
        paidCents: 25000,
        isSettled: true,
      },
    ],
    transactions: [
      // Duplicate created by quick movement for Energia (should NOT double count)
      {
        id: "tx-quick-dup",
        accountId: "b1",
        accountType: "BANK",
        accountName: "Conta",
        institution: "Inter",
        description: "Energia",
        amountCents: -25000,
        date: "2026-11-15",
        category: "Energia & Água",
      },
      // Standalone Pluggy expense in 2026-11 (MUST be counted)
      {
        id: "pluggy-tx-1",
        accountId: "b1",
        accountType: "BANK",
        accountName: "Conta",
        institution: "Inter",
        description: "Farmácia Central",
        amountCents: -12000,
        date: "2026-11-18",
        category: "Saúde",
      },
    ],
  };
}

describe("expenseAnalytics", () => {
  it("gera janela móvel exata dos últimos 12 meses cruzando mudança de ano", () => {
    const periods = rolling12Months("2026-11-20");
    expect(periods).toHaveLength(12);
    expect(periods[0]).toBe("2025-12");
    expect(periods[11]).toBe("2026-11");
  });

  it("consolida categorias mensais sem duplicidade e preserva histórico salvo de anos anteriores", () => {
    const state = makeSampleState();

    // 2025-12 reads from saved annualYears snapshot
    const dec25 = collectMonthlyCategoryTotals(state, "2025-12");
    expect(dec25).toEqual({ Moradia: 150000, Saúde: 30000 });

    // 2026-11 avoids double-counting linked annual row and quick-movement transaction
    const nov26 = collectMonthlyCategoryTotals(state, "2026-11");
    expect(nov26).toEqual({
      Moradia: 80000,
      "Energia & Água": 25000,
      Saúde: 12000,
    });
  });

  it("gera série Recharts dos últimos 12 meses e snapshot anual consolidado", () => {
    const state = makeSampleState();

    const rolling = buildLast12MonthsCategoryChart(state, "2026-11-20");
    expect(rolling.months).toHaveLength(12);
    expect(rolling.grandTotalCents).toBe(180000 + 80000 + 80000 + 25000 + 12000);
    expect(rolling.categories[0]).toBe("Moradia");

    const snap2026 = buildYearSnapshotPayload(state, 2026);
    expect(snap2026.totalExpenseCents).toBe(80000 + 80000 + 25000 + 12000);
    expect(snap2026.categoryTotalsCents["Moradia"]).toBe(160000);

    const annual = buildAnnualCategoryHistory(state, 2026);
    expect(annual.years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(annual.yearlySummaries[0]?.isSavedInCloud).toBe(true);
    expect(annual.yearlySummaries[1]?.totalCents).toBe(197000);
  });
});
