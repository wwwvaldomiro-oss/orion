import React, { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useGarage } from "../context/garageContext";
import { reminderSchema } from "../schemas/garage.schemas";

interface ReminderFormModalProps {
  open: boolean;
  onClose: () => void;
}

export const ReminderFormModal: React.FC<ReminderFormModalProps> = ({ open, onClose }) => {
  const { snapshot, selectedVehicleFilter, addReminder } = useGarage();
  const [vehicleId, setVehicleId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"MANUTENCAO" | "DOCUMENTACAO" | "SEGURO" | "OUTRO">(
    "MANUTENCAO",
  );
  const [dueDate, setDueDate] = useState("");
  const [dueOdometer, setDueOdometer] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const defaultId =
      selectedVehicleFilter !== "TODOS"
        ? selectedVehicleFilter
        : snapshot.vehicles[0]?.id ?? "";
    setVehicleId(defaultId);
    setTitle("");
    setCategory("MANUTENCAO");
    setDueDate("");
    setDueOdometer("");
    setNotes("");
    setErrorMsg(null);
  }, [open, selectedVehicleFilter, snapshot.vehicles]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = reminderSchema.safeParse({
      vehicleId,
      title,
      category,
      dueDate: dueDate || undefined,
      dueOdometer: dueOdometer ? Number(dueOdometer) : undefined,
      notes: notes || undefined,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Preencha os campos do lembrete.");
      return;
    }

    setSubmitting(true);
    try {
      await addReminder({
        vehicleId: parsed.data.vehicleId,
        title: parsed.data.title,
        category: parsed.data.category,
        dueDate: parsed.data.dueDate,
        dueOdometer: parsed.data.dueOdometer,
        notes: parsed.data.notes,
      });
      toast.success("Lembrete preventivo cadastrado.");
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao salvar lembrete.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#dce2e6] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#edf1f3] px-6 py-4">
          <h2 className="text-base font-bold text-[#0c1928]">Novo Lembrete Preventivo</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-[#52616a] hover:bg-[#f0f3f5]"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-6">
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#52616a]">Veículo *</label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
              required
            >
              <option value="">Selecione...</option>
              {snapshot.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.brand} {v.model} ({v.currentOdometer.toLocaleString("pt-BR")} km)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Título *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Troca de óleo 5W30"
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
              >
                <option value="MANUTENCAO">Manutenção / Revisão</option>
                <option value="DOCUMENTACAO">Documentação</option>
                <option value="SEGURO">Seguro Auto</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Data Alvo</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Km Alvo (hodômetro)
              </label>
              <input
                type="number"
                min={0}
                value={dueOdometer}
                onChange={(e) => setDueOdometer(e.target.value)}
                placeholder="Ex.: 65000"
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#52616a]">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes opcionais..."
              className="w-full rounded-lg border border-[#cbd3d8] p-2.5 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-[#edf1f3] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold text-[#52616a]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || snapshot.vehicles.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Criar lembrete
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
