import { ArrowRight, TrendingUp } from 'lucide-react';
import { getProgramById } from '../data/programs';
import { ExpirationAlerts } from './ExpirationAlerts';
import { PointsHistoryChart } from './PointsHistoryChart';
import {
  AppSection,
  FamilyHolder,
  LoyaltyAccount,
  PointTransaction,
} from '../types';
import {
  daysUntilDate,
  formatCurrency,
  formatDateBR,
  formatPoints,
} from '../utils/formatters';

interface DashboardViewProps {
  accounts: LoyaltyAccount[];
  holders: FamilyHolder[];
  transactions: PointTransaction[];
  onNavigate: (section: AppSection) => void;
  onOpenNewAccount: () => void;
  onEditAccount: (account: LoyaltyAccount) => void;
}

export function DashboardView({
  accounts,
  holders,
  transactions,
  onNavigate,
  onOpenNewAccount,
  onEditAccount,
}: DashboardViewProps) {
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  const weightedAvgCpm =
    totalBalance > 0
      ? accounts.reduce((sum, a) => sum + (a.balance / 1000) * a.avgCpm, 0) /
        (totalBalance / 1000)
      : 0;

  const estimatedMarketValue = accounts.reduce((sum, a) => {
    const prog = getProgramById(a.programId);
    const unitCpm = prog.marketCpm || a.avgCpm || 20;
    return sum + (a.balance / 1000) * unitCpm;
  }, 0);

  const expiringAccounts = accounts
    .map((a) => ({
      account: a,
      days: daysUntilDate(a.expirationDate),
    }))
    .filter((item) => item.account.expiringPoints > 0 && item.days !== null)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  const expiringSoon60 = expiringAccounts
    .filter((item) => (item.days ?? 999) <= 60)
    .reduce((sum, item) => sum + item.account.expiringPoints, 0);

  const expiringAccountsCount = expiringAccounts.filter(
    (item) => (item.days ?? 999) <= 60
  ).length;

  // Group balances by program for horizontal bar breakdown
  const programMap = new Map<
    string,
    { programId: string; name: string; balance: number; valueBrl: number; color: string }
  >();
  for (const acc of accounts) {
    const prog = getProgramById(acc.programId);
    const current = programMap.get(acc.programId) || {
      programId: acc.programId,
      name: acc.programName,
      balance: 0,
      valueBrl: 0,
      color: prog.accentHex,
    };
    current.balance += acc.balance;
    current.valueBrl += (acc.balance / 1000) * (prog.marketCpm || 20);
    programMap.set(acc.programId, current);
  }
  const programBreakdown = Array.from(programMap.values()).sort(
    (a, b) => b.balance - a.balance
  );

  // Holder balances & CPF tracking
  const holderSummary = holders.map((h) => {
    const hAccounts = accounts.filter((a) => a.holderId === h.id);
    const totalPts = hAccounts.reduce((s, a) => s + a.balance, 0);
    const airAccounts = hAccounts.filter((a) => a.category === 'aerea' && a.cpfLimit > 0);
    const maxCpfRatio = airAccounts.reduce((max, a) => {
      const r = a.cpfLimit > 0 ? a.cpfsUsed / a.cpfLimit : 0;
      return Math.max(max, r);
    }, 0);
    return {
      holder: h,
      accountsCount: hAccounts.length,
      totalPts,
      airAccounts,
      maxCpfRatio,
    };
  });

  if (accounts.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
        <h2 className="font-display text-xl font-bold text-slate-900">
          Sua carteira de milhas está vazia
        </h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Conecte seu primeiro programa de fidelidade (LATAM Pass, Smiles, Azul, Livelo ou Esfera)
          para acompanhar saldos, movimentações e alertas de vencimento.
        </p>
        <button
          type="button"
          onClick={onOpenNewAccount}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors"
        >
          Conectar Primeiro Programa
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* KPI Strip */}
      <section aria-label="Indicadores da carteira" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Saldo Total Consolidado</p>
          <p className="mt-2 font-mono-nums text-2xl sm:text-3xl font-bold text-slate-900">
            {formatPoints(totalBalance)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {accounts.length} contas · {holders.length} titulares ativos
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Patrimônio Estimado em Milhas</p>
          <p className="mt-2 font-mono-nums text-2xl sm:text-3xl font-bold text-teal-700">
            {formatCurrency(estimatedMarketValue)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            Cotação média de mercado atualizada
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">A Expirar (próximos 60 dias)</p>
          <p
            className={`mt-2 font-mono-nums text-2xl sm:text-3xl font-bold ${
              expiringSoon60 > 0 ? 'text-amber-600' : 'text-slate-900'
            }`}
          >
            {formatPoints(expiringSoon60)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {expiringAccountsCount > 0
              ? `${expiringAccountsCount} conta(s) com alerta preventivo`
              : 'Nenhum vencimento crítico nos próximos 60 dias'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Custo Médio Geral (CPM)</p>
          <p className="mt-2 font-mono-nums text-2xl sm:text-3xl font-bold text-slate-900">
            {formatCurrency(weightedAvgCpm)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            Por 1.000 pontos/milhas · {transactions.length} movimentações
          </p>
        </div>
      </section>

      {/* 6-Month Points Accumulation History (Recharts) */}
      <PointsHistoryChart
        transactions={transactions}
        currentTotalBalance={totalBalance}
      />

      {/* Main Split: Program Distribution + Expiration Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Distribuição por Programa
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Participação de cada programa no saldo total consolidado
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('programs')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Gerenciar contas</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {programBreakdown.map((item) => {
              const pct = totalBalance > 0 ? (item.balance / totalBalance) * 100 : 0;
              return (
                <div key={item.programId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-slate-900 truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono-nums text-xs">
                      <span className="text-slate-500">{formatCurrency(item.valueBrl)}</span>
                      <span className="font-semibold text-slate-900 w-24 text-right">
                        {formatPoints(item.balance)}
                      </span>
                      <span className="text-slate-400 w-11 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(3, pct)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expiration Alerts */}
        <div className="lg:col-span-5">
          <ExpirationAlerts
            accounts={accounts}
            onNavigate={onNavigate}
            onEditAccount={onEditAccount}
          />
        </div>
      </div>

      {/* Bottom Split: Family Holders + Recent Activity & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Familiares e Controle de CPFs
              </h2>
              <p className="text-xs text-slate-500">
                Saldos agrupados por titular e cota anual de emissões
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('family')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              Gerenciar titulares
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 px-6">Titular</th>
                  <th className="py-2.5 px-4 text-right">Saldo Total</th>
                  <th className="py-2.5 px-6 text-right">CPFs em Aéreas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {holderSummary.map(({ holder, accountsCount, totalPts, airAccounts }) => (
                  <tr key={holder.id} className="hover:bg-slate-50">
                    <td className="py-3 px-6">
                      <p className="font-semibold text-slate-900">{holder.name}</p>
                      <p className="text-xs text-slate-500">
                        {holder.relationship} · {accountsCount} programa(s)
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums font-semibold text-slate-900">
                      {formatPoints(totalPts)}
                    </td>
                    <td className="py-3 px-6 text-right text-xs text-slate-600 font-mono-nums">
                      {airAccounts.length > 0
                        ? airAccounts
                            .map((a) => `${getProgramById(a.programId).shortCode} ${a.cpfsUsed}/${a.cpfLimit}`)
                            .join(' · ')
                        : 'Sem limite'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Movimentações Recentes
              </h2>
              <p className="text-xs text-slate-500">
                Últimos lançamentos registrados no extrato unificado
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ledger')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
            >
              Ver extrato
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {transactions.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TrendingUp
                    className={`w-4 h-4 shrink-0 ${
                      tx.points >= 0 ? 'text-teal-600' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {tx.description}
                    </p>
                    <p className="text-xs text-slate-500">
                      {tx.programName} · {tx.holderName} · {formatDateBR(tx.date)}
                    </p>
                  </div>
                </div>
                <span
                  className={`font-mono-nums text-sm font-semibold shrink-0 ${
                    tx.points >= 0 ? 'text-teal-700' : 'text-slate-700'
                  }`}
                >
                  {tx.points >= 0 ? `+${formatPoints(tx.points)}` : formatPoints(tx.points)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
