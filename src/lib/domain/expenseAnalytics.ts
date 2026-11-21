import type { AnnualYearRecord, OrionState } from "@/types/orion";

export type MonthlyCategoryPoint = {
  period: string; // YYYY-MM
  label: string; // Ex: Nov/26
  totalCents: number;
  [categoryOrMeta: string]: number | string;
};

export type CategoryTotalSummary = {
  category: string;
  totalCents: number;
  pct: number;
  color: string;
};

export type Last12MonthsCategoryReport = {
  months: MonthlyCategoryPoint[];
  categories: string[];
  categoryTotals: CategoryTotalSummary[];
  grandTotalCents: number;
};

export type AnnualCategoryYearRow = {
  year: number;
  label: string;
  totalCents: number;
  isSavedInCloud: boolean;
  [categoryOrMeta: string]: number | string | boolean;
};

export type AnnualCategoryHistoryReport = {
  years: AnnualCategoryYearRow[];
  categories: string[];
  yearlySummaries: Array<{
    year: number;
    totalCents: number;
    byCategory: Record<string, number>;
    isSavedInCloud: boolean;
    snapshotUpdatedAt?: string;
  }>;
};

const SHORT_MONTHS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const CATEGORY_COLOR_MAP: Record<string, string> = {
  Moradia: "#173d4a",
  "Cartões de Crédito": "#b99555",
  "Energia & Água": "#2b6cb0",
  "Internet & Telefonia": "#0d9488",
  Saúde: "#dc2626",
  Transporte: "#d97706",
  Educação: "#6d28d9",
  "Impostos & Taxas": "#475569",
  Assinaturas: "#0f766e",
  Outros: "#64748b",
  Mercado: "#15803d",
  Veículo: "#c2410c",
};

const FALLBACK_COLORS = [
  "#1d4ed8",
  "#9333ea",
  "#be123c",
  "#0369a1",
  "#a16207",
  "#334155",
];

export function getCategoryColor(category: string, index = 0): string {
  return CATEGORY_COLOR_MAP[category] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "#52616a";
}

export function normalizeExpenseCategory(raw: string | undefined | null): string {
  const cleaned = String(raw ?? "").trim();
  return cleaned || "Outros";
}

export function monthLabelShortBR(period: string): string {
  const [yStr, mStr] = period.split("-");
  const m = Number(mStr);
  const label = SHORT_MONTHS[(m || 1) - 1] ?? mStr;
  return `${label}/${(yStr ?? "").slice(-2)}`;
}

