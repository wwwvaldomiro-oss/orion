import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Pencil } from 'lucide-react';
import { getProgramById } from '../data/programs';
import { AppSection, LoyaltyAccount } from '../types';
import {
  daysUntilDate,
  formatCurrency,
  formatDateBR,
  formatPoints,
} from '../utils/formatters';

interface ExpirationAlertsProps {
  accounts: LoyaltyAccount[];
  onNavigate: (section: AppSection) => void;
  onEditAccount: (account: LoyaltyAccount) => void;
}

type AlertFilter = '60d' | 'all';

interface TrackedExpiration {
  account: LoyaltyAccount;
  days: number;
  riskValueBrl: number;
  severity: 'expired' | 'critical' | 'warning' | 'stable';
}

export function ExpirationAlerts({
  accounts,
  onNavigate,
  onEditAccount,
}: ExpirationAlertsProps) {
  const [filter, setFilter] = useState<AlertFilter>('60d');

  const trackedItems = useMemo<TrackedExpiration[]>(() => {
    return accounts
      .map((account) => {
        const days = daysUntilDate(account.expirationDate);
        if (account.expiringPoints <= 0 || days === null) return null;

        const prog = getProgramById(account.programId);
        const unitCpm = prog.marketCpm || account.avgCpm || 20;
        const riskValueBrl = (account.expiringPoints / 1000) * unitCpm;

        let severity: TrackedExpiration['severity'] = 'stable';
        if (days < 0) severity = 'expired';
        else if (days <= 15) severity = 'critical';
        else if (days <= 60) severity = 'warning';

        return { account, days, riskValueBrl, severity };
      })
      .filter((item): item is TrackedExpiration => item !== null)
      .sort((a, b) => a.days - b.days);
  }, [accounts]);

  const within60Days = useMemo(
    () => trackedItems.filter((item) => item.days <= 60),
    [trackedItems]
  );

  const total60Points = within60Days.reduce(
    (sum, item) => sum + item.account.expiringPoints,
    0
  );
  const total60RiskBrl = within60Days.reduce((sum, item) => sum + item.riskValueBrl, 0);
  const visibleItems = filter === '60d' ? within60Days : trackedItems;

  return (
    <section
      aria-label="Alertas de Expiração"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <CalendarClock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Alertas de Expiração
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoramento automático de pontos próximos do vencimento
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilter('60d')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === '60d'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Próximos 60 dias ({within60Days.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({trackedItems.length})
          </button>
        </div>
      </div>

      {/* 60-Day Warning Strip */}
      {within60Days.length > 0 ? (
        <div
          role="alert"
          className="px-6 py-3.5 bg-amber-50/80 border-y border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Aviso: {formatPoints(total60Points)} pontos expiram nos próximos 60 dias
              </p>
              <p className="text-amber-800 mt-0.5">
                {within60Days.length} programa(s) em janela de atenção · Valor estimado em risco:{' '}
                <strong className="font-mono-nums">{formatCurrency(total60RiskBrl)}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('programs')}
            className="text-xs font-semibold text-amber-900 hover:text-amber-950 underline underline-offset-4 whitespace-nowrap self-start sm:self-center"
          >
            Gerenciar contas
          </button>
        </div>
      ) : (
        <div className="px-6 py-3.5 bg-teal-50/60 border-y border-teal-200 flex items-center gap-2.5 text-xs text-teal-900">
          <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
          <p className="font-medium">
            Nenhum saldo programado para expirar nos próximos 60 dias.
          </p>
        </div>
      )}

      {/* Tracked Accounts List */}
      {visibleItems.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-slate-500">
          {filter === '60d'
            ? 'Nenhuma conta possui vencimento dentro dos próximos 60 dias.'
            : 'Nenhuma conta possui pontos com data de validade cadastrada.'}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visibleItems.map(({ account, days, riskValueBrl, severity }) => {
            const prog = getProgramById(account.programId);
            const urgencyPct =
              days <= 0 ? 100 : days >= 60 ? 12 : Math.round(((60 - days) / 60) * 100);

            return (
              <div
                key={account.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-display font-bold text-xs shrink-0 mt-0.5"
                    style={{ backgroundColor: prog.accentHex }}
                  >
                    {prog.shortCode}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {account.programName}
                      </p>
                      <span className="text-xs text-slate-500 truncate">
                        · {account.holderName}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 font-mono-nums">
                      Vencimento: {formatDateBR(account.expirationDate)} · Conta{' '}
                      {account.accountNumber}
                    </p>

                    <div className="flex items-center gap-3 pt-0.5">
                      <span
                        className={`text-xs font-semibold ${
                          severity === 'expired' || severity === 'critical'
                            ? 'text-red-600'
                            : severity === 'warning'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {severity === 'expired'
                          ? `Expirado há ${Math.abs(days)} dia(s)`
                          : severity === 'critical'
                            ? `Crítico · ${days} dia(s) restantes`
                            : severity === 'warning'
                              ? `Atenção (60d) · ${days} dias restantes`
                              : `Monitorado · ${days} dias restantes`}
                      </span>
                      <div className="hidden sm:block w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            severity === 'expired' || severity === 'critical'
                              ? 'bg-red-600'
                              : severity === 'warning'
                                ? 'bg-amber-500'
                                : 'bg-teal-600'
                          }`}
                          style={{ width: `${Math.max(10, urgencyPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                  <div className="sm:text-right">
                    <p className="font-mono-nums text-sm font-bold text-slate-900">
                      {formatPoints(account.expiringPoints)} pts
                    </p>
                    <p className="font-mono-nums text-[11px] text-slate-500">
                      ~ {formatCurrency(riskValueBrl)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEditAccount(account)}
                      title="Atualizar data de validade"
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('programs')}
                      className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap"
                    >
                      Ver conta
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
