import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProgramById } from '../data/programs';
import { LoyaltyAccount } from '../types';
import { daysUntilDate } from '../utils/formatters';

export type AlertThresholdDays = 15 | 30 | 60;

export interface ExpirationNotification {
  signature: string;
  account: LoyaltyAccount;
  daysRemaining: number;
  severity: 'expired' | 'critical' | 'warning';
  riskValueBrl: number;
  isRead: boolean;
}

function readStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeStringArray(key: string, values: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values.slice(-100)));
  } catch {
    // ignore storage errors
  }
}

export function useExpirationNotifications(
  userKey: string,
  accounts: LoyaltyAccount[],
  enabled: boolean
) {
  const thresholdKey = `pontoplus_notif_threshold_${userKey}`;
  const readKey = `pontoplus_notif_read_${userKey}`;
  const dismissedKey = `pontoplus_notif_dismissed_${userKey}`;

  const [thresholdDays, setThresholdDaysState] = useState<AlertThresholdDays>(() => {
    try {
      const saved = Number(localStorage.getItem(thresholdKey));
      if (saved === 15 || saved === 30 || saved === 60) return saved;
    } catch {
      // ignore
    }
    return 60;
  });

  const [readSignatures, setReadSignatures] = useState<string[]>(() =>
    readStringArray(readKey)
  );
  const [dismissedSignatures, setDismissedSignatures] = useState<string[]>(() =>
    readStringArray(dismissedKey)
  );
  const [liveToasts, setLiveToasts] = useState<ExpirationNotification[]>([]);
  const seenInSessionRef = useRef<Set<string>>(new Set());

  // Reload state if user changes
  useEffect(() => {
    setReadSignatures(readStringArray(readKey));
    setDismissedSignatures(readStringArray(dismissedKey));
    seenInSessionRef.current = new Set();
    setLiveToasts([]);
    try {
      const saved = Number(localStorage.getItem(thresholdKey));
      if (saved === 15 || saved === 30 || saved === 60) {
        setThresholdDaysState(saved);
      }
    } catch {
      // ignore
    }
  }, [readKey, dismissedKey, thresholdKey]);

  const setThresholdDays = useCallback(
    (days: AlertThresholdDays) => {
      setThresholdDaysState(days);
      try {
        localStorage.setItem(thresholdKey, String(days));
      } catch {
        // ignore
      }
    },
    [thresholdKey]
  );

  const notifications = useMemo<ExpirationNotification[]>(() => {
    if (!enabled) return [];

    return accounts
      .map((account) => {
        const days = daysUntilDate(account.expirationDate);
        if (account.expiringPoints <= 0 || days === null || days > thresholdDays) {
          return null;
        }
        const severity: ExpirationNotification['severity'] =
          days < 0 ? 'expired' : days <= 15 ? 'critical' : 'warning';
        const signature = `${account.id}::${account.expirationDate}::${account.expiringPoints}::${severity}`;
        if (dismissedSignatures.includes(signature)) {
          return null;
        }
        const prog = getProgramById(account.programId);
        const unitCpm = prog.marketCpm || account.avgCpm || 20;
        const riskValueBrl = (account.expiringPoints / 1000) * unitCpm;

        return {
          signature,
          account,
          daysRemaining: days,
          severity,
          riskValueBrl,
          isRead: readSignatures.includes(signature),
        };
      })
      .filter((n): n is ExpirationNotification => n !== null)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [accounts, thresholdDays, dismissedSignatures, readSignatures, enabled]);

  // Trigger in-app live alert toasts for newly detected unread expiration notifications
  useEffect(() => {
    if (!enabled || notifications.length === 0) return;

    const newlyTriggered = notifications.filter(
      (n) => !n.isRead && !seenInSessionRef.current.has(n.signature)
    );

    if (newlyTriggered.length > 0) {
      for (const n of newlyTriggered) {
        seenInSessionRef.current.add(n.signature);
      }
      setLiveToasts((prev) => {
        const existingSigs = new Set(prev.map((p) => p.signature));
        const additions = newlyTriggered.filter((n) => !existingSigs.has(n.signature));
        return [...additions, ...prev].slice(0, 3);
      });
    }
  }, [notifications, enabled]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const markAsRead = useCallback(
    (signature: string) => {
      setReadSignatures((prev) => {
        if (prev.includes(signature)) return prev;
        const next = [...prev, signature];
        writeStringArray(readKey, next);
        return next;
      });
    },
    [readKey]
  );

  const markAllAsRead = useCallback(() => {
    const allSigs = notifications.map((n) => n.signature);
    setReadSignatures((prev) => {
      const next = Array.from(new Set([...prev, ...allSigs]));
      writeStringArray(readKey, next);
      return next;
    });
    setLiveToasts([]);
  }, [notifications, readKey]);

  const dismissNotification = useCallback(
    (signature: string) => {
      setDismissedSignatures((prev) => {
        if (prev.includes(signature)) return prev;
        const next = [...prev, signature];
        writeStringArray(dismissedKey, next);
        return next;
      });
      setLiveToasts((prev) => prev.filter((t) => t.signature !== signature));
    },
    [dismissedKey]
  );

  const dismissToast = useCallback((signature: string) => {
    setLiveToasts((prev) => prev.filter((t) => t.signature !== signature));
  }, []);

  const resetDismissed = useCallback(() => {
    setDismissedSignatures([]);
    writeStringArray(dismissedKey, []);
    seenInSessionRef.current = new Set();
  }, [dismissedKey]);

  return {
    notifications,
    unreadCount,
    liveToasts,
    thresholdDays,
    dismissedCount: dismissedSignatures.length,
    setThresholdDays,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    dismissToast,
    resetDismissed,
  };
}
