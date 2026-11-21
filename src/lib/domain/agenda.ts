import Holidays from "date-holidays";
import { addDays, format, parseISO } from "date-fns";
import type {
  AgendaEventOverride,
  AgendaEventSourceType,
  OrionState,
  PersonalAgendaRecord,
  PersonalKind,
} from "@/types/orion";
import type { MonthlyBill, RevenueEntry } from "@/types/orion";
import { isLeapYear, resolveBirthdayDateInYear } from "@/lib/domain/agendaContacts";
import { clampDueDate } from "@/lib/domain/money";

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

const MS_PER_DAY = 86_400_000;

export function toUtcEpochDay(ymd: string): number {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromUtcEpochDay(epochDay: number): string {
  const dt = new Date(epochDay * MS_PER_DAY);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function addUtcDays(ymd: string, deltaDays: number): string {
  return fromUtcEpochDay(toUtcEpochDay(ymd) + deltaDays);
}

export function daysInYearMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type MonthGridCell = {
  date: string;
  inMonth: boolean;
  dayNumber: number;
  weekday: number;
};

/**
 * Builds a complete 7-column calendar grid (5 or 6 rows) including leading/trailing month spillover cells.
 */
export function buildMonthGrid(yearMonth: string): MonthGridCell[] {
  const [year = 2026, month = 11] = yearMonth.split("-").map(Number);
  const firstDayYmd = `${year}-${String(month).padStart(2, "0")}-01`;
  const firstEpoch = toUtcEpochDay(firstDayYmd);
  const firstWeekday = new Date(firstEpoch * MS_PER_DAY).getUTCDay();
  const totalDays = daysInYearMonth(year, month);
  const totalCells = Math.ceil((firstWeekday + totalDays) / 7) * 7;

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const epoch = firstEpoch - firstWeekday + i;
    const date = fromUtcEpochDay(epoch);
    const inMonth = date.startsWith(`${year}-${String(month).padStart(2, "0")}`);
    cells.push({
      date,
      inMonth,
      dayNumber: Number(date.slice(8, 10)),
      weekday: i % 7,
    });
  }
  return cells;
}

export function officialHolidays(year: number, stateUf = "DF"): AgendaItem[] {
  try {
    const uf = stateUf && stateUf.length === 2 ? stateUf.toUpperCase() : "DF";
    const calendar = new Holidays("BR", uf, { languages: "pt" });
    return calendar
      .getHolidays(year)
      .filter((h) => h.type === "public" || h.name === "Corpo de Deus")
      .map((h) => ({
        id: `holiday:${h.date.slice(0, 10)}:${h.name}`,
        date: h.date.slice(0, 10),
        title:
          h.date.slice(5, 10) === "04-21" && uf === "DF"
            ? "Tiradentes · Aniversário de Brasília"
            : h.name === "Corpo de Deus"
              ? "Corpus Christi"
              : h.name,
        kind: "feriado" as const,
      }));
  } catch {
    return [];
  }
}

export function brasiliaHolidays(year: number): AgendaItem[] {
  return officialHolidays(year, "DF");
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

/**
 * Deterministic pure UTC calendar-day recurrence check.
 * 12x36 preserves exact parity from fixed record.startDate across all month/year/leap boundaries.
 */
export function occursOn(record: PersonalAgendaRecord, day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;

  if (record.recurrence === "custom") {
    return Array.isArray(record.customDates) && record.customDates.includes(day);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.startDate)) return false;
  if (day < record.startDate) return false;

  const startEpoch = toUtcEpochDay(record.startDate);
  const targetEpoch = toUtcEpochDay(day);
  const diff = targetEpoch - startEpoch;

  if (record.recurrence === "daily") return true;
  if (record.recurrence === "12x36") return diff % 2 === 0;
  if (record.recurrence === "weekly") return diff % 7 === 0;

  const [sy = 2026, sm = 1, sd = 1] = record.startDate.split("-").map(Number);
  const [ty = 2026, tm = 1, td = 1] = day.split("-").map(Number);

  if (record.recurrence === "monthly") {
    const monthsDiff = (ty - sy) * 12 + (tm - sm);
    if (monthsDiff < 0) return false;
    const expectedDay = Math.min(sd, daysInYearMonth(ty, tm));
    return td === expectedDay;
  }

  if (record.recurrence === "yearly") {
    if (ty < sy) return false;
    if (sm === 2 && sd === 29 && !isLeapYear(ty)) {
      return tm === 2 && td === 28;
    }
    return tm === sm && td === sd;
  }

  return record.startDate === day;
}

export function crossesMidnight(startTime?: string, endTime?: string): boolean {
  if (!startTime || !endTime) return false;
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return false;
  return endTime < startTime;
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

export type UnifiedAgendaStatus = "pending" | "completed" | "overdue" | "info";

export type UnifiedAgendaCategory =
  | "work"
  | "finance_expense"
  | "finance_revenue"
  | "birthday"
  | "vehicle"
  | "trip"
  | "holiday"
  | "reminder"
  | "personal";

export type UnifiedAgendaEvent = {
  occurrenceKey: string;
  sourceType: AgendaEventSourceType;
  sourceId: string;
  baseDate: string;
  displayDate: string;
  startTime: string;
  endTime?: string;
  spansNextDay?: boolean;
  breakRule?: string;
  company?: string;
  title: string;
  subtitle: string;
  description: string;
  category: UnifiedAgendaCategory;
  kindLabel: string;
  originModule: string;
  originRoute?: string;
  status: UnifiedAgendaStatus;
  originSettled: boolean;
  amountCents?: number;
  readOnly: boolean;
  canEdit: boolean;
  canDeleteOrigin: boolean;
  canSettleOrigin: false; // Strictly false: Agenda never settles bank balances or financial obligations
  isRecurring?: boolean;
  isReminderProjection?: boolean;
  reminderDays?: number;
  accentColor?: string;
  linkedNoteId?: string;
  linkedContactId?: string;
  personalRecord?: PersonalAgendaRecord;
  override?: AgendaEventOverride;
};

function makeOverrideIndex(overrides: AgendaEventOverride[]): Map<string, AgendaEventOverride> {
  const map = new Map<string, AgendaEventOverride>();
  for (const ov of overrides) {
    map.set(`${ov.sourceType}:${ov.sourceId}:${ov.occurrenceDate}`, ov);
  }
  return map;
}

function applyOverride(
  event: UnifiedAgendaEvent,
  overridesByKey: Map<string, AgendaEventOverride>,
): UnifiedAgendaEvent | null {
  const ov = overridesByKey.get(`${event.sourceType}:${event.sourceId}:${event.baseDate}`);
  if (!ov) return event;
  if (ov.action === "hidden") return null;

  const updated: UnifiedAgendaEvent = { ...event, override: ov };
  if (ov.action === "completed") {
    // Only mark UI reminder completed on Agenda. originSettled stays untouched!
    if (event.readOnly) {
      updated.subtitle = `${event.subtitle} · Visto na Agenda`;
      updated.override = ov;
    } else {
      updated.status = "completed";
    }
  }
  if (ov.action === "postponed" && ov.postponedToDate) {
    updated.displayDate = ov.postponedToDate;
    if (ov.postponedToTime) updated.startTime = ov.postponedToTime;
    updated.subtitle = event.readOnly
      ? `Lembrete adiado de ${event.baseDate.split("-").reverse().join("/")} (vencimento original mantido)`
      : `Adiado de ${event.baseDate.split("-").reverse().join("/")}`;
  }
  if (ov.action === "modified") {
    if (ov.overrideTitle) updated.title = ov.overrideTitle;
    if (ov.overrideTime !== undefined) updated.startTime = ov.overrideTime;
    if (ov.overrideEndTime !== undefined) updated.endTime = ov.overrideEndTime;
    if (ov.overrideBreakRule !== undefined) updated.breakRule = ov.overrideBreakRule;
    if (ov.overrideCompany !== undefined) updated.company = ov.overrideCompany;
    if (ov.overrideDescription !== undefined) updated.description = ov.overrideDescription;
  }
  updated.spansNextDay = crossesMidnight(updated.startTime, updated.endTime);
  return updated;
}

export function buildUnifiedAgendaEvents(params: {
  rangeStart: string;
  rangeEnd: string;
  state: OrionState;
  today: string;
}): UnifiedAgendaEvent[] {
  const { rangeStart, rangeEnd, state, today } = params;
  const overridesByKey = makeOverrideIndex(state.agendaOverrides ?? []);
  const rawEvents: UnifiedAgendaEvent[] = [];

  const pushWithOverride = (ev: UnifiedAgendaEvent) => {
    const resolved = applyOverride(ev, overridesByKey);
    if (!resolved) return;
    if (resolved.displayDate >= rangeStart && resolved.displayDate <= rangeEnd) {
      rawEvents.push(resolved);
    }
  };

  const startYear = Number(rangeStart.slice(0, 4)) || Number(today.slice(0, 4));
  const endYear = Number(rangeEnd.slice(0, 4)) || startYear;
  const yearsInRange: number[] = [];
  for (let y = startYear; y <= endYear; y++) yearsInRange.push(y);

  // 1. Holidays (official, preserved without Brasília branding in UI headers)
  const holidaySeen = new Set<string>();
  for (const y of yearsInRange) {
    for (const h of officialHolidays(y, state.profile.state || "DF")) {
      const k = `${h.date}:${h.title}`;
      if (holidaySeen.has(k)) continue;
      holidaySeen.add(k);
      pushWithOverride({
        occurrenceKey: `holiday:${h.id}:${h.date}`,
        sourceType: "holiday",
        sourceId: h.id,
        baseDate: h.date,
        displayDate: h.date,
        startTime: "",
        title: h.title,
        subtitle: "Feriado oficial",
        description: "Calendário oficial nacional/local",
        category: "holiday",
        kindLabel: "Feriado",
        originModule: "Feriados Oficiais",
        status: "info",
        originSettled: false,
        readOnly: true,
        canEdit: false,
        canDeleteOrigin: false,
        canSettleOrigin: false,
      });
    }
  }

  // 2. Personal Agenda records + shift schedules + linked notes
  const startEpoch = toUtcEpochDay(rangeStart);
  const endEpoch = toUtcEpochDay(rangeEnd);
  for (const rec of state.personalAgenda) {
    for (let ep = startEpoch; ep <= endEpoch; ep++) {
      const date = fromUtcEpochDay(ep);
      if (occursOn(rec, date)) {
        const isWork = rec.kind === "work";
        const isNoteLink = Boolean(rec.linkedNoteId);
        const cat: UnifiedAgendaCategory = isWork
          ? "work"
          : rec.kind === "birthday"
            ? "birthday"
            : "personal";
        const status: UnifiedAgendaStatus = rec.completed ? "completed" : "pending";
        pushWithOverride({
          occurrenceKey: `personal:${rec.id}:${date}`,
          sourceType: "personal",
          sourceId: rec.id,
          baseDate: date,
          displayDate: date,
          startTime: rec.time || "",
          endTime: rec.endTime,
          spansNextDay: crossesMidnight(rec.time, rec.endTime),
          breakRule: rec.breakRule,
          company: rec.company,
          title: rec.title,
          subtitle: isWork
            ? [
                rec.recurrence === "12x36" ? "Escala 12×36" : rec.recurrence === "custom" ? "Escala personalizada" : "Trabalho",
                rec.time && rec.endTime ? `${rec.time}–${rec.endTime}` : rec.time,
                rec.company,
              ]
                .filter(Boolean)
                .join(" · ")
            : [AGENDA_KINDS[rec.kind], rec.time, isNoteLink ? "Nota vinculada" : ""].filter(Boolean).join(" · "),
          description: rec.description || "",
          category: cat,
          kindLabel: isWork ? "Trabalho" : AGENDA_KINDS[rec.kind],
          originModule: isNoteLink ? "Bloco de Notas" : "Agenda Pessoal",
          status,
          originSettled: Boolean(rec.completed),
          readOnly: false,
          canEdit: true,
          canDeleteOrigin: true,
          canSettleOrigin: false,
          isRecurring: rec.recurrence !== "none",
          accentColor: rec.color,
          linkedNoteId: rec.linkedNoteId,
          linkedContactId: rec.linkedContactId,
          personalRecord: rec,
        });
      }

      if (rec.reminder) {
        const offsets = rec.favorite ? [7, 3, 1] : [1];
        for (const offset of offsets) {
          const targetDate = fromUtcEpochDay(ep + offset);
          if (occursOn(rec, targetDate)) {
            pushWithOverride({
              occurrenceKey: `personal:${rec.id}:rem:${offset}:${date}`,
              sourceType: "personal",
              sourceId: `${rec.id}:rem:${offset}`,
              baseDate: date,
              displayDate: date,
              startTime: rec.time || "",
              title: `Lembrete: ${rec.title}`,
              subtitle: `Em ${offset} dia(s) · ${targetDate.split("-").reverse().join("/")}`,
              description: rec.description || "",
              category: "reminder",
              kindLabel: "Lembrete",
              originModule: "Lembretes da Agenda",
              status: "info",
              originSettled: false,
              readOnly: true,
              canEdit: false,
              canDeleteOrigin: false,
              canSettleOrigin: false,
              isReminderProjection: true,
              reminderDays: offset,
              personalRecord: rec,
            });
          }
        }
      }
    }

    // Check postponed personal overrides whose original date was outside rangeStart..rangeEnd
    for (const ov of state.agendaOverrides ?? []) {
      if (
        ov.sourceType === "personal" &&
        ov.sourceId === rec.id &&
        ov.action === "postponed" &&
        ov.postponedToDate &&
        ov.postponedToDate >= rangeStart &&
        ov.postponedToDate <= rangeEnd &&
        (ov.occurrenceDate < rangeStart || ov.occurrenceDate > rangeEnd)
      ) {
        if (occursOn(rec, ov.occurrenceDate)) {
          pushWithOverride({
            occurrenceKey: `personal:${rec.id}:${ov.occurrenceDate}`,
            sourceType: "personal",
            sourceId: rec.id,
            baseDate: ov.occurrenceDate,
            displayDate: ov.occurrenceDate,
            startTime: rec.time || "",
            endTime: rec.endTime,
            breakRule: rec.breakRule,
            company: rec.company,
            title: rec.title,
            subtitle: AGENDA_KINDS[rec.kind],
            description: rec.description || "",
            category: rec.kind === "work" ? "work" : "personal",
            kindLabel: AGENDA_KINDS[rec.kind],
            originModule: "Agenda Pessoal",
            status: "pending",
            originSettled: false,
            readOnly: false,
            canEdit: true,
            canDeleteOrigin: true,
            canSettleOrigin: false,
            isRecurring: rec.recurrence !== "none",
            personalRecord: rec,
          });
        }
      }
    }
  }

  // 3. Birthdays from Contacts Directory (recurs every year without end date, deduplicated)
  const leapRule = state.agendaSettings?.leapYearBirthdayRule ?? "feb28";
  const seenBirthdays = new Set<string>();
  for (const contact of state.agendaContacts ?? []) {
    if (!contact.birthMonth || !contact.birthDay) continue;
    for (const y of yearsInRange) {
      const bDate = resolveBirthdayDateInYear(contact.birthMonth, contact.birthDay, y, leapRule);
      if (!bDate) continue;
      const key = `${contact.id}:${bDate}`;
      if (seenBirthdays.has(key)) continue;
      seenBirthdays.add(key);

      const turningAge =
        typeof contact.birthYear === "number" && y >= contact.birthYear
          ? y - contact.birthYear
          : null;
      pushWithOverride({
        occurrenceKey: `birthday:${contact.id}:${bDate}`,
        sourceType: "birthday",
        sourceId: contact.id,
        baseDate: bDate,
        displayDate: bDate,
        startTime: "",
        title: `Aniversário · ${contact.name}`,
        subtitle:
          turningAge !== null
            ? `Completa ${turningAge} ano(s)`
            : `${String(contact.birthDay).padStart(2, "0")}/${String(contact.birthMonth).padStart(2, "0")} · Idade não informada`,
        description: contact.relationship || contact.company || "Aniversário cadastrado em Contatos",
        category: "birthday",
        kindLabel: "Aniversário",
        originModule: "Contatos",
        status: "info",
        originSettled: false,
        readOnly: true,
        canEdit: false,
        canDeleteOrigin: false,
        canSettleOrigin: false,
        isRecurring: true,
        accentColor: contact.categoryColor || "#b99555",
        linkedContactId: contact.id,
      });

      if (contact.birthdayReminderEnabled && contact.birthdayReminderDaysBefore > 0) {
        const remDate = addUtcDays(bDate, -contact.birthdayReminderDaysBefore);
        pushWithOverride({
          occurrenceKey: `birthday:${contact.id}:rem:${remDate}`,
          sourceType: "birthday",
          sourceId: `${contact.id}:rem`,
          baseDate: remDate,
          displayDate: remDate,
          startTime: "09:00",
          title: `Lembrete de aniversário · ${contact.name}`,
          subtitle: `Em ${contact.birthdayReminderDaysBefore} dia(s) (${bDate.split("-").reverse().join("/")})`,
          description: "Aviso antecipado de aniversário",
          category: "reminder",
          kindLabel: "Lembrete",
          originModule: "Contatos · Aniversários",
          status: "info",
          originSettled: false,
          readOnly: true,
          canEdit: false,
          canDeleteOrigin: false,
          canSettleOrigin: false,
          isReminderProjection: true,
          reminderDays: contact.birthdayReminderDaysBefore,
          linkedContactId: contact.id,
        });
      }
    }
  }

  // 4. Financial Expenses (MonthlyBills + deduplicated AnnualExpenses + PayableInstallments + CardSnapshots)
  const mirroredAnnualPeriods = new Set<string>();
  const mirroredContractInstallments = new Set<string>();
  const mirroredCardPeriods = new Set<string>();
  const contractNameMap = new Map((state.payableContracts ?? []).map((c) => [c.id, c.name]));

  for (const bill of state.monthlyBills ?? []) {
    if (bill.sourceAnnualId && bill.period) {
      mirroredAnnualPeriods.add(`${bill.sourceAnnualId}:${bill.period}`);
    }
    if (bill.contractId && bill.installmentNumber != null) {
      mirroredContractInstallments.add(`${bill.contractId}:${bill.installmentNumber}`);
    }
    if (bill.isCardInvoice && bill.cardId && bill.period) {
      mirroredCardPeriods.add(`${bill.cardId}:${bill.period}`);
    }

    const contractName = bill.contractId ? contractNameMap.get(bill.contractId) : undefined;
    const isOverdue = !bill.isSettled && bill.dueDate < today;
    const isCard = Boolean(bill.isCardInvoice);
    pushWithOverride({
      occurrenceKey: `bill:${bill.id}:${bill.dueDate}`,
      sourceType: "bill",
      sourceId: bill.id,
      baseDate: bill.dueDate,
      displayDate: bill.dueDate,
      startTime: "",
      title: bill.creditor,
      subtitle: `${isCard ? "Fatura de cartão" : bill.contractId ? `Parcela #${bill.installmentNumber ?? ""}` : bill.category} · ${
        bill.isSettled ? "Pago na origem" : isOverdue ? "Em atraso" : "Em aberto"
      }`,
      description:
        bill.description ||
        bill.note ||
        (contractName ? `Contrato: ${contractName}` : "Compromisso registrado no módulo Despesas"),
      category: "finance_expense",
      kindLabel: isCard ? "Fatura" : bill.contractId ? "Parcela" : "Despesa",
      originModule: bill.contractId ? "Contratos Parcelados" : "Despesas",
      originRoute: "/despesas",
      status: bill.isSettled ? "completed" : isOverdue ? "overdue" : "pending",
      originSettled: bill.isSettled,
      amountCents: bill.expectedCents,
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  for (const inst of state.payableInstallments ?? []) {
    if (mirroredContractInstallments.has(`${inst.contractId}:${inst.number}`)) continue;
    const contractName = contractNameMap.get(inst.contractId) ?? "Contrato parcelado";
    const isOverdue = !inst.isSettled && inst.dueDate < today;
    pushWithOverride({
      occurrenceKey: `payable_installment:${inst.id}:${inst.dueDate}`,
      sourceType: "payable_installment",
      sourceId: inst.id,
      baseDate: inst.dueDate,
      displayDate: inst.dueDate,
      startTime: "",
      title: `${contractName} · Parcela #${inst.number}`,
      subtitle: inst.isSettled ? "Parcela paga na origem" : isOverdue ? "Parcela em atraso" : "Parcela a vencer",
      description: inst.note || "Obrigação vinculada a contrato parcelado",
      category: "finance_expense",
      kindLabel: "Contrato",
      originModule: "Contratos Parcelados",
      originRoute: "/despesas",
      status: inst.isSettled ? "completed" : isOverdue ? "overdue" : "pending",
      originSettled: inst.isSettled,
      amountCents: inst.expectedCents,
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  for (const row of state.annualExpenses ?? []) {
    if (row.sourceContractId) continue; // Handled via monthlyBills or payableInstallments
    if (!yearsInRange.includes(row.year)) continue;
    for (const [mm, cell] of Object.entries(row.months ?? {})) {
      if (!cell || (cell.expectedCents == null && !cell.isSettled)) continue;
      const period = `${row.year}-${mm}`;
      if (mirroredAnnualPeriods.has(`${row.id}:${period}`)) continue;
      const dueDate = clampDueDate(row.year, Number(mm), row.dueDay || 10);
      const isOverdue = !cell.isSettled && dueDate < today;
      pushWithOverride({
        occurrenceKey: `annual_expense:${row.id}:${dueDate}`,
        sourceType: "annual_expense",
        sourceId: `${row.id}:${period}`,
        baseDate: dueDate,
        displayDate: dueDate,
        startTime: "",
        title: row.creditor,
        subtitle: `Despesa anual (${row.category}) · ${cell.isSettled ? "Pago na origem" : isOverdue ? "Em atraso" : "Em aberto"}`,
        description: cell.note || `Matriz anual ${row.year}`,
        category: "finance_expense",
        kindLabel: "Despesa Anual",
        originModule: "Despesas Anuais",
        originRoute: "/despesas",
        status: cell.isSettled ? "completed" : isOverdue ? "overdue" : "pending",
        originSettled: Boolean(cell.isSettled),
        amountCents: cell.expectedCents ?? cell.paidCents ?? 0,
        readOnly: true,
        canEdit: false,
        canDeleteOrigin: false,
        canSettleOrigin: false,
      });
    }
  }

  const cardMap = new Map((state.cards ?? []).map((c) => [c.id, c]));
  for (const snap of state.cardMonthSnapshots ?? []) {
    if (!snap.dueDate || snap.invoiceCents == null || snap.invoiceCents <= 0) continue;
    if (mirroredCardPeriods.has(`${snap.accountId}:${snap.period}`)) continue;
    const card = cardMap.get(snap.accountId);
    const label = snap.accountName || (card ? `${card.institution} · ${card.name}` : "Cartão de Crédito");
    const isOverdue = snap.dueDate < today;
    pushWithOverride({
      occurrenceKey: `card_snapshot:${snap.id}:${snap.dueDate}`,
      sourceType: "card_snapshot",
      sourceId: snap.id,
      baseDate: snap.dueDate,
      displayDate: snap.dueDate,
      startTime: "",
      title: `Fatura ${label}`,
      subtitle: `Vencimento de fatura · ${snap.period}`,
      description: "Snapshot importado de cartão de crédito (verifique quitação em Despesas/Carteira)",
      category: "finance_expense",
      kindLabel: "Fatura Cartão",
      originModule: "Carteira / Cartões",
      originRoute: "/carteira",
      status: isOverdue ? "overdue" : "pending",
      originSettled: false,
      amountCents: snap.invoiceCents,
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  // 5. Revenue Entries (Recebíveis previstos vs efetivamente recebidos)
  for (const rev of state.revenueEntries ?? []) {
    const isReceived = Boolean(rev.receivedDate);
    const baseDate = rev.receivedDate ?? rev.dueDate;
    const isOverdue = !isReceived && rev.dueDate < today;
    pushWithOverride({
      occurrenceKey: `revenue_entry:${rev.id}:${baseDate}`,
      sourceType: "revenue_entry",
      sourceId: rev.id,
      baseDate,
      displayDate: baseDate,
      startTime: "",
      title: rev.title,
      subtitle: isReceived
        ? "Recebido confirmado na origem"
        : isOverdue
          ? "Recebível em atraso (previsto)"
          : "Previsão de recebimento (não recebido)",
      description: rev.note || `${rev.category}${rev.contractId ? " · Contrato de receita" : ""}`,
      category: "finance_revenue",
      kindLabel: isReceived ? "Recebido" : "A Receber",
      originModule: "Receitas & Contratos",
      originRoute: "/receitas",
      status: isReceived ? "completed" : isOverdue ? "overdue" : "pending",
      originSettled: isReceived,
      amountCents: isReceived ? (rev.receivedCents ?? rev.expectedCents) : rev.expectedCents,
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  // 6. Vehicles / Fleet (maintenances, documents, reminders, fines)
  const vehicleMap = new Map((state.vehicles ?? []).map((v) => [v.id, v]));
  const vehicleLabel = (vId: string) => {
    const v = vehicleMap.get(vId);
    return v ? `${v.name} (${v.plate})` : "Veículo";
  };

  for (const m of state.garageMaintenances ?? []) {
    const done = m.status === "CONCLUIDA";
    pushWithOverride({
      occurrenceKey: `garage_maintenance:${m.id}:${m.date}`,
      sourceType: "garage_maintenance",
      sourceId: m.id,
      baseDate: m.date,
      displayDate: m.date,
      startTime: "",
      title: `${vehicleLabel(m.vehicleId)} · ${m.category}`,
      subtitle: `Manutenção ${m.type.toLowerCase()} · ${done ? "Concluída" : m.status === "EM_EXECUCAO" ? "Em execução" : "Aberta"}`,
      description: m.notes || m.providerName || "Registro de manutenção veicular",
      category: "vehicle",
      kindLabel: "Manutenção",
      originModule: "Veículo",
      originRoute: "/veiculos",
      status: done ? "completed" : m.date < today ? "overdue" : "pending",
      originSettled: done,
      amountCents: Math.round((m.totalCost || 0) * 100),
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  for (const d of state.garageDocuments ?? []) {
    const paid = d.status === "PAGO" || d.status === "ISENTO";
    const isOverdue = !paid && d.dueDate < today;
    pushWithOverride({
      occurrenceKey: `garage_document:${d.id}:${d.dueDate}`,
      sourceType: "garage_document",
      sourceId: d.id,
      baseDate: d.dueDate,
      displayDate: d.dueDate,
      startTime: "",
      title: `${d.docType} ${d.referenceYear} · ${vehicleLabel(d.vehicleId)}`,
      subtitle: paid ? `Status: ${d.status}` : isOverdue ? "Documento vencido" : "Vencimento de documento",
      description: d.notes || d.providerOrAuthority || "Obrigação documental do veículo",
      category: "vehicle",
      kindLabel: d.docType,
      originModule: "Veículo · Documentos",
      originRoute: "/veiculos",
      status: paid ? "completed" : isOverdue ? "overdue" : "pending",
      originSettled: paid,
      amountCents: Math.round((d.amount || 0) * 100),
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  for (const gr of state.garageReminders ?? []) {
    if (!gr.dueDate) continue;
    const done = gr.completed;
    const isOverdue = !done && gr.dueDate < today;
    pushWithOverride({
      occurrenceKey: `garage_reminder:${gr.id}:${gr.dueDate}`,
      sourceType: "garage_reminder",
      sourceId: gr.id,
      baseDate: gr.dueDate,
      displayDate: gr.dueDate,
      startTime: "",
      title: `${gr.title} · ${vehicleLabel(gr.vehicleId)}`,
      subtitle: done ? "Concluído no módulo Veículo" : isOverdue ? "Revisão/lembrete atrasado" : `Lembrete ${gr.category.toLowerCase()}`,
      description: gr.notes || "Lembrete preventivo de frota",
      category: "vehicle",
      kindLabel: "Revisão",
      originModule: "Veículo · Lembretes",
      originRoute: "/veiculos",
      status: done ? "completed" : isOverdue ? "overdue" : "pending",
      originSettled: done,
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  for (const f of state.garageFines ?? []) {
    const paid = f.status === "PAGA";
    const due = f.driverIndicationDeadline || f.date;
    pushWithOverride({
      occurrenceKey: `garage_fine:${f.id}:${due}`,
      sourceType: "garage_fine",
      sourceId: f.id,
      baseDate: due,
      displayDate: due,
      startTime: f.time || "",
      title: `Multa ${f.infractionCode} · ${vehicleLabel(f.vehicleId)}`,
      subtitle: `${f.description} · ${f.status}`,
      description: f.location || "Infração registrada no módulo Veículo",
      category: "vehicle",
      kindLabel: "Multa",
      originModule: "Veículo · Multas",
      originRoute: "/veiculos",
      status: paid ? "completed" : due < today ? "overdue" : "pending",
      originSettled: paid,
      amountCents: Math.round((f.amount || 0) * 100),
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  // 7. Trips
  for (const tr of state.trips ?? []) {
    const done = tr.status === "Concluída";
    pushWithOverride({
      occurrenceKey: `trip:${tr.id}:${tr.startDate}`,
      sourceType: "trip",
      sourceId: tr.id,
      baseDate: tr.startDate,
      displayDate: tr.startDate,
      startTime: "",
      title: `Viagem · ${tr.destination}`,
      subtitle: `${tr.status} · Até ${tr.endDate.split("-").reverse().join("/")}`,
      description: tr.notes || "Planejamento de viagem",
      category: "trip",
      kindLabel: "Viagem",
      originModule: "Viagens",
      originRoute: "/viagens",
      status: done ? "completed" : "info",
      originSettled: done,
      amountCents: tr.budgetCents,
      readOnly: true,
      canEdit: false,
      canDeleteOrigin: false,
      canSettleOrigin: false,
    });
  }

  // Deduplicate by occurrenceKey in case of overlapped postponed projection and sort cleanly
  const deduped = new Map<string, UnifiedAgendaEvent>();
  for (const ev of rawEvents) {
    deduped.set(ev.occurrenceKey, ev);
  }

  const categoryOrder: Record<UnifiedAgendaCategory, number> = {
    holiday: 0,
    birthday: 1,
    work: 2,
    personal: 3,
    finance_expense: 4,
    finance_revenue: 5,
    vehicle: 6,
    trip: 7,
    reminder: 8,
  };

  return Array.from(deduped.values()).sort((a, b) => {
    const dCmp = a.displayDate.localeCompare(b.displayDate);
    if (dCmp !== 0) return dCmp;
    const tA = a.startTime || "99:99";
    const tB = b.startTime || "99:99";
    const tCmp = tA.localeCompare(tB);
    if (tCmp !== 0) return tCmp;
    return categoryOrder[a.category] - categoryOrder[b.category] || a.title.localeCompare(b.title, "pt-BR");
  });
}