export function rolling12Months(anchorDateIso: string): string[] {
  const safePeriod = /^\d{4}-\d{2}/.test(anchorDateIso)
    ? anchorDateIso.slice(0, 7)
    : new Date().toISOString().slice(0, 7);
  const [yRaw = 2026, mRaw = 1] = safePeriod.split("-").map(Number);
  const result: string[] = [];
  for (let offset = 11; offset >= 0; offset--) {
    const dt = new Date(Date.UTC(yRaw, mRaw - 1 - offset, 1));
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    result.push(`${y}-${m}`);
  }
  return result;
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function collectMonthlyCategoryTotals(
  state: Pick<OrionState, "monthlyBills" | "annualExpenses" | "transactions" | "annualYears">,
  period: string,
): Record<string, number> {
  const byCategory: Record<string, number> = {};
  const year = Number(period.slice(0, 4));
  const mm = period.slice(5, 7);

  const coveredAnnualIds = new Set<string>();
  const settledBillSignatures = new Set<string>();

  const add = (catRaw: string | undefined | null, cents: number) => {
    const safeCents = Math.max(0, Math.round(cents || 0));
    if (safeCents <= 0) return;
    const cat = normalizeExpenseCategory(catRaw);
    byCategory[cat] = (byCategory[cat] ?? 0) + safeCents;
  };

  let hasLiveRecordsForMonth = false;

  // 1. Monthly bills for this period
  for (const bill of state.monthlyBills) {
    if (bill.period !== period) continue;
    hasLiveRecordsForMonth = true;
    if (bill.sourceAnnualId) {
      coveredAnnualIds.add(bill.sourceAnnualId);
    }
    const cents = bill.isSettled
      ? (bill.paidCents ?? bill.expectedCents)
      : Math.max(bill.paidCents ?? 0, bill.expectedCents);
    add(bill.category, cents);

    if (bill.isSettled && cents > 0) {
      settledBillSignatures.add(`${normalizeToken(bill.creditor)}:${cents}`);
      settledBillSignatures.add(`amt:${cents}:${bill.paidDate || bill.dueDate}`);
    }
  }

  // 2. Annual expense matrix cells not already represented by a monthlyBill
  for (const row of state.annualExpenses) {
    if (row.year !== year) continue;
    if (coveredAnnualIds.has(row.id)) continue;
    const cell = row.months?.[mm];
    if (!cell) continue;
    const cents = cell.isSettled
      ? (cell.paidCents ?? cell.expectedCents ?? 0)
      : Math.max(cell.paidCents ?? 0, cell.expectedCents ?? 0);
    if (cents > 0) {
      hasLiveRecordsForMonth = true;
      add(row.category, cents);
    }
  }

  // 3. Outgoing wallet transactions (excluding quick-movement duplicates already accounted in settled bills)
  for (const tx of state.transactions) {
    if (tx.amountCents >= 0) continue;
    if (!tx.date.startsWith(period)) continue;
    const absCents = Math.abs(Math.round(tx.amountCents));
    if (absCents <= 0) continue;
    if (
      settledBillSignatures.has(`${normalizeToken(tx.description)}:${absCents}`) ||
      settledBillSignatures.has(`amt:${absCents}:${tx.date}`)
    ) {
      continue;
    }
    hasLiveRecordsForMonth = true;
    add(tx.category, absCents);
  }

  // 4. Fallback to saved annualYears snapshot if live detailed rows are absent for this historical period
  if (!hasLiveRecordsForMonth) {
    const yearRec = state.annualYears.find((y) => y.year === year);
    const savedMonth = yearRec?.monthlyCategoryCents?.[mm];
    if (savedMonth && typeof savedMonth === "object") {
      for (const [cat, cents] of Object.entries(savedMonth)) {
        add(cat, Number(cents) || 0);
      }
    }
  }

  return byCategory;
}

export function buildLast12MonthsCategoryChart(
  state: Pick<OrionState, "monthlyBills" | "annualExpenses" | "transactions" | "annualYears">,
  anchorDateIso: string,
): Last12MonthsCategoryReport {
  const periods = rolling12Months(anchorDateIso);
  const categoryTotalsMap = new Map<string, number>();

  const perMonthMaps = periods.map((period) => {
    const map = collectMonthlyCategoryTotals(state, period);
    for (const [cat, cents] of Object.entries(map)) {
      categoryTotalsMap.set(cat, (categoryTotalsMap.get(cat) ?? 0) + cents);
    }
    return { period, map };
  });

  const sortedCategories = [...categoryTotalsMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cat]) => cat);

  const grandTotalCents = [...categoryTotalsMap.values()].reduce((s, v) => s + v, 0);

  const months: MonthlyCategoryPoint[] = perMonthMaps.map(({ period, map }) => {
    let totalCents = 0;
    const row: MonthlyCategoryPoint = {
      period,
      label: monthLabelShortBR(period),
      totalCents: 0,
    };
    for (const cat of sortedCategories) {
      const c = map[cat] ?? 0;
      totalCents += c;
      row[cat] = Number((c / 100).toFixed(2));
    }
    row.totalCents = totalCents;
    return row;
  });

  const categoryTotals: CategoryTotalSummary[] = sortedCategories.map((category, idx) => {
    const totalCents = categoryTotalsMap.get(category) ?? 0;
    const pct = grandTotalCents > 0 ? Math.round((totalCents / grandTotalCents) * 100) : 0;
    return {
      category,
      totalCents,
      pct,
      color: getCategoryColor(category, idx),
    };
  });

  return {
    months,
    categories: sortedCategories,
    categoryTotals,
    grandTotalCents,
  };
}

