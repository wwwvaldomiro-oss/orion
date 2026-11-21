import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LoyaltyAccount, PointTransaction, TransactionType } from '../types';
import { formatCurrency, getTodayISO } from '../utils/formatters';

interface TransactionModalProps {
  open: boolean;
  accounts: LoyaltyAccount[];
  defaultAccountId?: string | null;
  onClose: () => void;
  onSave: (
    account: LoyaltyAccount,
    tx: Omit<PointTransaction, 'id' | 'ownerId' | 'accountId' | 'programName' | 'holderName'>,
    incrementCpfs: number
  ) => Promise<void>;
}

export function TransactionModal({
  open,
  accounts,
  defaultAccountId,
  onClose,
  onSave,
}: TransactionModalProps) {
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<TransactionType>('acumulo');
  const [points, setPoints] = useState('10000');
  const [cpm, setCpm] = useState('0');
  const [date, setDate] = useState(getTodayISO());
  const [description, setDescription] = useState('');
  const [usedNewCpf, setUsedNewCpf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const initialId = defaultAccountId || accounts[0]?.id || '';
    setAccountId(initialId);
    setType('acumulo');
    setPoints('10000');
    setCpm('0');
    setDate(getTodayISO());
    setDescription('');
    setUsedNewCpf(false);
  }, [open, defaultAccountId, accounts]);

  if (!open) return null;

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const absPoints = Math.max(0, Math.round(Number(points) || 0));
  const cpmNum = Math.max(0, Number(cpm) || 0);
  const totalBrl = Number(((absPoints / 1000) * cpmNum).toFixed(2));
  const isDebit = type === 'resgate' || type === 'venda' || type === 'transferencia_saida';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) {
      setError('Conecte uma conta primeiro para registrar lançamentos.');
      return;
    }
    if (absPoints <= 0) {
      setError('Informe uma quantidade de pontos maior que zero.');
      return;
    }
    if (isDebit && absPoints > selectedAccount.balance) {
      setError('Saldo insuficiente na conta selecionada para este débito.');
      return;
    }
    if (description.trim().length < 2) {
      setError('Informe uma descrição breve para o lançamento.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const signedPoints = isDebit ? -absPoints : absPoints;
      await onSave(
        selectedAccount,
        {
          type,
          points: signedPoints,
          description: description.trim(),
          date,
          cpm: cpmNum,
          totalBrl,
        },
        type === 'resgate' && usedNewCpf ? 1 : 0
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar lançamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
        className="w-full max-w-md bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="tx-modal-title" className="font-display text-lg font-bold text-slate-900">
            Novo Lançamento de Pontos
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Programa e Titular
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.programName} · {acc.holderName} ({acc.balance.toLocaleString('pt-BR')} pts)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tipo de Movimento
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TransactionType)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="acumulo">Acúmulo / Compra</option>
                <option value="resgate">Resgate de Passagem</option>
                <option value="ajuste">Ajuste Positivo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quantidade
              </label>
              <input
                type="number"
                min={1}
                step={100}
                required
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Valor Milheiro (R$)
              </label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={cpm}
                onChange={(e) => setCpm(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Descrição
            </label>
            <input
              type="text"
              required
              maxLength={140}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isDebit
                  ? 'Ex: Emissão GRU -> MIA para férias'
                  : 'Ex: Compra bonificada 10 pts/R$ parceiro'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {type === 'resgate' && selectedAccount?.category === 'aerea' && (
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={usedNewCpf}
                onChange={(e) => setUsedNewCpf(e.target.checked)}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>Contabilizar +1 CPF emitido neste programa este ano</span>
            </label>
          )}

          <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-600">Valor Financeiro Associado</span>
            <span className="font-mono-nums font-semibold text-slate-900">
              {formatCurrency(totalBrl)}
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || accounts.length === 0}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60"
            >
              {saving ? 'Registrando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
