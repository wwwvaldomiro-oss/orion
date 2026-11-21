import { useMemo, useState } from "react";
import {
  Award,
  CalendarRange,
  Car,
  MapPin,
  Plane,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { formatBRL, formatDateBR, parseBRL, todayBR } from "@/lib/domain/money";
import { PontoPlusWorkspace } from "@/modules/pontoPlus/components/PontoPlusWorkspace";
import { RoadTripPlatform } from "@/modules/viagens/RoadTripPlatform";
import { ViagensModule } from "@/modules/viagens/ViagensModule";
import type { CalculatedRouteResult } from "@/modules/viagens/services/tollEngine";
import type { Ticket } from "@/modules/viagens/types";
import { useOrion } from "@/store/orionContext";
import type { TripPlan } from "@/types/orion";

type ViagensProjectTab = "viagens" | "ponto_plus";
type ViagensSubTab = "road" | "tickets" | "trips";

const STATUS_BADGE: Record<TripPlan["status"], string> = {
  Planejada: "bg-[#edf1f3] text-[#173d4a]",
  "Em curso": "bg-amber-100 text-amber-900",
  Concluída: "bg-emerald-100 text-emerald-900",
};

export function ViagensPage() {
  const { state, addTrip, updateTripStatus } = useOrion();
  const [activeProject, setActiveProject] = useState<ViagensProjectTab>("viagens");
  const [viagensSubTab, setViagensSubTab] = useState<ViagensSubTab>("road");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TripPlan["status"]>("ALL");

  const today = todayBR();
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const summary = useMemo(() => {
    let plannedBudgetCents = 0;
    let totalSpentCents = 0;
    let activeCount = 0;
    for (const t of state.trips) {
      plannedBudgetCents += t.budgetCents;
      totalSpentCents += t.spentCents;
      if (t.status === "Planejada" || t.status === "Em curso") activeCount++;
    }
    return {
      total: state.trips.length,
      activeCount,
      plannedBudgetCents,
      totalSpentCents,
    };
  }, [state.trips]);

  const filteredTrips = useMemo(() => {
    return [...state.trips]
      .filter((t) => statusFilter === "ALL" || t.status === statusFilter)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [state.trips, statusFilter]);

  async function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault();
    if (!destination.trim()) {
      toast.error("Informe o destino da viagem.");
      return;
    }
    if (endDate < startDate) {
      toast.error("A data de retorno não pode ser anterior à data de ida.");
      return;
    }
    setSubmitting(true);
    try {
      const budgetCents = parseBRL(budget) ?? 0;
      await addTrip({
        destination: destination.trim(),
        startDate,
        endDate,
        budgetCents,
        spentCents: 0,
        notes: notes.trim(),
        status: "Planejada",
      });
      setDestination("");
      setBudget("");
      setNotes("");
      toast.success("Viagem registrada no Firestore.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar viagem.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveRoadTrip(route: CalculatedRouteResult) {
    const budgetCents = Math.max(0, Math.round(route.totalTripCostBRL * 100));
    const currentDate = todayBR();
    await addTrip({
      destination: `${route.origin.name} → ${route.destination.name}`,
      startDate: currentDate,
      endDate: currentDate,
      budgetCents,
      spentCents: 0,
      notes: `Rodovia: ${route.distanceKm} km (${route.formattedDuration}) · Pedágios (${route.tollPlazasCount}): ${formatBRL(Math.round(route.tollTotalBRL * 100))} · Combustível (${route.fuelLitersNeeded}L): ${formatBRL(Math.round(route.fuelTotalBRL * 100))}`,
      status: "Planejada",
    });
    toast.success("Roteiro rodoviário salvo em Minhas Viagens.");
  }

  async function handleBookTicket(ticket: Ticket, details?: { totalPaid?: number }) {
    const depDay = ticket.departure.dateTime.slice(0, 10) || todayBR();
    const budgetCents = Math.max(0, Math.round((details?.totalPaid ?? ticket.price) * 100));
    try {
      await addTrip({
        destination: `${ticket.departure.location.city} → ${ticket.arrival.location.city}`,
        startDate: depDay,
        endDate: depDay,
        budgetCents,
        spentCents: 0,
        notes: `${ticket.type === "flight" ? "Voo" : "Ônibus"} ${ticket.company.name} (${ticket.flightOrBusNumber}) · Classe ${ticket.seatClass} · Ref. milhas: ${ticket.milesOption.points.toLocaleString("pt-BR")} pts (${ticket.milesOption.programName})`,
        status: "Planejada",
      });
      toast.success("Roteiro adicionado em Minhas Viagens.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar roteiro.");
    }
  }

  return (
    <AppShell
      title="Viagens"
      subtitle="Planejamento rodoviário, passagens aéreas/ônibus e carteira Ponto Plus"
    >
      <div className="space-y-6">
        {/* Seletor principal dos 2 projetos do módulo Viagens */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce2e6] bg-white p-2">
          <div
            role="tablist"
            aria-label="Projetos do módulo Viagens"
            className="flex flex-wrap gap-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeProject === "viagens"}
              onClick={() => setActiveProject("viagens")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeProject === "viagens"
                  ? "bg-[#173d4a] text-white"
                  : "text-[#52616a] hover:bg-[#f7f8fa] hover:text-[#0c1928]"
              }`}
            >
              <Plane className="size-3.5" />
              Viagens
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeProject === "ponto_plus"}
              onClick={() => setActiveProject("ponto_plus")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeProject === "ponto_plus"
                  ? "bg-[#173d4a] text-white"
                  : "text-[#52616a] hover:bg-[#f7f8fa] hover:text-[#0c1928]"
              }`}
            >
              <Award className="size-3.5" />
              Ponto Plus
            </button>
          </div>

          {activeProject === "viagens" && (
            <div
              role="tablist"
              aria-label="Ferramentas do projeto Viagens"
              className="flex flex-wrap gap-1 rounded-xl bg-[#f0f3f5] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viagensSubTab === "road"}
                onClick={() => setViagensSubTab("road")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  viagensSubTab === "road"
                    ? "bg-white text-[#0c1928] shadow-xs"
                    : "text-[#52616a] hover:text-[#0c1928]"
                }`}
              >
                <Car className="size-3.5" />
                Rodovias &amp; Pedágios
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={viagensSubTab === "tickets"}
                onClick={() => setViagensSubTab("tickets")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  viagensSubTab === "tickets"
                    ? "bg-white text-[#0c1928] shadow-xs"
                    : "text-[#52616a] hover:text-[#0c1928]"
                }`}
              >
                <Plane className="size-3.5" />
                Voos &amp; Ônibus
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={viagensSubTab === "trips"}
                onClick={() => setViagensSubTab("trips")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  viagensSubTab === "trips"
                    ? "bg-white text-[#0c1928] shadow-xs"
                    : "text-[#52616a] hover:text-[#0c1928]"
                }`}
              >
                <CalendarRange className="size-3.5" />
                <span>Minhas Viagens</span>
                <span className="tabular-nums rounded bg-[#edf1f3] px-1.5 py-0.5 text-[10px] font-bold text-[#173d4a]">
                  {state.trips.length}
                </span>
              </button>
            </div>
          )}
        </div>

        {activeProject === "ponto_plus" ? (
          <PontoPlusWorkspace />
        ) : viagensSubTab === "road" ? (
          <RoadTripPlatform
            onOpenTicketsPlatform={() => setViagensSubTab("tickets")}
            onSaveRouteToOrion={handleSaveRoadTrip}
            orionVehicles={state.vehicles}
          />
        ) : viagensSubTab === "tickets" ? (
          <ViagensModule
            onOpenCarPlatform={() => setViagensSubTab("road")}
            onBookTicket={(ticket, details) => void handleBookTicket(ticket, details)}
            hostAppInfo={{ appName: "Órion" }}
          />
        ) : (
          <div className="space-y-6">
            {/* Indicadores reais do Firestore */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
                <div className="text-xs font-medium text-[#52616a]">Total de Viagens</div>
                <div className="tabular-nums mt-1 text-2xl font-bold text-[#0c1928]">
                  {summary.total}
                </div>
              </div>
              <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
                <div className="text-xs font-medium text-[#52616a]">Planejadas / Em curso</div>
                <div className="tabular-nums mt-1 text-2xl font-bold text-[#173d4a]">
                  {summary.activeCount}
                </div>
              </div>
              <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
                <div className="text-xs font-medium text-[#52616a]">Orçamento Planejado</div>
                <div className="tabular-nums mt-1 text-2xl font-bold text-[#0c1928]">
                  {formatBRL(summary.plannedBudgetCents)}
                </div>
              </div>
              <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
                <div className="text-xs font-medium text-[#52616a]">Gasto Registrado</div>
                <div className="tabular-nums mt-1 text-2xl font-bold text-[#173d4a]">
                  {formatBRL(summary.totalSpentCents)}
                </div>
              </div>
            </section>

            {/* Formulário de planejamento */}
            <section className="rounded-2xl border border-[#dce2e6] bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <MapPin className="size-4 text-[#173d4a]" />
                <h2 className="text-base font-bold text-[#0c1928]">Nova Viagem / Roteiro</h2>
              </div>

              <form
                onSubmit={(e) => void handleCreateTrip(e)}
                className="grid gap-3 sm:grid-cols-6"
              >
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-[#52616a]">
                    Destino *
                  </label>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Ex.: Brasília → Caldas Novas"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#52616a]">
                    Ida
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#52616a]">
                    Retorno
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#52616a]">
                    Orçamento (R$)
                  </label>
                  <input
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="0,00"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    {submitting ? "Salvando..." : "Adicionar"}
                  </button>
                </div>

                <div className="sm:col-span-6">
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Hospedagem, paradas, pontos de interesse ou observações (opcional)"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs"
                  />
                </div>
              </form>
            </section>

            {/* Lista de viagens */}
            <section className="rounded-2xl border border-[#dce2e6] bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarRange className="size-4 text-[#173d4a]" />
                  <h2 className="text-base font-bold text-[#0c1928]">Viagens Cadastradas</h2>
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg bg-[#f0f3f5] p-0.5 text-xs">
                  {(["ALL", "Planejada", "Em curso", "Concluída"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-md px-2.5 py-1 font-semibold ${
                        statusFilter === status
                          ? "bg-white text-[#0c1928] shadow-xs"
                          : "text-[#52616a]"
                      }`}
                    >
                      {status === "ALL" ? "Todas" : status}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTrips.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#52616a]">
                  Nenhuma viagem encontrada para este filtro. Você também pode salvar roteiros diretamente em &quot;Rodovias &amp; Pedágios&quot; ou &quot;Voos &amp; Ônibus&quot;.
                </p>
              ) : (
                <div className="divide-y divide-[#edf1f3]">
                  {filteredTrips.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-sm"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[#0c1928]">{t.destination}</span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[t.status]}`}
                          >
                            {t.status}
                          </span>
                        </div>
                        <div className="tabular-nums text-xs text-[#52616a]">
                          {formatDateBR(t.startDate)} – {formatDateBR(t.endDate)} · Orçamento:{" "}
                          {formatBRL(t.budgetCents)} · Gasto: {formatBRL(t.spentCents)}
                        </div>
                        {t.notes && <p className="text-xs text-[#52616a]">{t.notes}</p>}
                      </div>

                      <select
                        aria-label={`Status da viagem ${t.destination}`}
                        value={t.status}
                        onChange={(e) =>
                          void updateTripStatus(t.id, e.target.value as TripPlan["status"])
                        }
                        className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-semibold text-[#0c1928]"
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
        )}
      </div>
    </AppShell>
  );
}