export function buildYearSnapshotPayload(
  state: Pick<OrionState, "monthlyBills" | "annualExpenses" | "transactions" | "annualYears">,
  year: number,
): {
  totalExpenseCents: number;
  categoryTotalsCents: Record<string, number>;
  monthlyCategoryCents: Record<string, Record<string, number>>;
} {
  const categoryTotalsCents: Record<string, number> = {};
  const monthlyCategoryCents: Record<string, Record<string, number>> = {};
  let totalExpenseCents = 0;

  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const period = `${year}-${mm}`;
    const map = collectMonthlyCategoryTotals(state, period);
    if (Object.keys(map).length > 0) {
      monthlyCategoryCents[mm] = map;
      for (const [cat, cents] of Object.entries(map)) {
        categoryTotalsCents[cat] = (categoryTotalsCents[cat] ?? 0) + cents;
        totalExpenseCents += cents;
      }
    }
  }

  return {
    totalExpenseCents,
    categoryTotalsCents,
    monthlyCategoryCents,
  };
}

export function collectAllExpenseYears(
  state: Pick<OrionState, "monthlyBills" | "annualExpenses" | "transactions" | "annualYears">,
  currentYear: number,
): number[] {
  const set = new Set<number>([currentYear]);
  for (const y of state.annualYears) set.add(y.year);
  for (const r of state.annualExpenses) set.add(r.year);
  for (const b of state.monthlyBills) {
    const y = Number(b.period.slice(0, 4));
    if (y >= 2000 && y <= 2100) set.add(y);
  }
  for (const tx of state.transactions) {
    if (tx.amountCents >= 0) continue;
    const y = Number(tx.date.slice(0, 4));
    if (y >= 2000 && y <= 2100) set.add(y);
  }
  return [...set].sort((a, b) => a - b);
}

export function buildAnnualCategoryHistory(
  state: Pick<OrionState, "monthlyBills" | "annualExpenses" | "transactions" | "annualYears">,
  currentYear: number,
): AnnualCategoryHistoryReport {
  const allYears = collectAllExpenseYears(state, currentYear);
  const yearByNum = new Map<number, AnnualYearRecord>();
  for (const yr of state.annualYears) yearByNum.set(yr.year, yr);

  const globalCatTotals = new Map<string, number>();
  const perYearData = allYears.map((year) => {
    const livePayload = buildYearSnapshotPayload(state, year);
    const savedRec = yearByNum.get(year);
    const hasLive = livePayload.totalExpenseCents > 0;
    const byCategory = hasLive
      ? livePayload.categoryTotalsCents
      : (savedRec?.categoryTotalsCents ?? {});
    const totalCents = hasLive
      ? livePayload.totalExpenseCents
      : (savedRec?.totalExpenseCents ?? Object.values(byCategory).reduce((s, v) => s + v, 0));

    for (const [cat, cents] of Object.entries(byCategory)) {
      globalCatTotals.set(cat, (globalCatTotals.get(cat) ?? 0) + cents);
    }

    return {
      year,
      totalCents,
      byCategory,
      isSavedInCloud: Boolean(savedRec && (savedRec.totalExpenseCents !== undefined || savedRec.snapshotUpdatedAt)),
      snapshotUpdatedAt: savedRec?.snapshotUpdatedAt,
    };
  });

  const categories = [...globalCatTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cat]) => cat);

  const years: AnnualCategoryYearRow[] = perYearData.map((item) => {
    const row: AnnualCategoryYearRow = {
      year: item.year,
      label: String(item.year),
      totalCents: item.totalCents,
      isSavedInCloud: item.isSavedInCloud,
    };
    for (const cat of categories) {
      row[cat] = Number(((item.byCategory[cat] ?? 0) / 100).toFixed(2));
    }
    return row;
  });

  return {
    years,
    categories,
    yearlySummaries: perYearData,
  };
}
