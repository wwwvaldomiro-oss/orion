import React, { useMemo, useState } from "react";
import { CarFront, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useGarage } from "../context/garageContext";
import type { PersonalDriver, PersonalVehicle } from "../types/garage.types";
import {
  computeVehicleTcoSummary,
  evaluateCnhStatus,
  evaluateDriverCtbPoints,
  formatKm,
  formatNumberBR,
  formatReaisBRL,
  fuelTypeLabel,
  getFuelUnit,
  vehicleStatusLabel,
} from "../utils/garage.calculations";

interface VehiclesDriversPageProps {
  onNewVehicle: () => void;
  onEditVehicle: (v: PersonalVehicle) => void;
  onNewDriver: () => void;
  onEditDriver: (d: PersonalDriver) => void;
}

export const VehiclesDriversPage: React.FC<VehiclesDriversPageProps> = ({
  onNewVehicle,
  onEditVehicle,
  onNewDriver,
  onEditDriver,
}) => {
  const { snapshot, selectedVehicleFilter, deleteVehicle, deleteDriver } = useGarage();
  const [subTab, setSubTab] = useState<"veiculos" | "condutores">("veiculos");
  const [confirmDeleteVehId, setConfirmDeleteVehId] = useState<string | null>(null);
  const [confirmDeleteDrvId, setConfirmDeleteDrvId] = useState<string | null>(null);

  const tcoRows = useMemo(
    () => computeVehicleTcoSummary(snapshot, selectedVehicleFilter),
    [snapshot, selectedVehicleFilter],
  );
  const tcoMap = useMemo(() => new Map(tcoRows.map((r) => [r.vehicleId, r])), [tcoRows]);

  const filteredVehicles = useMemo(
    () =>
      snapshot.vehicles.filter(
        (v) => selectedVehicleFilter === "TODOS" || v.id === selectedVehicleFilter,
      ),
    [snapshot.vehicles, selectedVehicleFilter],
  );

  const handleDeleteVehicle = async (id: string) => {
    await deleteVehicle(id);
    setConfirmDeleteVehId(null);
    toast.success("Veículo e registros vinculados removidos.");
  };

  const handleDeleteDriver = async (id: string) => {
    await deleteDriver(id);
    setConfirmDeleteDrvId(null);
    toast.success("Condutor removido.");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[#dce2e6] bg-white p-1">
          <button
            type="button"
            onClick={() => setSubTab("veiculos")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              subTab === "veiculos"
                ? "bg-[#173d4a] text-white"
                : "text-[#52616a] hover:text-[#0c1928]"
            }`}
          >
            <CarFront className="size-3.5" /> Meus Veículos ({snapshot.vehicles.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("condutores")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
              subTab === "condutores"
                ? "bg-[#173d4a] text-white"
                : "text-[#52616a] hover:text-[#0c1928]"
            }`}
          >
            <UserCheck className="size-3.5" /> Condutores & CNHs ({snapshot.drivers.length})
          </button>
        </div>

        <button
          type="button"
          onClick={subTab === "veiculos" ? onNewVehicle : onNewDriver}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#173d4a] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0c1928]"
        >
          <Plus className="size-3.5" />
          {subTab === "veiculos" ? "Cadastrar Veículo" : "Cadastrar Condutor"}
        </button>
      </div>

      {subTab === "veiculos" ? (
        filteredVehicles.length === 0 ? (
          <div className="rounded-2xl border border-[#dce2e6] bg-white p-8 text-center text-sm text-[#52616a]">
            Nenhum veículo cadastrado ainda.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredVehicles.map((v) => {
              const tco = tcoMap.get(v.id);
              const driver = snapshot.drivers.find((d) => d.id === v.assignedDriverId);
              return (
                <div
                  key={v.id}
                  className="flex flex-col justify-between rounded-2xl border border-[#dce2e6] bg-white p-5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-[#0c1928] px-2.5 py-0.5 text-xs font-bold tracking-wider text-white">
                            {v.plate}
                          </span>
                          <span className="rounded-md bg-[#edf1f3] px-2 py-0.5 text-[11px] font-semibold text-[#173d4a]">
                            {vehicleStatusLabel(v.status)}
                          </span>
                          {v.stateUf && (
                            <span className="text-[11px] font-semibold text-[#52616a]">
                              {v.stateUf}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 text-base font-bold text-[#0c1928]">
                          {v.brand} {v.model} ({v.year})
                        </h3>
                        <p className="text-xs text-[#52616a]">
                          {fuelTypeLabel(v.fuelType)} · Hodômetro:{" "}
                          <span className="tabular-nums font-semibold text-[#0c1928]">
                            {formatKm(v.currentOdometer)}
                          </span>
                          {driver ? ` · Condutor: ${driver.name}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditVehicle(v)}
                          aria-label={`Editar ${v.plate}`}
                          className="rounded-lg p-1.5 text-[#52616a] hover:bg-[#f0f3f5] hover:text-[#0c1928]"
                        >
                          <Pencil className="size-4" />
                        </button>
                        {confirmDeleteVehId === v.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDeleteVehicle(v.id)}
                              className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-semibold text-white"
                            >
                              Excluir
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteVehId(null)}
                              className="rounded-lg border border-[#dce2e6] px-2 py-1 text-[11px]"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteVehId(v.id)}
                            aria-label={`Remover ${v.plate}`}
                            className="rounded-lg p-1.5 text-[#52616a] hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f7f8fa] p-3 text-xs">
                      <div>
                        <span className="block text-[11px] text-[#52616a]">Média Consumo</span>
                        <span className="tabular-nums font-bold text-[#0c1928]">
                          {tco?.avgConsumption
                            ? `${formatNumberBR(tco.avgConsumption, 2)} km/${getFuelUnit(v.fuelType)}`
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#52616a]">Custo Total</span>
                        <span className="tabular-nums font-bold text-[#0c1928]">
                          {formatReaisBRL(tco?.totalOperationalCost ?? 0)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#52616a]">Valor FIPE</span>
                        <span className="tabular-nums font-bold text-[#0c1928]">
                          {v.fipeValue ? formatReaisBRL(v.fipeValue) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  {v.notes && <p className="mt-3 text-xs text-[#52616a]">{v.notes}</p>}
                </div>
              );
            })}
          </div>
        )
      ) : snapshot.drivers.length === 0 ? (
        <div className="rounded-2xl border border-[#dce2e6] bg-white p-8 text-center text-sm text-[#52616a]">
          Nenhum condutor cadastrado. Cadastre sua CNH (ou de familiares) para monitorar validade
          e pontuação CTB.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {snapshot.drivers.map((d) => {
            const cnh = evaluateCnhStatus(d);
            const ctb = evaluateDriverCtbPoints(d, snapshot.fines);
            return (
              <div
                key={d.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-[#dce2e6] bg-white p-5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#0c1928]">{d.name}</h3>
                    <span className="rounded-md bg-[#edf1f3] px-2 py-0.5 text-[11px] font-semibold text-[#173d4a]">
                      Cat. {d.cnhCategory}
                    </span>
                    {!d.active && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="tabular-nums text-xs text-[#52616a]">CNH {d.cnhNumber}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                        cnh.status === "VENCIDO"
                          ? "bg-red-50 text-red-700"
                          : cnh.status === "ATENCAO"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {cnh.label}
                    </span>
                    <span
                      className={`tabular-nums rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                        ctb.riskLevel === "SUSPENSAO"
                          ? "bg-red-50 text-red-700"
                          : ctb.riskLevel === "ATENCAO"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-[#f7f8fa] text-[#0c1928]"
                      }`}
                    >
                      {ctb.points12m}/{ctb.maxAllowedPoints} pts CTB (12m)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditDriver(d)}
                    className="rounded-lg p-1.5 text-[#52616a] hover:bg-[#f0f3f5]"
                    aria-label={`Editar ${d.name}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                  {confirmDeleteDrvId === d.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDeleteDriver(d.id)}
                        className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        Excluir
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteDrvId(null)}
                        className="rounded-lg border border-[#dce2e6] px-2 py-1 text-[11px]"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteDrvId(d.id)}
                      className="rounded-lg p-1.5 text-[#52616a] hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remover ${d.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
