import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, Check, CheckCheck, Pencil, X } from 'lucide-react';
import { getProgramById } from '../data/programs';
import {
  AlertThresholdDays,
  ExpirationNotification,
} from '../hooks/useExpirationNotifications';
import { LoyaltyAccount } from '../types';
import { formatCurrency, formatDateBR, formatPoints } from '../utils/formatters';

interface NotificationCenterProps {
  notifications: ExpirationNotification[];
  unreadCount: number;
  thresholdDays: AlertThresholdDays;
  dismissedCount: number;
  onChangeThreshold: (days: AlertThresholdDays) => void;
  onMarkAsRead: (signature: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (signature: string) => void;
  onResetDismissed: () => void;
  onViewPrograms: () => void;
  onEditAccount: (account: LoyaltyAccount) => void;
}

export function NotificationCenter({
  notifications,
  unreadCount,
  thresholdDays,
  dismissedCount,
  onChangeThreshold,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onResetDismissed,
  onViewPrograms,
  onEditAccount,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificações de expiração (${unreadCount} não lidas)`}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white font-mono-nums text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Central de notificações de expiração"
          className="absolute right-0 mt-2 w-[360px] sm:w-[400px] max-w-[92vw] bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Notificações de Expiração
              </h2>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0
                  ? `${unreadCount} alerta(s) não lido(s)`
                  : 'Todos os alertas lidos'}
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Marcar lidas</span>
              </button>
            )}
          </div>

          {/* Threshold Selector */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-600">
              Disparar aviso até:
            </span>
            <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-md">
              {([15, 30, 60] as AlertThresholdDays[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => onChangeThreshold(days)}
                  className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
                    thresholdDays === days
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="px-5 py-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  Nenhum alerta pendente para os próximos {thresholdDays} dias
                </p>
                <p className="text-xs text-slate-500">
                  Você será notificado automaticamente sempre que uma conta se aproximar do vencimento.
                </p>
                {dismissedCount > 0 && (
                  <button
                    type="button"
                    onClick={onResetDismissed}
                    className="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-4"
                  >
                    Restaurar alertas dispensados ({dismissedCount})
                  </button>
                )}
              </div>
            ) : (
              notifications.map((item) => {
                const prog = getProgramById(item.account.programId);
                return (
                  <div
                    key={item.signature}
                    className={`px-4 py-3.5 space-y-2 transition-colors ${
                      item.isRead ? 'bg-white' : 'bg-amber-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center text-white font-display font-bold text-xs shrink-0 mt-0.5"
                          style={{ backgroundColor: prog.accentHex }}
                        >
                          {prog.shortCode}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {item.account.programName} · {item.account.holderName}
                          </p>
                          <p
                            className={`text-xs font-semibold mt-0.5 flex items-center gap-1 ${
                              item.severity === 'expired' || item.severity === 'critical'
                                ? 'text-red-600'
                                : 'text-amber-700'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>
                              {item.severity === 'expired'
                                ? `Expirado há ${Math.abs(item.daysRemaining)} dia(s)`
                                : `Expira em ${item.daysRemaining} dia(s)`}
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono-nums mt-0.5">
                            {formatPoints(item.account.expiringPoints)} pts (~
                            {formatCurrency(item.riskValueBrl)}) ·{' '}
                            {formatDateBR(item.account.expirationDate)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!item.isRead && (
                          <button
                            type="button"
                            onClick={() => onMarkAsRead(item.signature)}
                            title="Marcar como lida"
                            className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-slate-100"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDismiss(item.signature)}
                          title="Dispensar alerta"
                          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pl-10 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          onMarkAsRead(item.signature);
                          onEditAccount(item.account);
                          setOpen(false);
                        }}
                        className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Atualizar validade</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onMarkAsRead(item.signature);
                          onViewPrograms();
                          setOpen(false);
                        }}
                        className="font-semibold text-teal-700 hover:text-teal-800"
                      >
                        Ver contas
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
