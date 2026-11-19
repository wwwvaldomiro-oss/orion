import { z } from "zod";
import type { RevenueContract, RevenueEntry } from "@/types/orion";

export const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const REVENUE_CATEGORIES = [
  "Salário",
  "Pró-labore",
  "Consultoria",
  "Crediário",
  "Empréstimo Devolvido",
  "Aluguel",
  "Renda Extra",
  "Outros Rendimentos",
] as const;

export const EXPENSE_CATEGORIES = [
  "Moradia",
  "Energia & Água",
  "Internet & Telefonia",
  "Cartões de Crédito",
  "Saúde",
  "Transporte",
  "Educação",
  "Impostos & Taxas",
  "Assinaturas",
  "Outros",
] as const;

export const CONTRACT_STATUSES = [
  "Em andamento",
  "Atrasado",
  "Concluído",
  "Pausado",
  "Perdoado",
  "Ajuizado",
  "Renegociado",
] as const;

export const pixRecipientSchema = z.object({
  key: z.string().trim().min(1, "Informe a chave Pix").max(77),
  name: z.string().trim().min(1, "Informe o nome do recebedor").max(200),
  city: z.string().trim().min(1, "Informe a cidade").max(200),
});

export function pixMerchantText(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export function installmentPlan(
  total: number,
  down: number,
  mode: "count" | "value",
  amount: number,
  remainderAt: "first" | "last" | null,
) {
  const balance = total - down;
  if (
    !Number.isSafeInteger(balance) ||
    down < 0 ||
    balance < 1 ||
    !Number.isSafeInteger(amount) ||
    amount < 1
  ) {
    throw new Error("Informe valores válidos; a entrada deve ser menor que o total.");
  }
  const count = mode === "count" ? amount : Math.max(1, Math.floor(balance / amount));
  if (count > 600 || count > balance) {
    throw new Error("Informe de 1 a 600 parcelas com valor mínimo de R$ 0,01.");
  }
  const base = mode === "count" ? Math.floor(balance / count) : Math.min(balance, amount);
  const remainder = balance - base * count;
  const plan = Array<number>(count).fill(base);
  if (remainder && remainderAt) {
    const i = remainderAt === "first" ? 0 : count - 1;
    plan[i] = (plan[i] ?? 0) + remainder;
  }
  return { balance, count, base, remainder, plan, needsChoice: remainder > 0 && !remainderAt };
}

export type MonthlyCorrectionIndex = { month: string; rate: number };

export function correctionReferenceMonths(dueDate: string, paymentDate: string): string[] {
  if (dueDate >= paymentDate) return [];
  const result: string[] = [];
  let year = Number(dueDate.slice(0, 4));
  let month = Number(dueDate.slice(5, 7));
  const paymentMonth = paymentDate.slice(0, 7);
  while (`${year}-${String(month).padStart(2, "0")}` < paymentMonth) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    if (result.length > 120) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}

export function calculateIndexCorrection(
  dueDate: string,
  paymentDate: string,
  observations: MonthlyCorrectionIndex[],
) {
  const byMonth = new Map(observations.map((o) => [o.month, o.rate]));
  const months: MonthlyCorrectionIndex[] = [];
  const missing: string[] = [];
  for (const month of correctionReferenceMonths(dueDate, paymentDate)) {
    const rate = byMonth.get(month);
    if (rate === undefined) missing.push(month);
    else months.push({ month, rate });
  }
  const rate =
    (months.reduce((factor, o) => factor * (1 + o.rate / 100), 1) - 1) * 100;
  return { rate, months, missing };
}

export function lateCharges(
  originalCents: number,
  dueDate: string,
  paymentDate: string,
  interestPercent: number,
  finePercent: number,
  correctionRatePercent: number,
) {
  const days = Math.max(0, Math.round((Date.parse(paymentDate) - Date.parse(dueDate)) / 86_400_000));
  const interestCents = Math.round(((originalCents * interestPercent) / 100) * (days / 30));
  const fineCents = days > 0 ? Math.round((originalCents * finePercent) / 100) : 0;
  const correctionCents = days > 0 ? Math.round((originalCents * correctionRatePercent) / 100) : 0;
  return {
    days,
    interestCents,
    fineCents,
    correctionCents,
    total: originalCents + interestCents + fineCents + correctionCents,
  };
}

export function amountDue(e: RevenueEntry): number {
  return e.agreedCents ?? e.expectedCents;
}

export function fullyPaid(e: RevenueEntry): boolean {
  return Boolean(e.receivedDate) && (e.receivedCents ?? 0) >= amountDue(e);
}

export function derivedContractStatus(
  contract: RevenueContract,
  entries: RevenueEntry[],
  today: string,
) {
  const contractEntries = entries.filter((e) => e.contractId === contract.id);
  if (contractEntries.length > 0 && contractEntries.every(fullyPaid)) return "Concluído";
  if (
    contract.status === "Em andamento" &&
    contractEntries.some((e) => !fullyPaid(e) && e.dueDate < today)
  ) {
    return "Atrasado";
  }
  return contract.status;
}
