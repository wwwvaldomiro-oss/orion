import type { FiscalReceipt } from "@/lib/receiptAnalysis";

export const DEFAULT_WARRANTY_WARNING_DAYS = 30;
export const DEFAULT_EXPIRED_LOOKBACK_DAYS = 60;

export type WarrantyAlertStatus = "expired" | "due_today" | "expiring_soon";

export interface WarrantyAlertItem {
  receipt: FiscalReceipt;
  productName: string;
  store: string;
  serialNumber: string;
  warrantyEndsAt: string;
  daysRemaining: number;
  status: WarrantyAlertStatus;
  hasAgendaAlert: boolean;
}

export interface WarrantyCheckSummary {
  checkedDate: string;
  totalTracked: number;
  expiringCount: number;
  expiredCount: number;
  alerts: WarrantyAlertItem[];
}

export interface DailyWarrantyCheckRecord {
  lastCheckedDate: string;
  checkedAtIso: string;
  totalTracked: number;
  expiringCount: number;
  expiredCount: number;
}

function diffDaysUtc(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function evaluateWarrantyAlerts(
  receipts: FiscalReceipt[],
  todayIso: string,
  options?: {
    warningDays?: number;
    expiredLookbackDays?: number;
  },
): WarrantyCheckSummary {
  const warningDays = options?.warningDays ?? DEFAULT_WARRANTY_WARNING_DAYS;
  const expiredLookbackDays = options?.expiredLookbackDays ?? DEFAULT_EXPIRED_LOOKBACK_DAYS;

  let totalTracked = 0;
  let expiringCount = 0;
  let expiredCount = 0;
  const alerts: WarrantyAlertItem[] = [];

  for (const r of receipts) {
    const endsAt = r.warranty?.warrantyEndsAt?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endsAt)) continue;
    if (r.kind !== "aquisicoes" && !r.warranty?.productName && !r.warranty?.warrantyMonths) {
      continue;
    }

    totalTracked += 1;
    const daysRemaining = diffDaysUtc(todayIso, endsAt);
    if (daysRemaining > warningDays) continue;
    if (daysRemaining < -expiredLookbackDays) continue;

    const status: WarrantyAlertStatus =
      daysRemaining < 0 ? "expired" : daysRemaining === 0 ? "due_today" : "expiring_soon";

    if (status === "expired") {
      expiredCount += 1;
    } else {
      expiringCount += 1;
    }

    alerts.push({
      receipt: r,
      productName:
        r.warranty?.productName?.trim() ||
        r.items?.[0]?.description?.trim() ||
        `Aquisição em ${r.store}`,
      store: r.store,
      serialNumber: r.warranty?.serialNumber?.trim() ?? "",
      warrantyEndsAt: endsAt,
      daysRemaining,
      status,
      hasAgendaAlert: Boolean(r.warranty?.agendaRecordId),
    });
  }

  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining || a.productName.localeCompare(b.productName));

  return {
    checkedDate: todayIso,
    totalTracked,
    expiringCount,
    expiredCount,
    alerts,
  };
}

export function warrantyStorageKey(uid: string): string {
  return `orion:warranty_daily_check:${uid || "anon"}`;
}

export function runDailyWarrantyCheck(
  receipts: FiscalReceipt[],
  todayIso: string,
  uid: string,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): {
  summary: WarrantyCheckSummary;
  ranNow: boolean;
  record: DailyWarrantyCheckRecord;
} {
  const summary = evaluateWarrantyAlerts(receipts, todayIso);
  const key = warrantyStorageKey(uid);
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);

  let previousDate = "";
  if (targetStorage) {
    try {
      const raw = targetStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DailyWarrantyCheckRecord>;
        previousDate = typeof parsed.lastCheckedDate === "string" ? parsed.lastCheckedDate : "";
      }
    } catch {
      previousDate = "";
    }
  }

  const record: DailyWarrantyCheckRecord = {
    lastCheckedDate: todayIso,
    checkedAtIso: new Date().toISOString(),
    totalTracked: summary.totalTracked,
    expiringCount: summary.expiringCount,
    expiredCount: summary.expiredCount,
  };

  const ranNow = previousDate !== todayIso;
  if (ranNow && targetStorage) {
    try {
      targetStorage.setItem(key, JSON.stringify(record));
    } catch {
      // Ignore storage quota restrictions
    }
  }

  return { summary, ranNow, record };
}
