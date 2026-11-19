import React, { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { todayBR } from "@/lib/domain/money";
import { useGarage } from "../context/garageContext";
import { driverSchema } from "../schemas/garage.schemas";
import type { PersonalDriver } from "../types/garage.types";

interface DriverFormModalProps {
  open: boolean;
  onClose: () => void;
  editingDriver?: PersonalDriver | null;
}

export const DriverFormModal: React.FC<DriverFormModalProps> = ({
  open,
  onClose,
  editingDriver,
}) => {
  const { snapshot, upsertDriver } = useGarage();
  const [name, setName] = useState("");
  const [cnhNumber, setCnhNumber] = useState("");
  const [cnhCategory, setCnhCategory] = useState("B");
  const [cnhExpiry, setCnhExpiry] = useState(todayBR());
  const [phone, setPhone] = useState("");
  const [allowedVehicleIds, setAllowedVehicleIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingDriver) {
      setName(editingDriver.name);
      setCnhNumber(editingDriver.cnhNumber);
      setCnhCategory(editingDriver.cnhCategory);
      setCnhExpiry(editingDriver.cnhExpiry);
      setPhone(editingDriver.phone ?? "");
      setAllowedVehicleIds(editingDriver.allowedVehicleIds);
      setActive(editingDriver.active);
    } else {
      setName("");
      setCnhNumber("");
      setCnhCategory("B");
      setCnhExpiry(todayBR());
      setPhone("");
      setAllowedVehicleIds(snapshot.vehicles.map((v) => v.id));
      setActive(true);
    }
    setErrorMsg(null);
  }, [open, editingDriver, snapshot.vehicles]);

  if (!open) return null;

  const toggleVehiclePermission = (vehicleId: string) => {
    setAllowedVehicleIds((prev) =>
      prev.includes(vehicleId) ? prev.filter((id) => id !== vehicleId) : [...prev, vehicleId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = driverSchema.safeParse({
      name,
      cnhNumber,
      cnhCategory,
      cnhExpiry,
      phone: phone || undefined,
      allowedVehicleIds,
      active,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Revise os dados da CNH.");
      return;
    }

    setSubmitting(true);
    try {
      await upsertDriver({
        id: editingDriver?.id,
        ...parsed.data,
      });
      toast.success(editingDriver ? "Condutor atualizado." : "Condutor adicionado à garagem.");
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao salvar condutor.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#dce2e6] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#edf1f3] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#0c1928]">
              {editingDriver ? `Editar CNH · ${editingDriver.name}` : "Cadastrar Condutor / CNH"}
            </h2>
            <p className="text-xs text-[#52616a]">
              Controle de validade da CNH e pontuação CTB pessoal ou familiar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-[#52616a] hover:bg-[#f0f3f5]"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 overflow-y-auto p-6">
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#52616a]">
              Nome Completo *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome ou familiar"
              className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Registro CNH *
              </label>
              <input
                value={cnhNumber}
                onChange={(e) => setCnhNumber(e.target.value)}
                placeholder="00000000000"
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Categoria *
              </label>
              <select
                value={cnhCategory}
                onChange={(e) => setCnhCategory(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="AB">AB</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="E">E</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Validade CNH *
              </label>
              <input
                type="date"
                value={cnhExpiry}
                onChange={(e) => setCnhExpiry(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-xs"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Telefone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(61) 99999-9999"
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
              />
            </div>
            <label className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#0c1928]">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="size-4 accent-[#173d4a]"
              />
              Condutor ativo na garagem
            </label>
          </div>

          {snapshot.vehicles.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#52616a]">
                Veículos utilizados por este condutor
              </label>
              <div className="flex flex-wrap gap-2">
                {snapshot.vehicles.map((v) => {
                  const selected = allowedVehicleIds.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggleVehiclePermission(v.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        selected
                          ? "border-[#173d4a] bg-[#173d4a] text-white"
                          : "border-[#dce2e6] bg-[#f7f8fa] text-[#52616a]"
                      }`}
                    >
                      {v.plate} · {v.model}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[#edf1f3] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold text-[#52616a]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Salvar condutor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
