import type { AgendaContact, AgendaSettings, ContactCategory, ContactSubcategory } from "@/types/orion";

export type PaletteColorOption = {
  id: string;
  label: string;
  hex: string;
};

export const CONTACT_COLOR_PALETTE: PaletteColorOption[] = [
  { id: "petrol", label: "Petróleo", hex: "#173d4a" },
  { id: "night", label: "Azul-noite", hex: "#0c1928" },
  { id: "gold", label: "Ouro", hex: "#b99555" },
  { id: "emerald", label: "Esmeralda", hex: "#16a34a" },
  { id: "cobalt", label: "Cobalto", hex: "#2563eb" },
  { id: "violet", label: "Violeta", hex: "#7c3aed" },
  { id: "rose", label: "Carmim", hex: "#db2777" },
  { id: "crimson", label: "Vermelho", hex: "#dc2626" },
  { id: "amber", label: "Âmbar", hex: "#d97706" },
  { id: "teal", label: "Turquesa", hex: "#0d9488" },
  { id: "slate", label: "Ardósia", hex: "#475569" },
];

export function getContrastTextColor(hex: string): "#ffffff" | "#0c1928" {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "#ffffff";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return lum > 0.42 ? "#0c1928" : "#ffffff";
}

export const DEFAULT_CONTACT_CATEGORIES: ContactCategory[] = [
  { id: "cat-familia", name: "Família", color: "#173d4a", isCommercial: false, order: 1 },
  { id: "cat-amigos", name: "Amigos", color: "#2563eb", isCommercial: false, order: 2 },
  { id: "cat-comercio", name: "Comércio", color: "#b99555", isCommercial: true, order: 3 },
];

export const DEFAULT_CONTACT_SUBCATEGORIES: ContactSubcategory[] = [
  { id: "sub-esposa", categoryId: "cat-familia", name: "Esposa", color: "#db2777", order: 1 },
  { id: "sub-irma", categoryId: "cat-familia", name: "Irmã", color: "#7c3aed", order: 2 },
  { id: "sub-mae", categoryId: "cat-familia", name: "Mãe", color: "#0d9488", order: 3 },
  { id: "sub-pai", categoryId: "cat-familia", name: "Pai", color: "#173d4a", order: 4 },
  { id: "sub-primo", categoryId: "cat-familia", name: "Primo", color: "#475569", order: 5 },
  { id: "sub-eletricista", categoryId: "cat-comercio", name: "Eletricista", color: "#d97706", order: 1 },
  { id: "sub-materiais", categoryId: "cat-comercio", name: "Loja de materiais", color: "#173d4a", order: 2 },
  { id: "sub-encanador", categoryId: "cat-comercio", name: "Encanador", color: "#2563eb", order: 3 },
  { id: "sub-paes", categoryId: "cat-comercio", name: "Loja de pães congelados", color: "#b99555", order: 4 },
];

