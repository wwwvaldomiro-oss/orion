import React, { useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  MapPin,
  Plane,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL as formatCentsBRL, formatDateBR as formatOrionDateBR, parseBRL, todayBR } from "@/lib/domain/money";
import { useOrion } from "@/store/orionContext";
import type { TripPlan } from "@/types/orion";
import { useGarage } from "../context/garageContext";
import {
  computeRouteAudit,
  evaluateReminderStatus,
  formatDateBR,
  formatKm,
  formatNumberBR,
} from "../utils/garage.calculations";

interface RoutesRemindersPageProps {
  onNewReminder: () => void;
}

export const RoutesRemindersPage: React.FC<RoutesRemindersPageProps> = ({ onNewReminder }) => {
  const { state, addTrip, updateTripStatus } = useOrion();
  const {
    snapshot,
    selectedVehicleFilter,
    openQuickEntry,
    toggleReminder,
    deleteReminder,
    deleteRoute,
  } = useGarage();

  const today = todayBR();
  const [dest, setDest] = useState("");
  const [tripStart, setTripStart] = useState(today);
  const [tripEnd, setTripEnd] = useState(today);
  const [tripBudget, setTripBudget] = useState("");
  const [tripNotes, setTripNotes] = useState("");

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles],
  );

  const filteredReminders = useMemo(() => {
    return snapshot.reminders.filter(
      (r) => selectedVehicleFilter === "TODOS" || r.vehicleId === selectedVehicleFilter,
    );
  }, [snapshot.reminders, selectedVehicleFilter]);

  const filteredRoutes = useMemo(() => {
    return snapshot.routes
      .filter((r) => selectedVehicleFilter === "TODOS" || r.vehicleId === selectedVehicleFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [snapshot.routes, selectedVehicleFilter]);

  const handleSubmitTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dest.trim()) {
      toast.error("Informe o destino da viagem.");
      return;
    }
    const budget = parseBRL(tripBudget) ?? 0;
    await addTrip({
      destination: dest.trim(),
      startDate: tripStart,
      endDate: tripEnd,
      budgetCents: budget,
      spentCents: 0,
      notes: tripNotes.trim(),
      status: "Planejada",
    });
    setDest("");
    setTripBudget("");
    setTripNotes("");
    toast.success("Viagem adicionada ao roteiro.");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reminders */}
        <section className="space-y-4 rounded-2xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-[#173d4a]" />
              <div>
                <h2 className="text-base font-bold text-[#0c1928]">Lembretes Preventivos</h2>
                <p className="text-xs text-[#52616a]">Alertas por data ou quilometragem limite</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onNewReminder}
              className="inline-flex items-center gap-1 rounded-xl bg-[#173d4a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              <Plus className="size-3.5" /> Novo Lembrete
            </button>
          </div>

          {filteredReminders.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#52616a]">
              Nenhum lembrete preventivo cadastrado.
            </p>
          ) : (
            <div className="divide-y divide-[#edf1f3]">
              {filteredReminders.map((rem) => {
                const veh = vehicleMap.get(rem.vehicleId);
                const ev = evaluateReminderStatus(rem, veh);
                return (
                  <div
                    key={rem.id}
                    className="flex items-center justify-between gap-3 py-3 text-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => void toggleReminder(rem.id)}
                        aria-label="Alternar conclusão"
                        className={`mt-0.5 rounded-full p-0.5 ${
                          rem.completed
                            ? "text-emerald-600"
                            : "text-[#9eb2bd] hover:text-[#173d4a]"
                        }`}
                      >
                        <CheckCircle2 className="size-4" />
                      </button>
                      <div>
                        <div
                          className={`font-bold ${
                            rem.completed ? "text-[#52616a] line-through" : "text-[#0c1928]"
                          }`}
                        >
                          {rem.title} {veh ? `· ${veh.plate}` : ""}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              ev.status === "VENCIDO"
                                ? "bg-red-50 text-red-700"
                                : ev.status === "ATENCAO"
                                  ? "bg-amber-50 text-amber-700"
                                  : ev.status === "CONCLUIDO"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-[#f7f8fa] text-[#52616a]"
                            }`}
                          >
                            {ev.reason}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        void deleteReminder(rem.id);
                        toast.success("Lembrete removido.");
                      }}
                      aria-label="Excluir lembrete"
                      className="rounded-lg p-1.5 text-[#52616a] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Routes / Odometer Log */}
        <section className="space-y-4 rounded-2xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-[#b99555]" />
              <div>
                <h2 className="text-base font-bold text-[#0c1928]">Diário de Percursos (Km)</h2>
                <p className="text-xs text-[#52616a]">
                  Trajetos realizados com atualização automática de hodômetro
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openQuickEntry("percurso")}
              className="inline-flex items-center gap-1 rounded-xl border border-[#dce2e6] bg-white px-3 py-1.5 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa]"
            >
              <Plus className="size-3.5" /> Registrar Percurso
            </button>
          </div>

          {filteredRoutes.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#52616a]">
              Nenhum percurso registrado ainda.
            </p>
          ) : (
            <div className="divide-y divide-[#edf1f3]">
              {filteredRoutes.map((route) => {
                const veh = vehicleMap.get(route.vehicleId);
                const audit = computeRouteAudit(route);
                return (
                  <div
                    key={route.id}
                    className="flex items-center justify-between gap-3 py-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#0c1928]">
                        {route.origin} → {route.destination}
                      </div>
                      <div className="mt-0.5 text-[#52616a]">
                        {formatDateBR(route.date)} · {veh?.plate ?? ""} ·{" "}
                        <span className="tabular-nums font-semibold text-[#0c1928]">
                          {formatNumberBR(route.distanceKm, 0)} km
                        </span>{" "}
                        ({formatKm(route.startOdometer)} → {formatKm(route.endOdometer)})
                        {audit?.flagged && (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            {audit.deltaPercent > 0 ? "+" : ""}
                            {audit.deltaPercent}% vs GPS
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteRoute(route.id);
                        toast.success("Percurso removido.");
                      }}
                      aria-label="Excluir percurso"
                      className="rounded-lg p-1.5 text-[#52616a] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Personal Trip Planner (preserved from Orion VeiculosPage) */}
      <section className="space-y-4 rounded-2xl border border-[#dce2e6] bg-white p-5">
        <div className="flex items-center gap-2">
          <Plane className="size-4 text-[#173d4a]" />
          <div>
            <h2 className="text-base font-bold text-[#0c1928]">Planejamento de Viagens & Roteiros</h2>
            <p className="text-xs text-[#52616a]">
              Organize destinos futuros, datas e orçamento estimado das suas viagens
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleSubmitTrip(e)}
          className="grid gap-2.5 rounded-xl border border-[#edf1f3] bg-[#f7f8fa] p-3.5 sm:grid-cols-6"
        >
          <input
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="Destino (ex.: Gramado - RS)"
            className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs sm:col-span-2"
            required
          />
          <input
            type="date"
            value={tripStart}
            onChange={(e) => setTripStart(e.target.value)}
            className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs"
          />
          <input
            type="date"
            value={tripEnd}
            onChange={(e) => setTripEnd(e.target.value)}
            className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs"
          />
          <input
            value={tripBudget}
            onChange={(e) => setTripBudget(e.target.value)}
            placeholder="Orçamento (R$)"
            className="tabular-nums h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928]"
          >
            <Plus className="size-3.5" /> Planejar
          </button>
          <input
            value={tripNotes}
            onChange={(e) => setTripNotes(e.target.value)}
            placeholder="Roteiro, hospedagem ou observações (opcional)"
            className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs sm:col-span-6"
          />
        </form>

        {state.trips.length === 0 ? (
          <p className="py-4 text-center text-sm text-[#52616a]">
            Nenhuma viagem planejada ainda.
          </p>
        ) : (
          <div className="divide-y divide-[#edf1f3]">
            {state.trips.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#0c1928]">{t.destination}</div>
                  <div className="tabular-nums text-xs text-[#52616a]">
                    {formatOrionDateBR(t.startDate)} – {formatOrionDateBR(t.endDate)} · Orçamento:{" "}
                    {formatCentsBRL(t.budgetCents)}
                  </div>
                  {t.notes && <p className="mt-1 text-xs text-[#52616a]">{t.notes}</p>}
                </div>
                <select
                  value={t.status}
                  onChange={(e) =>
                    void updateTripStatus(t.id, e.target.value as TripPlan["status"])
                  }
                  className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs font-semibold"
                >
                  <option value="Planejada">Planejada</option>
                  <option value="Em curso">Em curso</option>
                  <option value="Concluída">Concluída</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
