export function formatBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function parseBRL(input: string): number | null {
  const s = input.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const m = s.match(/^(\d{1,3}(?:\.\d{3})*|\d+)([,.](\d{1,2}))?$/);
  if (!m) return null;
  const reais = parseInt((m[1] ?? "0").replace(/\./g, ""), 10);
  const cents = m[3] ? parseInt(m[3].padEnd(2, "0"), 10) : 0;
  return reais * 100 + cents;
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

export function todayBR(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function clampDueDate(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(day, last);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type ExpensePaymentAdjustmentKind = "unpaid" | "open" | "discount" | "surcharge" | "settled";

export function expensePaymentAdjustment(
  expectedCents: number,
  paidCents: number | null | undefined,
  quits: boolean,
): {
  kind: ExpensePaymentAdjustmentKind;
  differenceCents: number;
  percent: number;
  coveredCents: number;
  openCents: number;
} {
  const expected = Math.max(0, Math.round(expectedCents));
  const paid = paidCents == null ? null : Math.max(0, Math.round(paidCents));
  const coveredCents = quits ? expected : Math.min(expected, paid ?? 0);
  const openCents = Math.max(0, expected - coveredCents);
  if (paid === null) {
    return { kind: "unpaid", differenceCents: expected, percent: 100, coveredCents: 0, openCents: expected };
  }
  if (!quits) {
    return {
      kind: "open",
      differenceCents: openCents,
      percent: expected ? (openCents / expected) * 100 : 0,
      coveredCents,
      openCents,
    };
  }
  const delta = paid - expected;
  return {
    kind: delta < 0 ? "discount" : delta > 0 ? "surcharge" : "settled",
    differenceCents: Math.abs(delta),
    percent: expected ? (Math.abs(delta) / expected) * 100 : 0,
    coveredCents,
    openCents: 0,
  };
}

export function autoNote(
  dueDate: string,
  paidDate: string,
  expectedCents: number,
  paidCents: number,
  quits = true,
): string {
  const parts: string[] = [];
  if (paidDate < dueDate) parts.push("Pago com antecedência");
  else if (paidDate > dueDate) parts.push("Pago em atraso");
  else parts.push("Pago em dia");
  const diff = paidCents - expectedCents;
  if (!quits) parts.push(`— saldo em aberto: ${formatBRL(Math.max(0, expectedCents - paidCents))}`);
  else if (diff < 0) parts.push(`com desconto de ${formatBRL(-diff)}`);
  else if (diff > 0) parts.push(`com acréscimo de ${formatBRL(diff)}`);
  return parts.join(" ");
}
