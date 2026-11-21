import { useState } from 'react';
import { Download, Search } from 'lucide-react';
import { LoyaltyAccount, PointTransaction, TransactionType } from '../types';
import { formatCurrency, formatDateBR, formatPoints, getTodayISO } from '../utils/formatters';

interface LedgerViewProps {
  transactions: PointTransaction[];
  accounts: LoyaltyAccount[];
  onNotify?: (msg: string) => void;
}

const TYPE_LABELS: Record<TransactionType, string> = {
  acumulo: 'Acúmulo',
  transferencia_entrada: 'Transferência (Entrada)',
  transferencia_saida: 'Transferência (Saída)',
  resgate: 'Resgate de Passagem',
  venda: 'Venda de Milhas',
  ajuste: 'Ajuste',
};

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadTransactionsCsv(items: PointTransaction[], filename: string) {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const headers = [
    'Data',
    'Data_ISO',
    'Programa',
    'Titular',
    'Tipo',
    'Descricao',
    'Pontos_Milhas',
    'CPM_BRL',
    'Valor_Total_BRL',
  ];

  const rows = sorted.map((tx) => [
    escapeCsvCell(formatDateBR(tx.date)),
    escapeCsvCell(tx.date),
    escapeCsvCell(tx.programName),
    escapeCsvCell(tx.holderName),
    escapeCsvCell(TYPE_LABELS[tx.type] || tx.type),
    escapeCsvCell(tx.description),
    escapeCsvCell(tx.points),
    escapeCsvCell(tx.cpm.toFixed(2).replace('.', ',')),
    escapeCsvCell(tx.totalBrl.toFixed(2).replace('.', ',')),
  ]);

  // UTF-8 BOM + semicolon separator works seamlessly in pt-BR Excel and Google Sheets
  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function LedgerView({ transactions, accounts, onNotify }: LedgerViewProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = transactions.filter((tx) => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (accountFilter !== 'all' && tx.accountId !== accountFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        tx.description.toLowerCase().includes(q) ||
        tx.programName.toLowerCase().includes(q) ||
        tx.holderName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const netPoints = filtered.reduce((s, tx) => s + tx.points, 0);
  const isFiltered =
    typeFilter !== 'all' || accountFilter !== 'all' || search.trim().length > 0;

  const handleExportFullHistory = () => {
    const today = getTodayISO();
    downloadTransactionsCsv(transactions, `historico-completo-pontoplus-${today}.csv`);
    onNotify?.(`Histórico completo exportado em CSV (${transactions.length} transações).`);
  };

  const handleExportFiltered = () => {
    const today = getTodayISO();
    downloadTransactionsCsv(filtered, `extrato-filtrado-pontoplus-${today}.csv`);
    onNotify?.(`Extrato filtrado exportado em CSV (${filtered.length} transações).`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | TransactionType)}
            aria-label="Filtrar por tipo"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="all">Todos os movimentos</option>
            {Object.entries(TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            aria-label="Filtrar por programa"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="all">Todas as contas</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.programName} · {acc.holderName}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar descrição..."
              className="w-full sm:w-60 pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isFiltered && filtered.length > 0 && (
            <button
              type="button"
              onClick={handleExportFiltered}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Filtro ({filtered.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportFullHistory}
            disabled={transactions.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Histórico Completo (CSV)</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>
            <strong className="text-slate-900">{filtered.length}</strong> lançamento(s)
            {isFiltered ? ` de ${transactions.length} no total` : ''}
          </span>
          <span className="font-mono-nums">
            Saldo líquido:{' '}
            <strong className={netPoints >= 0 ? 'text-teal-700' : 'text-slate-900'}>
              {netPoints >= 0 ? `+${formatPoints(netPoints)}` : formatPoints(netPoints)} pts
            </strong>
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Nenhum lançamento encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-6">Data</th>
                  <th className="py-3 px-4">Programa / Titular</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4 text-right">Valor R$</th>
                  <th className="py-3 px-6 text-right">Pontos / Milhas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="py-3 px-6 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                      {formatDateBR(tx.date)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{tx.programName}</p>
                      <p className="text-xs text-slate-500">{tx.holderName}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {TYPE_LABELS[tx.type] || tx.type}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 max-w-sm">
                      {tx.description}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                      {tx.totalBrl > 0 ? formatCurrency(tx.totalBrl) : '—'}
                    </td>
                    <td
                      className={`py-3 px-6 text-right font-mono-nums font-bold whitespace-nowrap ${
                        tx.points >= 0 ? 'text-teal-700' : 'text-slate-900'
                      }`}
                    >
                      {tx.points >= 0 ? `+${formatPoints(tx.points)}` : formatPoints(tx.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
