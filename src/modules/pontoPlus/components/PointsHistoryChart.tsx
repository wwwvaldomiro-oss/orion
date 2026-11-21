import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PointTransaction } from '../types';
import { formatPoints } from '../utils/formatters';

interface PointsHistoryChartProps {
  transactions: PointTransaction[];
  currentTotalBalance: number;
}

interface MonthlyMetric {
  monthKey: string;
  label: string;
  acumulados: number;
  utilizados: number;
  saldoLiquido: number;
  saldoProjetado: number;
}

type ChartMode = 'flow' | 'balance';

function buildLastSixMonths(): { monthKey: string; label: string }[] {
  const now = new Date();
  const months: { monthKey: string; label: string }[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
      .format(d)
      .replace('.', '');
    const capitalized = shortMonth.charAt(0).toUpperCase() + shortMonth.slice(1);
    months.push({
      monthKey: `${y}-${m}`,
      label: `${capitalized}/${String(y).slice(-2)}`,
    });
  }

  return months;
}

function formatCompactAxis(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number;
  dataKey?: string;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  mode: ChartMode;
}

function ChartTooltip({ active, payload, label, mode }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-slate-900 text-white rounded-lg px-3.5 py-2.5 shadow-lg border border-slate-800 text-xs space-y-1.5">
      <p className="font-semibold text-slate-200">{label}</p>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center justify-between gap-5">
          <span className="text-slate-300">
            {entry.dataKey === 'acumulados'
              ? 'Pontos acumulados'
              : entry.dataKey === 'utilizados'
                ? 'Resgates e saídas'
                : mode === 'balance'
                  ? 'Saldo consolidado'
                  : entry.name}
          </span>
          <span className="font-mono-nums font-bold text-white">
            {formatPoints(Number(entry.value || 0))} pts
          </span>
        </div>
      ))}
    </div>
  );
}

export function PointsHistoryChart({
  transactions,
  currentTotalBalance,
}: PointsHistoryChartProps) {
  const [mode, setMode] = useState<ChartMode>('flow');

  const chartData = useMemo<MonthlyMetric[]>(() => {
    const months = buildLastSixMonths();
    const bucketMap = new Map<string, { acumulados: number; utilizados: number }>();

    for (const m of months) {
      bucketMap.set(m.monthKey, { acumulados: 0, utilizados: 0 });
    }

    for (const tx of transactions) {
      const key = tx.date?.slice(0, 7);
      if (!key || !bucketMap.has(key)) continue;
      const bucket = bucketMap.get(key)!;
      if (tx.points > 0) {
        bucket.acumulados += tx.points;
      } else if (tx.points < 0) {
        bucket.utilizados += Math.abs(tx.points);
      }
    }

    const baseRows = months.map((m) => {
      const b = bucketMap.get(m.monthKey) || { acumulados: 0, utilizados: 0 };
      return {
        monthKey: m.monthKey,
        label: m.label,
        acumulados: Math.round(b.acumulados),
        utilizados: Math.round(b.utilizados),
        saldoLiquido: Math.round(b.acumulados - b.utilizados),
        saldoProjetado: 0,
      };
    });

    // Reconstruct end-of-month balance backwards from currentTotalBalance
    let runningBalance = currentTotalBalance;
    for (let i = baseRows.length - 1; i >= 0; i -= 1) {
      const row = baseRows[i];
      if (!row) continue;
      row.saldoProjetado = Math.max(0, Math.round(runningBalance));
      runningBalance -= row.saldoLiquido;
    }

    return baseRows;
  }, [transactions, currentTotalBalance]);

  const totalEarned6m = chartData.reduce((sum, item) => sum + item.acumulados, 0);
  const totalUsed6m = chartData.reduce((sum, item) => sum + item.utilizados, 0);
  const avgEarnedMonthly = Math.round(totalEarned6m / 6);

  return (
    <section
      aria-label="Histórico de acúmulo de pontos nos últimos 6 meses"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Histórico de Acúmulo (Últimos 6 Meses)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Entradas de pontos, resgates e evolução mensal consolidada
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode('flow')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              mode === 'flow'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Acúmulo vs. Resgates
          </button>
          <button
            type="button"
            onClick={() => setMode('balance')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              mode === 'balance'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Evolução do Saldo
          </button>
        </div>
      </div>

      {/* Inline 6-month metrics summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3 border-y border-slate-100">
        <div>
          <p className="text-xs text-slate-500">Total acumulado (6 meses)</p>
          <p className="font-mono-nums text-lg font-bold text-teal-700 mt-0.5">
            +{formatPoints(totalEarned6m)} pts
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Resgates e saídas (6 meses)</p>
          <p className="font-mono-nums text-lg font-bold text-slate-900 mt-0.5">
            {formatPoints(totalUsed6m)} pts
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Média mensal de acúmulo</p>
          <p className="font-mono-nums text-lg font-bold text-slate-900 mt-0.5">
            {formatPoints(avgEarnedMonthly)} pts/mês
          </p>
        </div>
      </div>

      {/* Recharts Container */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {mode === 'flow' ? (
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              barGap={6}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748B', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={formatCompactAxis}
                tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Tooltip
                cursor={{ fill: '#F8FAFC' }}
                content={<ChartTooltip mode={mode} />}
              />
              <Bar
                dataKey="acumulados"
                name="Acumulados"
                fill="#0F766E"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                dataKey="utilizados"
                name="Resgates e Vendas"
                fill="#CBD5E1"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          ) : (
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            >
              <defs>
                <linearGradient id="pontoPlusSaldoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0F766E" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#0F766E" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748B', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={formatCompactAxis}
                tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Tooltip content={<ChartTooltip mode={mode} />} />
              <Area
                type="monotone"
                dataKey="saldoProjetado"
                name="Saldo Consolidado"
                stroke="#0F766E"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#pontoPlusSaldoGrad)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        {mode === 'flow' ? (
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0F766E]" aria-hidden="true" />
              <span>Pontos acumulados</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#CBD5E1]" aria-hidden="true" />
              <span>Resgates e saídas</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#0F766E]" aria-hidden="true" />
            <span>Saldo total consolidado ao final de cada mês</span>
          </div>
        )}
        <span>Atualizado automaticamente a partir do seu extrato</span>
      </div>
    </section>
  );
}
