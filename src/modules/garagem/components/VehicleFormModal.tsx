import React, { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useGarage } from "../context/garageContext";
import { vehicleSchema } from "../schemas/garage.schemas";
import type {
  FipeConsultationResponse,
  FuelType,
  PersonalVehicle,
  VehicleStatus,
} from "../types/garage.types";

interface VehicleFormModalProps {
  open: boolean;
  onClose: () => void;
  editingVehicle?: PersonalVehicle | null;
  onSaved?: (vehicleId: string) => void;
}

export const VehicleFormModal: React.FC<VehicleFormModalProps> = ({
  open,
  onClose,
  editingVehicle,
  onSaved,
}) => {
  const { snapshot, upsertVehicle } = useGarage();
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [fuelType, setFuelType] = useState<FuelType>("FLEX");
  const [currentOdometer, setCurrentOdometer] = useState("0");
  const [status, setStatus] = useState<VehicleStatus>("ATIVO");
  const [assignedDriverId, setAssignedDriverId] = useState("");
  const [renavam, setRenavam] = useState("");
  const [stateUf, setStateUf] = useState("DF");
  const [tankCapacityLiters, setTankCapacityLiters] = useState("");
  const [fipeCode, setFipeCode] = useState("");
  const [fipeValue, setFipeValue] = useState("");
  const [monthlyFixedCost, setMonthlyFixedCost] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [consultingFipe, setConsultingFipe] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingVehicle) {
      setPlate(editingVehicle.plate);
      setBrand(editingVehicle.brand);
      setModel(editingVehicle.model);
      setYear(String(editingVehicle.year));
      setFuelType(editingVehicle.fuelType);
      setCurrentOdometer(String(editingVehicle.currentOdometer));
      setStatus(editingVehicle.status);
      setAssignedDriverId(editingVehicle.assignedDriverId ?? "");
      setRenavam(editingVehicle.renavam ?? "");
      setStateUf(editingVehicle.stateUf ?? "DF");
      setTankCapacityLiters(
        editingVehicle.tankCapacityLiters ? String(editingVehicle.tankCapacityLiters) : "",
      );
      setFipeValue(editingVehicle.fipeValue ? String(editingVehicle.fipeValue) : "");
      setMonthlyFixedCost(
        editingVehicle.monthlyFixedCost ? String(editingVehicle.monthlyFixedCost) : "",
      );
      setNotes(editingVehicle.notes ?? "");
    } else {
      setPlate("");
      setBrand("");
      setModel("");
      setYear(String(new Date().getFullYear()));
      setFuelType("FLEX");
      setCurrentOdometer("0");
      setStatus("ATIVO");
      setAssignedDriverId("");
      setRenavam("");
      setStateUf("DF");
      setTankCapacityLiters("");
      setFipeCode("");
      setFipeValue("");
      setMonthlyFixedCost("");
      setNotes("");
    }
    setErrorMsg(null);
  }, [open, editingVehicle]);

  if (!open) return null;

  const handleConsultFipe = async () => {
    if (!fipeCode.trim()) {
      toast.info("Informe o código FIPE (ex.: 001494-0) para preencher marca, modelo e valor.");
      return;
    }
    setConsultingFipe(true);
    try {
      const resp = await fetch("/api/garagem/fipe-consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: plate.trim(),
          stateUf: stateUf.trim().toUpperCase() || "DF",
          fipeCode: fipeCode.trim(),
        }),
      });
      const data = (await resp.json()) as FipeConsultationResponse;
      if (data.fipePriceRecord) {
        if (data.fipePriceRecord.marca) setBrand(data.fipePriceRecord.marca);
        if (data.fipePriceRecord.modelo) setModel(data.fipePriceRecord.modelo);
        if (data.fipePriceRecord.anoModelo) setYear(String(data.fipePriceRecord.anoModelo));
        if (data.fipePriceRecord.valor) {
          const parsed = Number(
            data.fipePriceRecord.valor
              .replace(/[^\d,]/g, "")
              .replace(/\./g, "")
              .replace(",", "."),
          );
          if (Number.isFinite(parsed) && parsed > 0) {
            setFipeValue(String(parsed));
          }
        }
        toast.success("Dados preenchidos via Tabela FIPE (BrasilAPI).");
      } else {
        toast.warning(data.notice || "Código FIPE não encontrado.");
      }
    } catch {
      toast.error("Não foi possível consultar a Tabela FIPE agora.");
    } finally {
      setConsultingFipe(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = vehicleSchema.safeParse({
      plate,
      brand,
      model,
      year,
      fuelType,
      currentOdometer,
      status,
      assignedDriverId: assignedDriverId || undefined,
      renavam: renavam || undefined,
      stateUf: stateUf || undefined,
      tankCapacityLiters: tankCapacityLiters ? Number(tankCapacityLiters) : undefined,
      fipeValue: fipeValue ? Number(fipeValue) : undefined,
      monthlyFixedCost: monthlyFixedCost ? Number(monthlyFixedCost) : undefined,
      notes: notes || undefined,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Revise os campos do veículo.");
      return;
    }

    setSubmitting(true);
    try {
      const id = await upsertVehicle({
        id: editingVehicle?.id,
        name: `${parsed.data.brand} ${parsed.data.model}`.trim(),
        plate: parsed.data.plate,
        brand: parsed.data.brand,
        model: parsed.data.model,
        year: parsed.data.year,
        fuelType: parsed.data.fuelType,
        odometerKm: parsed.data.currentOdometer,
        currentOdometer: parsed.data.currentOdometer,
        status: parsed.data.status,
        assignedDriverId: parsed.data.assignedDriverId,
        renavam: parsed.data.renavam,
        stateUf: parsed.data.stateUf?.toUpperCase(),
        tankCapacityLiters: parsed.data.tankCapacityLiters,
        fipeValue: parsed.data.fipeValue,
        monthlyFixedCost: parsed.data.monthlyFixedCost,
        notes: parsed.data.notes,
      });
      toast.success(editingVehicle ? "Veículo atualizado." : "Veículo adicionado à sua garagem.");
      onSaved?.(id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao salvar veículo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#dce2e6] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#edf1f3] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#0c1928]">
              {editingVehicle ? `Editar ${editingVehicle.plate}` : "Cadastrar Veículo Pessoal"}
            </h2>
            <p className="text-xs text-[#52616a]">
              Controle de odômetro, valor FIPE, tanque e calendário IPVA/CRLV
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
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

          {/* Optional FIPE auto-fill helper */}
          <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#173d4a]">
                Preenchimento rápido via Tabela FIPE (BrasilAPI)
              </span>
              <span className="text-[11px] text-[#52616a]">Opcional</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={fipeCode}
                onChange={(e) => setFipeCode(e.target.value)}
                placeholder="Código FIPE (ex.: 001494-0)"
                className="h-9 flex-1 rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs"
              />
              <button
                type="button"
                onClick={() => void handleConsultFipe()}
                disabled={consultingFipe}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-3.5 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-60"
              >
                {consultingFipe ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Search className="size-3.5" />
                )}
                Consultar FIPE
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Placa *</label>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC1D23"
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs font-semibold uppercase"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">UF Detran</label>
              <input
                maxLength={2}
                value={stateUf}
                onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                placeholder="DF"
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs uppercase"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-semibold"
              >
                <option value="ATIVO">Em uso</option>
                <option value="MANUTENCAO">Em revisão</option>
                <option value="INATIVO">Inativo / Parado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Marca *</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex.: Honda"
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Modelo *</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex.: Civic Touring"
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">Ano *</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Combustível *
              </label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as FuelType)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
              >
                <option value="FLEX">Flex (Gasolina / Etanol)</option>
                <option value="GASOLINA">Gasolina</option>
                <option value="ETANOL">Etanol</option>
                <option value="DIESEL">Diesel</option>
                <option value="ELETRICO">Elétrico / Híbrido</option>
                <option value="GNV">GNV</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Hodômetro Atual (km) *
              </label>
              <input
                type="number"
                min={0}
                value={currentOdometer}
                onChange={(e) => setCurrentOdometer(e.target.value)}
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Tanque / Bateria (L/kWh)
              </label>
              <input
                type="number"
                step="0.1"
                value={tankCapacityLiters}
                onChange={(e) => setTankCapacityLiters(e.target.value)}
                placeholder="Ex.: 50"
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Valor FIPE (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={fipeValue}
                onChange={(e) => setFipeValue(e.target.value)}
                placeholder="Ex.: 98500"
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Seguro / Fixo Mensal (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={monthlyFixedCost}
                onChange={(e) => setMonthlyFixedCost(e.target.value)}
                placeholder="Opcional"
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">RENAVAM</label>
              <input
                value={renavam}
                onChange={(e) => setRenavam(e.target.value)}
                placeholder="Opcional"
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
              />
            </div>
          </div>

          {snapshot.drivers.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                Condutor principal
              </label>
              <select
                value={assignedDriverId}
                onChange={(e) => setAssignedDriverId(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
              >
                <option value="">Sem condutor fixo</option>
                {snapshot.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (CNH {d.cnhCategory})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#52616a]">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tipo de óleo recomendado, calibragem ideal dos pneus, apólice..."
              className="w-full rounded-lg border border-[#cbd3d8] p-2.5 text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#edf1f3] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold text-[#52616a] hover:bg-[#f7f8fa]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              {editingVehicle ? "Salvar alterações" : "Cadastrar veículo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
