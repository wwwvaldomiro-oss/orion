import { useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { getProgramById } from '../data/programs';
import { FamilyHolder, LoyaltyAccount, ProgramCategory } from '../types';
import {
  daysUntilDate,
  formatCurrency,
  formatDateBR,
  formatPoints,
} from '../utils/formatters';

interface ProgramsViewProps {
  accounts: LoyaltyAccount[];
  holders: FamilyHolder[];
  onOpenNewAccount: () => void;
  onEditAccount: (acc: LoyaltyAccount) => void;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onOpenNewTx: (accountId: string) => void;
}

export function ProgramsView({
  accounts,
  holders,
  onOpenNewAccount,
  onEditAccount,
  onDeleteAccount,
  onOpenNewTx,
}: ProgramsViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProgramCategory>('all');
  const [holderFilter, setHolderFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = accounts.filter((acc) => {
    if (categoryFilter !== 'all' && acc.category !== categoryFilter) return false;
    if (holderFilter !== 'all' && acc.holderId !== holderFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        acc.programName.toLowerCase().includes(q) ||
        acc.holderName.toLowerCase().includes(q) ||
        acc.accountNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredTotal = filtered.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'aerea', label: 'Companhias Aéreas' },
              { id: 'banco', label: 'Bancos & Cartões' },
              { id: 'varejo', label: 'Varejo & Hotéis' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                categoryFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <select
            value={holderFilter}
            onChange={(e) => setHolderFilter(e.target.value)}
            aria-label="Filtrar por titular"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="all">Todos os titulares</option>
            {holders.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar programa ou conta..."
              className="w-full sm:w-56 pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </div>
      </div>

      {/* Summary line */}
      <div className="flex items-center justify-between text-xs text-slate-600 px-1">
        <span>
          Exibindo <strong className="text-slate-900">{filtered.length}</strong> conta(s)
        </span>
        <span className="font-mono-nums">
          Subtotal filtrado: <strong className="text-slate-900">{formatPoints(filteredTotal)} pts</strong>
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="font-display text-base font-bold text-slate-900">
            Nenhuma conta encontrada com os filtros atuais
          </p>
          <p className="text-xs text-slate-500">
            Altere o filtro acima ou conecte um novo programa de fidelidade.
          </p>
          <button
            type="button"
            onClick={onOpenNewAccount}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Conectar Programa</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((acc) => {
            const prog = getProgramById(acc.programId);
            const days = daysUntilDate(acc.expirationDate);
            const marketValue = (acc.balance / 1000) * (prog.marketCpm || acc.avgCpm || 20);
            const isCritical = acc.expiringPoints > 0 && days !== null && days <= 15;
            const isWarning = acc.expiringPoints > 0 && days !== null && days > 15 && days <= 45;

            return (
              <div
                key={acc.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-display font-bold text-sm shrink-0"
                        style={{ backgroundColor: prog.accentHex }}
                      >
                        {prog.shortCode}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-bold text-slate-900 truncate">
                          {acc.programName}
                        </h3>
                        <p className="text-xs text-slate-500 truncate">
                          {acc.holderName} · {acc.tier}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditAccount(acc)}
                        aria-label={`Editar ${acc.programName}`}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === acc.id ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteAccount(acc.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(acc.id)}
                          aria-label={`Remover ${acc.programName}`}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Balance & Value */}
                  <div className="pt-3 border-t border-slate-100 flex items-baseline justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-500">Saldo disponível</p>
                      <p className="font-mono-nums text-2xl font-bold text-slate-900">
                        {formatPoints(acc.balance)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Valor estimado</p>
                      <p className="font-mono-nums text-sm font-semibold text-teal-700">
                        {formatCurrency(marketValue)}
                      </p>
                    </div>
                  </div>

                  {/* Metadata rows */}
                  <div className="space-y-2 text-xs pt-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Conta / Cadastro</span>
                      <span className="font-mono-nums text-slate-900">{acc.accountNumber}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Custo Médio (CPM)</span>
                      <span className="font-mono-nums text-slate-900">
                        {formatCurrency(acc.avgCpm)} / mil
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>A expirar</span>
                      <span
                        className={`font-mono-nums font-semibold ${
                          isCritical
                            ? 'text-red-600'
                            : isWarning
                              ? 'text-amber-600'
                              : 'text-slate-800'
                        }`}
                      >
                        {acc.expiringPoints > 0
                          ? `${formatPoints(acc.expiringPoints)} em ${formatDateBR(acc.expirationDate)}`
                          : 'Sem pontos próximos'}
                      </span>
                    </div>
                    {acc.category === 'aerea' && acc.cpfLimit > 0 && (
                      <div className="pt-1 space-y-1">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>CPFs emitidos no ano</span>
                          <span className="font-mono-nums font-semibold text-slate-900">
                            {acc.cpfsUsed} / {acc.cpfLimit}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              acc.cpfsUsed / acc.cpfLimit >= 0.85
                                ? 'bg-red-500'
                                : 'bg-teal-600'
                            }`}
                            style={{
                              width: `${Math.min(100, (acc.cpfsUsed / acc.cpfLimit) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenNewTx(acc.id)}
                    className="w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Lançar Crédito / Resgate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
