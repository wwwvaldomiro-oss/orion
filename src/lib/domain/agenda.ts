import Holidays from "date-holidays";
import { addDays, addMonths, addYears, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { MonthlyBill, PersonalAgendaRecord, PersonalKind, RevenueEntry } from "@/types/orion";

export type AgendaItem = {
  id: string;
  date: string;
  title: string;
  kind: "feriado" | "vencimento" | "pagamento";
  detail?: string;
  done?: boolean;
};

export const AGENDA_KINDS: Record<PersonalKind, string> = {
  birthday: "Aniversário",
  work: "Trabalho / Plantão",
  appointment: "Compromisso",
  event: "Evento",
  tasks: "Lista de atividades",
};

export function brasiliaHolidays(year: number): AgendaItem[] {
  const calendar = new Holidays("BR", "DF", { languages: "pt" });
  return calendar
    .getHolidays(year)
    .filter((h) => h.type === "public" || h.name === "Corpo de Deus")
    .map((h) => ({
      id: `holiday:${h.date}:${h.name}`,
      date: h.date.slice(0, 10),
      title:
        h.date.slice(5, 10) === "04-21"
          ? "Tiradentes · Aniversário de Brasília"
          : h.name === "Corpo de Deus"
            ? "Corpus Christi"
            : h.name,
      kind: "feriado" as const,
    }));
}

export function financialAgendaItems(
  month: string,
  revenues: RevenueEntry[],
  bills: MonthlyBill[],
): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const r of revenues) {
    const date = r.receivedDate ?? r.dueDate;
    if (date.startsWith(month)) {
      items.push({
        id: `rev:${r.id}`,
        date,
        title: r.title,
        kind: "pagamento",
        detail: r.note || r.category,
        done: Boolean(r.receivedDate),
      });
    }
  }
  const seen = new Set<string>();
  for (const b of bills) {
    if (!b.dueDate.startsWith(month)) continue;
    const key = b.sourceAnnualId ? `annual:${b.sourceAnnualId}:${b.period}` : b.id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `due:${b.id}`,
      date: b.dueDate,
      title: b.creditor,
      kind: "vencimento",
      detail: b.category,
      done: b.isSettled,
    });
  }
  return items;
}

export function orderAgendaDays(dates: string[], today: string): string[] {
  return [...new Set(dates)].sort((a, b) => {
    const aPast = a < today;
    const bPast = b < today;
    return Number(aPast) - Number(bPast) || a.localeCompare(b);
  });
}

export type PersonalOccurrence = {
  id: string;
  date: string;
  title: string;
  record: PersonalAgendaRecord;
  reminderDays?: number;
};

export function occursOn(record: PersonalAgendaRecord, day: string): boolean {
  if (day < record.startDate) return false;
  const start = parseISO(record.startDate);
  const target = parseISO(day);
  const diff = differenceInCalendarDays(target, start);
  if (record.recurrence === "daily") return true;
  if (record.recurrence === "12x36") return diff % 2 === 0;
  if (record.recurrence === "weekly") return diff % 7 === 0;
  if (record.recurrence === "monthly") {
    const monthsDiff =
      (target.getFullYear() - start.getFullYear()) * 12 + target.getMonth() - start.getMonth();
    return format(addMonths(start, monthsDiff), "yyyy-MM-dd") === day;
  }
  if (record.recurrence === "yearly") {
    return format(addYears(start, target.getFullYear() - start.getFullYear()), "yyyy-MM-dd") === day;
  }
  return record.startDate === day;
}

export function personalOccurrences(
  month: string,
  records: PersonalAgendaRecord[],
): PersonalOccurrence[] {
  const result: PersonalOccurrence[] = [];
  for (let day = parseISO(`${month}-01`); format(day, "yyyy-MM") === month; day = addDays(day, 1)) {
    const date = format(day, "yyyy-MM-dd");
    for (const record of records) {
      if (occursOn(record, date)) {
        result.push({ id: `${record.id}:${date}`, date, title: record.title, record });
      }
      if (record.reminder) {
        const offsets = record.favorite ? [7, 3, 1] : [1];
        for (const offset of offsets) {
          const targetDate = format(addDays(day, offset), "yyyy-MM-dd");
          if (occursOn(record, targetDate)) {
            result.push({
              id: `${record.id}:${date}:rem:${offset}`,
              date,
              title: record.title,
              record,
              reminderDays: offset,
            });
          }
        }
      }
    }
  }
  return result;
}
