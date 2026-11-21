/** Funções puras de previsão. Sem lançamentos, baixas ou alterações nas obrigações. */
export type BudgetPlanLine = {
  id: string;
  months: (number | null)[];
  sourceAnnualId: string | null;
};
export type ExistingAnnualLine = {
  id: string;
  months: Record<string, { expectedCents: number | null; paidCents: number | null; isSettled: boolean }>;
};
export const annualMonthKey = (index: number) => String(index + 1).padStart(2, "0");

/** Soma a tabela Despesas Anuais apenas uma vez por identificador de linha. */
export function annualCommitmentsByMonth(rows: ExistingAnnualLine[]): number[] {
  const unique = new Map(rows.map(row => [row.id, row]));
  return Array.from({ length: 12 }, (_, index) => [...unique.values()].reduce(
    (sum, row) => sum + Math.max(0, row.months[annualMonthKey(index)]?.expectedCents ?? 0), 0,
  ));
}

/** Quanto foi pago e quanto permanece previsto, sem tratar pagamento como nova saída. */
export function annualSettlementByMonth(rows: ExistingAnnualLine[]) {
  const unique = new Map(rows.map(row => [row.id, row]));
  return Array.from({ length: 12 }, (_, index) => [...unique.values()].reduce(
    (sum, row) => {
      const cell = row.months[annualMonthKey(index)];
      const expected = Math.max(0, cell?.expectedCents ?? 0);
      const paid = Math.min(expected, Math.max(0, cell?.paidCents ?? 0));
      return { committedCents: sum.committedCents + expected,
        paidCents: sum.paidCents + paid,
        pendingCents: sum.pendingCents + (cell?.isSettled ? 0 : Math.max(0, expected - paid)) };
    }, { committedCents: 0, paidCents: 0, pendingCents: 0 },
  ));
}

/** Se previsto já estiver representado por um credor vinculado, só soma o excedente. */
export function additionalForecastByMonth(
  plans: BudgetPlanLine[], annual: ExistingAnnualLine[],
): { values: number[]; invalidLinks: string[]; repeatedLinks: string[] } {
  const byId = new Map(annual.map(row => [row.id, row]));
  const invalidLinks = new Set<string>();
  const repeatedLinks = new Set<string>();
  const counts = new Map<string, number>();
  for (const plan of plans) {
    if (!plan.sourceAnnualId) continue;
    if (!byId.has(plan.sourceAnnualId)) invalidLinks.add(plan.id);
    counts.set(plan.sourceAnnualId, (counts.get(plan.sourceAnnualId) ?? 0) + 1);
  }
  for (const plan of plans) {
    if (plan.sourceAnnualId && (counts.get(plan.sourceAnnualId) ?? 0) > 1) repeatedLinks.add(plan.sourceAnnualId);
  }
  const values = Array.from({ length: 12 }, (_, index) => plans.reduce((sum, row) => {
    const planned = Math.max(0, row.months[index] ?? 0);
    const link = row.sourceAnnualId ? byId.get(row.sourceAnnualId) : undefined;
    const expected = link ? Math.max(0, link.months[annualMonthKey(index)]?.expectedCents ?? 0) : 0;
    return sum + (link ? Math.max(0, planned - expected) : planned);
  }, 0));
  return { values, invalidLinks: [...invalidLinks], repeatedLinks: [...repeatedLinks] };
}

export function budgetBalance(revenues: number[], commitments: number[], provisions: number[], goals: number[]): number[] {
  return Array.from({ length: 12 }, (_, i) =>
    (revenues[i] ?? 0) - (commitments[i] ?? 0) - (provisions[i] ?? 0) - (goals[i] ?? 0),
  );
}
