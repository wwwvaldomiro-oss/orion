import React, { useMemo, useState } from "react";
import { Download, Fuel, Plus, ReceiptText, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useGarage } from "../context/garageContext";
import {
  buildUnifiedTimeline,
  exportRowsToCsv,
  formatDateBR,
  formatKm,
  formatReaisBRL,
} from "../utils/garage.calculations";

type KindFilter = "TODOS" | "ABASTECIMENTO" | "MANUTENCAO" | "DESPESA" | "MULTA" | "PERCURSO";

export const LedgerPage: React.FC = () => {
  const {
    snapshot,
    selectedVehicleFilter,
    openQuickEntry,
    deleteFueling,
    updateMaintenanceStatus,
    deleteMaintenance,
    deleteExpense,
  } = useGarage();

  const [kindFilter, setKindFilter] = useState<KindFilter>("TODOS");
  const [searchText, setSearchText] = useState("");

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles],
  );

  const timeline = useMemo(
    () => buildUnifiedTimeline(snapshot, selectedVehicleFilter),
    [snapshot, selectedVehicleFilter],
  );

  const filteredEntries = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return timeline.filter((item) => {
      if (kindFilter !== "TODOS" && item.kind !== kindFilter) return false;
      if (!q) return true;
      const veh = vehicleMap.get(item.vehicleId);
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        (veh?.plate.toLowerCase().includes(q) ?? false) ||
        (veh?.model.toLowerCase().includes(q) ?? false)
      );
    });
  }, [timeline, kindFilter, searchText, vehicleMap]);

  const handleExportCsv = () => {
    const headers = ["Data", "Tipo", "Placa", "Veículo", "Título", "Detalhes", "Hodômetro", "Valor R$"];
    const rows = filteredEntries.map((item) => {
      const veh = vehicleMap.get(item.vehicleId);
      return [
        formatDateBR(item.date),
        item.kind,
        veh?.plate ?? "-",
        veh ? `${veh.brand} ${veh.model}` : "-",
        item.title,
        item.subtitle,
        item.odometer ?? "",
        item.amount !== undefined ? item.amount.toFixed(2).replace(".", ",") : "",
      ];
    });
    exportRowsToCsv("lancamentos-garagem.csv", headers, rows);
    toast.success("Extrato CSV exportado.");
  };

  const openMaintenances = useMemo(
    () =>
      snapshot.maintenances.filter(
        (m) =>
          (selectedVehicleFilter === "TODOS" || m.vehicleId === selectedVehicleFilter) &&
          m.status !== "CONCLUIDA",
      ),
    [snapshot.maintenances, selectedVehicleFilter],
  );

  const handleDeleteEntry = async (rawId: string) => {
    if (rawId.startsWith("fuel-")) {
      await deleteFueling(rawId.replace("fuel-", ""));
      toast.success("Abastecimento removido.");
    } else if (rawId.startsWith("maint-")) {
      await deleteMaintenance(rawId.replace("maint-", ""));
      toast.success("Manutenção removida.");
    } else if (rawId.startsWith("exp-")) {
      await deleteExpense(rawId.replace("exp-", ""));
      toast.success("Gasto removido.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openQuickEntry("abastecimento")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#173d4a] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0c1928]"
          >
            <Fuel className="size-3.5" /> Abastecimento
          </button>
          <button
            type="button"
            onClick={() => openQuickEntry("manutencao")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce2e6] bg-white px-3.5 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa]"
          >
            <Wrench className="size-3.5 text-[#173d4a]" /> Revisão / Manutenção
          </button>
          <button
            type="button"
            onClick={() => openQuickEntry("gasto")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce2e6] bg-white px-3.5 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa]"
          >
            <ReceiptText className="size-3.5 text-[#b99555]" /> Pedágio / Estac. / Outros
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filteredEntries.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce2e6] bg-white px-3.5 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa] disabled:opacity-50"
        >
          <Download className="size-3.5" /> Exportar CSV
        </button>
      </div>

      {/* Pending maintenances from checklists or repairs */}
      {openMaintenances.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-900">
            Manutenções em Aberto ({openMaintenances.length})
          </h3>
          <div className="space-y-2">
            {openMaintenances.map((m) => {
              const veh = vehicleMap.get(m.vehicleId);
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-bold text-[#0c1928]">
                      {veh?.plate} · {m.category}
                    </span>
                    <span className="ml-2 text-[#52616a]">
                      {formatDateBR(m.date)} · {m.notes ?? m.providerName ?? "Aguardando execução"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={m.status}
                      onChange={(e) =>
                        void updateMaintenanceStatus(m.id, e.target.value as typeof m.status)
                      }
                      className="h-7 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs font-semibold"
                    >
                      <option value="ABERTA">Aberta</option>
                      <option value="EM_EXECUCAO">Em execução</option>
                      <option value="CONCLUIDA">Concluída</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="rounded-2xl border border-[#dce2e6] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["TODOS", "Todos"],
                ["ABASTECIMENTO", "Abastecimentos"],
                ["MANUTENCAO", "Manutenções"],
                ["DESPESA", "Gastos Gerais"],
                ["MULTA", "Multas"],
                ["PERCURSO", "Percursos"],
              ] as Array<[KindFilter, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setKindFilter(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  kindFilter === id
                    ? "bg-[#173d4a] text-white"
                    : "bg-[#f7f8fa] text-[#52616a] hover:text-[#0c1928]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-[#52616a]" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar posto, serviço, placa..."
              className="h-9 w-full rounded-lg border border-[#cbd3d8] pl-8 pr-3 text-xs"
            />
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#52616a]">
            Nenhum lançamento encontrado. Clique em um dos botões acima ou em{" "}
            <button
              type="button"
              onClick={() => openQuickEntry("abastecimento")}
              className="inline-flex items-center gap-0.5 font-semibold text-[#173d4a] underline"
            >
              <Plus className="size-3" /> Novo Registro
            </button>{" "}
            para começar.
          </div>
        ) : (
          <div className="divide-y divide-[#edf1f3]">
            {filteredEntries.map((item) => {
              const veh = vehicleMap.get(item.vehicleId);
              const canDelete =
                item.id.startsWith("fuel-") ||
                item.id.startsWith("maint-") ||
                item.id.startsWith("exp-");
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums font-semibold text-[#52616a]">
                        {formatDateBR(item.date)}
                      </span>
                      <span className="rounded bg-[#edf1f3] px-2 py-0.5 text-[10px] font-bold text-[#173d4a]">
                        {veh?.plate ?? "Veículo"}
                      </span>
                      <span className="font-bold text-[#0c1928]">{item.title}</span>
                    </div>
                    <div className="mt-0.5 text-[#52616a]">
                      {item.subtitle}
                      {item.odometer ? ` · ${formatKm(item.odometer)}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {item.amount !== undefined && (
                      <span className="tabular-nums text-sm font-bold text-[#0c1928]">
                        {formatReaisBRL(item.amount)}
                      </span>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteEntry(item.id)}
                        aria-label="Excluir lançamento"
                        className="rounded-lg p-1.5 text-[#52616a] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