export function mergeContactCategories(
  customCategories: ContactCategory[],
  hiddenDefaultIds: string[] = [],
): ContactCategory[] {
  const hidden = new Set(hiddenDefaultIds);
  const byId = new Map<string, ContactCategory>();
  for (const def of DEFAULT_CONTACT_CATEGORIES) {
    if (!hidden.has(def.id)) byId.set(def.id, def);
  }
  for (const cat of customCategories) {
    byId.set(cat.id, cat);
  }
  return Array.from(byId.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
}

export function mergeContactSubcategories(
  customSubcategories: ContactSubcategory[],
  hiddenDefaultIds: string[] = [],
): ContactSubcategory[] {
  const hidden = new Set(hiddenDefaultIds);
  const byId = new Map<string, ContactSubcategory>();
  for (const def of DEFAULT_CONTACT_SUBCATEGORIES) {
    if (!hidden.has(def.id)) byId.set(def.id, def);
  }
  for (const sub of customSubcategories) {
    byId.set(sub.id, sub);
  }
  return Array.from(byId.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
}

export function isCommercialCategory(
  categoryId: string,
  categories: ContactCategory[],
): boolean {
  if (categoryId === "cat-comercio") return true;
  const found = categories.find((c) => c.id === categoryId);
  return Boolean(found?.isCommercial);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function resolveBirthdayDateInYear(
  birthMonth: number,
  birthDay: number,
  targetYear: number,
  leapRule: AgendaSettings["leapYearBirthdayRule"] = "feb28",
): string | null {
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) return null;
  if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) return null;

  if (birthMonth === 2 && birthDay === 29 && !isLeapYear(targetYear)) {
    return leapRule === "mar01" ? `${targetYear}-03-01` : `${targetYear}-02-28`;
  }

  const maxDays = new Date(Date.UTC(targetYear, birthMonth, 0)).getUTCDate();
  const clampedDay = Math.min(birthDay, maxDays);
  return `${targetYear}-${String(birthMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

export function computeBirthdayAge(
  birthYear: number | null | undefined,
  targetYear: number,
): number | null {
  if (typeof birthYear !== "number" || !Number.isInteger(birthYear) || birthYear < 1900) return null;
  if (targetYear < birthYear) return null;
  return targetYear - birthYear;
}

export function formatBirthdayDisplay(
  day: number | null | undefined,
  month: number | null | undefined,
  year?: number | null,
): string {
  if (!day || !month) return "Não informado";
  const base = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
  return typeof year === "number" && year >= 1900 ? `${base}/${year}` : base;
}

export type BirthdayListRow = {
  contact: AgendaContact;
  categoryName: string;
  categoryColor: string;
  subcategoryName: string;
  subcategoryColor: string;
  birthDisplay: string;
  nextOccurrenceDate: string;
  nextAge: number | null;
  sortMonthDay: string;
};

export function splitContactsForTabs(
  contacts: AgendaContact[],
  categories: ContactCategory[],
  subcategories: ContactSubcategory[],
  referenceToday: string,
  leapRule: AgendaSettings["leapYearBirthdayRule"] = "feb28",
): {
  personal: AgendaContact[];
  commercial: AgendaContact[];
  birthdays: BirthdayListRow[];
} {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const subMap = new Map(subcategories.map((s) => [s.id, s]));

  const personal: AgendaContact[] = [];
  const commercial: AgendaContact[] = [];
  const birthdays: BirthdayListRow[] = [];

  const refYear = Number(referenceToday.slice(0, 4)) || new Date().getFullYear();

  for (const contact of contacts) {
    const commercialFlag = isCommercialCategory(contact.categoryId, categories);
    if (commercialFlag) {
      commercial.push(contact);
    } else {
      personal.push(contact);
    }

    if (contact.birthMonth && contact.birthDay) {
      const cat = catMap.get(contact.categoryId);
      const sub = contact.subcategoryId ? subMap.get(contact.subcategoryId) : undefined;
      const inRefYear = resolveBirthdayDateInYear(
        contact.birthMonth,
        contact.birthDay,
        refYear,
        leapRule,
      );
      const nextDate =
        inRefYear && inRefYear >= referenceToday
          ? inRefYear
          : resolveBirthdayDateInYear(contact.birthMonth, contact.birthDay, refYear + 1, leapRule) ??
            inRefYear ??
            referenceToday;
      const nextYear = Number(nextDate.slice(0, 4));
      birthdays.push({
        contact,
        categoryName: cat?.name ?? "Sem categoria",
        categoryColor: contact.categoryColor || cat?.color || "#173d4a",
        subcategoryName: sub?.name ?? "—",
        subcategoryColor: contact.subcategoryColor || sub?.color || "#b99555",
        birthDisplay: formatBirthdayDisplay(contact.birthDay, contact.birthMonth, contact.birthYear),
        nextOccurrenceDate: nextDate,
        nextAge: computeBirthdayAge(contact.birthYear, nextYear),
        sortMonthDay: `${String(contact.birthMonth).padStart(2, "0")}-${String(contact.birthDay).padStart(2, "0")}`,
      });
    }
  }

  return { personal, commercial, birthdays };
}

export function normalizeTextKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function findDuplicateContacts(
  existing: AgendaContact[],
  candidate: { id?: string; name: string; phones: Array<{ number: string }> },
): AgendaContact[] {
  const nameKey = normalizeTextKey(candidate.name);
  const phoneKeys = new Set(
    candidate.phones.map((p) => normalizePhoneDigits(p.number)).filter((d) => d.length >= 8),
  );

  return existing.filter((c) => {
    if (candidate.id && c.id === candidate.id) return false;
    if (nameKey && normalizeTextKey(c.name) === nameKey) return true;
    for (const p of c.phones) {
      const d = normalizePhoneDigits(p.number);
      if (d.length >= 8 && phoneKeys.has(d)) return true;
    }
    return false;
  });
}
