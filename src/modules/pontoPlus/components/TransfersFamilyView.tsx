import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { FamilyHolder, HolderRelationship, LoyaltyAccount } from '../types';
import { formatPoints } from '../utils/formatters';

interface TransfersFamilyViewProps {
  accounts: LoyaltyAccount[];
  holders: FamilyHolder[];
  onAddHolder: (input: Omit<FamilyHolder, 'id' | 'ownerId'>) => Promise<void>;
  onDeleteHolder: (holderId: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

export function TransfersFamilyView({
  accounts,
  holders,
  onAddHolder,
  onDeleteHolder,
  onNotify,
}: TransfersFamilyViewProps) {
  const [showHolderForm, setShowHolderForm] = useState(false);
  const [holderName, setHolderName] = useState('');
  const [relationship, setRelationship] = useState<HolderRelationship>('Familiar');
  const [cpfDigits, setCpfDigits] = useState('');
  const [holderNotes, setHolderNotes] = useState('');
  const [savingHolder, setSavingHolder] = useState(false);

  const handleCreateHolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (holderName.trim().length < 2) return;
    const digits = cpfDigits.replace(/\D/g, '').padStart(6, '0').slice(0, 6);
    const cpfMasked = `***.${digits.slice(0, 3)}.${digits.slice(3, 6)}-**`;
    setSavingHolder(true);
    try {
      await onAddHolder({
        name: holderName.trim(),
        relationship,
        cpfMasked,
        notes: holderNotes.trim() || 'Gerenciamento familiar de milhas e CPFs.',
      });
      setHolderName('');
      setCpfDigits('');
      setHolderNotes('');
      setShowHolderForm(false);
      onNotify('Novo titular cadastrado na carteira familiar.');
    } finally {
      setSavingHolder(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Family & Friends Management */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Controle de Familiares e Amigos (Gestão de CPFs)
            </h2>
            <p className="text-xs text-slate-500">
              Centralize contas de parentes ou amigos e acompanhe o limite anual de emissão por CPF em cada companhia.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHolderForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Titular</span>
          </button>
        </div>

        {showHolderForm && (
          <form
            onSubmit={handleCreateHolder}
            className="p-6 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome Completo
              </label>
              <input
                type="text"
                required
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="Ex: Fernanda Oliveira"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vínculo
              </label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as HolderRelationship)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="Titular">Titular</option>
                <option value="Cônjuge">Cônjuge</option>
                <option value="Familiar">Familiar</option>
                <option value="Amigo">Amigo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                6 dígitos centrais CPF
              </label>
              <input
                type="text"
                maxLength={8}
                value={cpfDigits}
                onChange={(e) => setCpfDigits(e.target.value)}
                placeholder="Ex: 482910"
                className="w-full px-3 py-2 text-sm font-mono-nums bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingHolder}
                className="w-full py-2 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800"
              >
                {savingHolder ? 'Salvando...' : 'Salvar Titular'}
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-slate-100">
          {holders.map((h) => {
            const hAccounts = accounts.filter((a) => a.holderId === h.id);
            const hBalance = hAccounts.reduce((s, a) => s + a.balance, 0);
            const canDelete = hAccounts.length === 0 && holders.length > 1;

            return (
              <div
                key={h.id}
                className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-sm font-bold text-slate-900">
                        {h.name}
                      </h3>
                      <span className="text-xs text-slate-500">
                        · {h.relationship} · CPF {h.cpfMasked}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{h.notes}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-mono-nums text-slate-700">
                      {hAccounts.length === 0 ? (
                        <span className="text-slate-400">Sem contas conectadas</span>
                      ) : (
                        hAccounts.map((acc) => (
                          <span key={acc.id}>
                            {acc.programName}: <strong>{formatPoints(acc.balance)}</strong>
                            {acc.cpfLimit > 0 ? ` (${acc.cpfsUsed}/${acc.cpfLimit} CPFs)` : ''}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                  <div className="text-left lg:text-right">
                    <p className="text-xs text-slate-500">Saldo do Titular</p>
                    <p className="font-mono-nums text-lg font-bold text-slate-900">
                      {formatPoints(hBalance)} pts
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => onDeleteHolder(h.id)}
                      title="Remover titular sem contas"
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
