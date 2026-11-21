import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { PROGRAM_CATALOG, getProgramById } from '../data/programs';
import { FamilyHolder, LoyaltyAccount } from '../types';
import { addDaysISO, getTodayISO } from '../utils/formatters';

interface AccountModalProps {
  open: boolean;
  editingAccount: LoyaltyAccount | null;
  holders: FamilyHolder[];
  onClose: () => void;
  onSaveNew: (input: Omit<LoyaltyAccount, 'id' | 'ownerId'>) => Promise<void>;
  onSaveEdit: (
    accountId: string,
    patch: Pick<
      LoyaltyAccount,
      | 'accountNumber'
      | 'tier'
      | 'cpfLimit'
      | 'cpfsUsed'
      | 'expiringPoints'
      | 'expirationDate'
      | 'avgCpm'
      | 'balance'
      | 'holderId'
      | 'holderName'
    >
  ) => Promise<void>;
}

export function AccountModal({
  open,
  editingAccount,
  holders,
  onClose,
  onSaveNew,
  onSaveEdit,
}: AccountModalProps) {
  const [programId, setProgramId] = useState('latam');
  const [holderId, setHolderId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [tier, setTier] = useState('');
  const [balance, setBalance] = useState('50000');
  const [expiringPoints, setExpiringPoints] = useState('0');
  const [expirationDate, setExpirationDate] = useState(addDaysISO(getTodayISO(), 90));
  const [avgCpm, setAvgCpm] = useState('20');
  const [cpfsUsed, setCpfsUsed] = useState('0');
  const [cpfLimit, setCpfLimit] = useState('24');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingAccount) {
      setProgramId(editingAccount.programId);
      setHolderId(editingAccount.holderId);
      setAccountNumber(editingAccount.accountNumber);
      setTier(editingAccount.tier);
      setBalance(String(editingAccount.balance));
      setExpiringPoints(String(editingAccount.expiringPoints));
      setExpirationDate(editingAccount.expirationDate || addDaysISO(getTodayISO(), 90));
      setAvgCpm(String(editingAccount.avgCpm));
      setCpfsUsed(String(editingAccount.cpfsUsed));
      setCpfLimit(String(editingAccount.cpfLimit));
    } else {
      const prog = getProgramById('latam');
      setProgramId(prog.id);
      setHolderId(holders[0]?.id || '__AUTO_HOLDER__');
      setAccountNumber('');
      setTier(prog.tiers[0] || 'Padrão');
      setBalance('25000');
      setExpiringPoints('0');
      setExpirationDate(addDaysISO(getTodayISO(), 90));
      setAvgCpm(String(prog.marketCpm));
      setCpfsUsed('0');
      setCpfLimit(String(prog.defaultCpfLimit));
    }
  }, [open, editingAccount, holders]);

  if (!open) return null;

  const selectedProgram = getProgramById(programId);

  const handleProgramChange = (nextId: string) => {
    setProgramId(nextId);
    const p = getProgramById(nextId);
    setTier(p.tiers[0] || 'Padrão');
    setAvgCpm(String(p.marketCpm));
    setCpfLimit(String(p.defaultCpfLimit));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isAutoHolder = !editingAccount && holderId === '__AUTO_HOLDER__' && holders.length === 0;
    const chosenHolder = holders.find((h) => h.id === holderId);
    if (!chosenHolder && !isAutoHolder) {
      setError('Cadastre um titular na aba Familiares & CPFs antes de conectar uma conta.');
      return;
    }

    const resolvedHolderId = chosenHolder ? chosenHolder.id : '__AUTO_HOLDER__';
    const resolvedHolderName = chosenHolder ? chosenHolder.name : 'Titular Principal';

    const balNum = Math.max(0, Number(balance) || 0);
    const expNum = Math.max(0, Math.min(balNum, Number(expiringPoints) || 0));
    const cpmNum = Math.max(0, Number(avgCpm) || 0);
    const usedNum = Math.max(0, Math.min(50, Number(cpfsUsed) || 0));
    const limitNum = Math.max(0, Math.min(50, Number(cpfLimit) || 0));

    setSaving(true);
    setError(null);
    try {
      if (editingAccount && chosenHolder) {
        await onSaveEdit(editingAccount.id, {
          accountNumber: accountNumber.trim() || `${selectedProgram.shortCode}-0000`,
          tier: tier.trim() || 'Padrão',
          cpfLimit: limitNum,
          cpfsUsed: usedNum,
          expiringPoints: expNum,
          expirationDate,
          avgCpm: cpmNum,
          balance: balNum,
          holderId: chosenHolder.id,
          holderName: chosenHolder.name,
        });
      } else {
        await onSaveNew({
          holderId: resolvedHolderId,
          holderName: resolvedHolderName,
          programId: selectedProgram.id,
          programName: selectedProgram.name,
          category: selectedProgram.category,
          accountNumber:
            accountNumber.trim() ||
            `${selectedProgram.shortCode}-${Math.floor(100000 + Math.random() * 899999)}`,
          tier: tier.trim() || 'Padrão',
          balance: balNum,
          expiringPoints: expNum,
          expirationDate,
          avgCpm: cpmNum,
          cpfsUsed: usedNum,
          cpfLimit: limitNum,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar conta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="account-modal-title" className="font-display text-lg font-bold text-slate-900">
            {editingAccount ? `Editar ${editingAccount.programName}` : 'Conectar Programa de Fidelidade'}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Programa
              </label>
              <select
                value={programId}
                disabled={Boolean(editingAccount)}
                onChange={(e) => handleProgramChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-100"
              >
                {PROGRAM_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Titular da Conta
              </label>
              <select
                value={holderId}
                onChange={(e) => setHolderId(e.target.value)}
                disabled={holders.length === 0}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-50"
              >
                {holders.length === 0 ? (
                  <option value="__AUTO_HOLDER__">
                    Titular Principal (criado automaticamente)
                  </option>
                ) : (
                  holders.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.relationship})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Número Fidelidade / Login
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Ex: LA-4481920"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Categoria / Clube
              </label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {selectedProgram.tiers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Saldo Atual (pontos/milhas)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                required
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Custo Médio Milheiro (R$)
              </label>
              <input
                type="number"
                min={0}
                step={0.1}
                required
                value={avgCpm}
                onChange={(e) => setAvgCpm(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pontos a Expirar
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={expiringPoints}
                onChange={(e) => setExpiringPoints(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Próximo Vencimento
              </label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          {selectedProgram.category === 'aerea' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CPFs Emitidos no Ano
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={cpfsUsed}
                  onChange={(e) => setCpfsUsed(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Limite Anual de CPFs
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={cpfLimit}
                  onChange={(e) => setCpfLimit(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60"
            >
              {saving ? 'Salvando...' : editingAccount ? 'Salvar Alterações' : 'Conectar Programa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
