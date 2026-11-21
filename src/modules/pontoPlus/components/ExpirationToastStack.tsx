import { AlertTriangle, X } from 'lucide-react';
import { ExpirationNotification } from '../hooks/useExpirationNotifications';
import { LoyaltyAccount } from '../types';
import { formatDateBR, formatPoints } from '../utils/formatters';

interface ExpirationToastStackProps {
  toasts: ExpirationNotification[];
  hasActionToast: boolean;
  onDismissToast: (signature: string) => void;
  onInspectAccount: (account: LoyaltyAccount, signature: string) => void;
}

export function ExpirationToastStack({
  toasts,
  hasActionToast,
  onDismissToast,
  onInspectAccount,
}: ExpirationToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className={`fixed right-5 z-40 flex flex-col gap-2.5 w-[350px] max-w-[calc(100vw-2.5rem)] transition-all ${
        hasActionToast ? 'bottom-20' : 'bottom-5'
      }`}
    >
      {toasts.map((item) => {
        const isCritical = item.severity === 'expired' || item.severity === 'critical';
        return (
          <div
            key={item.signature}
            role="alert"
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-lg space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    isCritical ? 'text-red-600' : 'text-amber-600'
                  }`}
                />
                <div className="min-w-0">
                  <p
                    className={`text-xs font-bold ${
                      isCritical ? 'text-red-700' : 'text-amber-700'
                    }`}
                  >
                    {item.severity === 'expired'
                      ? `Saldo expirado há ${Math.abs(item.daysRemaining)} dia(s)`
                      : `Alerta de Expiração · ${item.daysRemaining} dia(s)`}
                  </p>
                  <p className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                    {item.account.programName} ({item.account.holderName})
                  </p>
                  <p className="text-[11px] text-slate-600 font-mono-nums mt-0.5">
                    {formatPoints(item.account.expiringPoints)} pts vencem em{' '}
                    {formatDateBR(item.account.expirationDate)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDismissToast(item.signature)}
                aria-label="Fechar alerta"
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => onDismissToast(item.signature)}
                className="text-slate-500 hover:text-slate-800 font-medium"
              >
                Dispensar
              </button>
              <button
                type="button"
                onClick={() => onInspectAccount(item.account, item.signature)}
                className="font-semibold text-teal-700 hover:text-teal-800"
              >
                Ajustar conta
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
