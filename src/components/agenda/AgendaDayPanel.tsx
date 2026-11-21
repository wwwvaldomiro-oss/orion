import { CalendarClock, CheckCircle2, Plus, Star, Trash2 } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/domain/money";
import type { UnifiedAgendaCategory, UnifiedAgendaEvent } from "@/lib/domain/agenda";
import { useOrion } from "@/store/orionContext";

const CATEGORY_BORDER_HEX: Record<UnifiedAgendaCategory, string> = {
  holiday: "#dc2626",
  birthday: "#b99555",
  work: "#2563eb",
  personal: "#173d4a",
  finance_expense: "#d97706",
  finance_revenue: "#16a34a",
  vehicle: "#475569",
  trip: "#7c3aed",
  reminder: "#0d9488",
};

function statusLabel(ev: UnifiedAgendaEvent): string {
  if (ev.override?.action === "completed" && ev.readOnly) return "Visto na Agenda";
  if (ev.status === "completed") return ev.readOnly ? "Confirmado na origem" : "Concluído";
  if (ev.status === "overdue") return "Em atraso";
  if (ev.status === "info") return "Informativo";
  return "Pendente";
}

function TooltipIconButton({
  tooltip,
  onClick,
  tone = "neutral",
  children,
}: {
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  tone?: "neutral" | "success" | "danger";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "hover:border-[#16a34a]/50 hover:bg-[#f0fdf4] hover:text-[#15803d] dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
      : tone === "danger"
        ? "hover:border-[#dc2626]/50 hover:bg-[#fef2f2] hover:text-[#dc2626] dark:hover:bg-red-950/40 dark:hover:text-red-300"
        : "hover:border-[#173d4a]/40 hover:bg-[#edf1f3] hover:text-[#0c1928] dark:hover:bg-[#152b3f] dark:hover:text-white";

  return (
    <div className="group/tip relative inline-flex">
      <button
        type="button"
        title={tooltip}
        aria-label={tooltip}
        onClick={onClick}
        className={`grid size-8 place-items-center rounded-lg border border-[#dce2e6] bg-white text-[#52616a] transition-colors dark:border-[#233c53] dark:bg-[#132537] dark:text-slate-300 ${toneClass}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 -top-8 z-20 hidden whitespace-nowrap rounded bg-[#0c1928] px-2 py-1 text-[10px] font-medium text-white shadow group-hover/tip:block group-focus-within/tip:block"
      >
        {tooltip}
      </span>
    </div>
  );
}

export function AgendaDayPanel({
  selectedDay,
  today,
  events,
  onAddForDay,
  onOpenDetails,
  onCompleteEvent,
  onPostponeEvent,
  onDeleteEvent,
}: {
  selectedDay: string;
  today: string;
  events: UnifiedAgendaEvent[];
  onAddForDay: (day: string) => void;
  onOpenDetails: (event: UnifiedAgendaEvent) => void;
  onCompleteEvent: (event: UnifiedAgendaEvent) => void;
  onPostponeEvent: (event: UnifiedAgendaEvent) => void;
  onDeleteEvent: (event: UnifiedAgendaEvent) => void;
}) {
  const { state, toggleAgendaCheck } = useOrion();

  const weekdayLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${selectedDay}T12:00:00Z`));

  return (
    <aside
      aria-label="Compromissos do dia selecionado"
      className="flex flex-col rounded-xl border border-[#dce2e6] bg-white p-4 sm:p-5 dark:border-[#233c53] dark:bg-[#0e1e2e]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#edf1f3] pb-3.5 dark:border-[#233c53]">
        <div>
          <h2 className="tabular-nums text-lg font-semibold text-[#0c1928] dark:text-white">
            {formatDateBR(selectedDay)}
          </h2>
          <p className="text-xs capitalize text-[#52616a] dark:text-slate-400">
            {weekdayLabel} ·{" "}
            {selectedDay === today ? "Hoje" : selectedDay > today ? "Próximo" : "Anterior"} ·{" "}
            <span className="tabular-nums">{events.length} registro(s)</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAddForDay(selectedDay)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#dce2e6] bg-[#f7f8fa] px-2.5 text-xs font-semibold text-[#0c1928] hover:border-[#173d4a] hover:bg-white dark:border-[#233c53] dark:bg-[#132537] dark:text-slate-100"
        >
          <Plus className="size-3.5" /> Adicionar
        </button>
      </div>

      <div className="mt-3 flex-1 space-y-2.5">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#dce2e6] py-10 text-center text-xs text-[#52616a] dark:border-[#233c53] dark:text-slate-400">
            Nenhum compromisso nesta data.
          </div>
        ) : (
          events.map((ev) => {
            const dotColor = ev.accentColor || CATEGORY_BORDER_HEX[ev.category];
            const isCompletedVisual =
              ev.status === "completed" || ev.override?.action === "completed";

            return (
              <div
                key={ev.occurrenceKey}
                className={`rounded-xl border border-[#dce2e6] bg-[#f7f8fa]/50 p-3 transition-colors hover:border-[#173d4a]/40 hover:bg-white dark:border-[#233c53] dark:bg-[#132537]/60 dark:hover:bg-[#132537] ${
                  isCompletedVisual ? "opacity-80" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Clickable event body -> Opens details modal */}
                  <button
                    type="button"
                    onClick={() => onOpenDetails(ev)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: dotColor }}
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#52616a] dark:text-slate-400">
                        {ev.kindLabel}
                      </span>
                      <span className="text-[11px] text-[#52616a] dark:text-slate-400">·</span>
                      <span className="truncate text-[11px] text-[#52616a] dark:text-slate-400">
                        {ev.originModule}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5">
                      {ev.personalRecord?.favorite && (
                        <Star className="size-3.5 shrink-0 fill-[#b99555] text-[#b99555]" />
                      )}
                      <span
                        className={`text-sm font-semibold text-[#0c1928] dark:text-white ${
                          isCompletedVisual ? "line-through" : ""
                        }`}
                      >
                        {ev.title}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-[#52616a] dark:text-slate-300">
                      {ev.startTime && (
                        <span className="tabular-nums font-medium">
                          {ev.endTime
                            ? `${ev.startTime}–${ev.endTime}${ev.spansNextDay ? " (+1d)" : ""}`
                            : ev.startTime}
                        </span>
                      )}
                      {ev.company && <span>{ev.company}</span>}
                      {typeof ev.amountCents === "number" && ev.amountCents > 0 && (
                        <span className="tabular-nums font-semibold text-[#0c1928] dark:text-amber-200">
                          {formatBRL(ev.amountCents)}
                        </span>
                      )}
                      <span
                        className={`font-medium ${
                          ev.status === "overdue"
                            ? "text-[#dc2626] dark:text-red-400"
                            : ev.status === "completed"
                              ? "text-[#16a34a] dark:text-emerald-400"
                              : ""
                        }`}
                      >
                        {statusLabel(ev)}
                      </span>
                    </div>

                    {ev.subtitle && (
                      <p className="mt-1 truncate text-xs text-[#52616a] dark:text-slate-400">
                        {ev.subtitle}
                      </p>
                    )}
                  </button>

                  {/* Accessible action icons with tooltips */}
                  <div className="flex shrink-0 items-center gap-1">
                    <TooltipIconButton
                      tooltip={
                        ev.readOnly
                          ? "Marcar como visto na Agenda (não quita origem)"
                          : isCompletedVisual
                            ? "Reabrir compromisso"
                            : "Concluir compromisso"
                      }
                      tone="success"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompleteEvent(ev);
                      }}
                    >
                      <CheckCircle2 className="size-4" />
                    </TooltipIconButton>
                    <TooltipIconButton
                      tooltip={ev.readOnly ? "Adiar lembrete na Agenda" : "Adiar evento"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPostponeEvent(ev);
                      }}
                    >
                      <CalendarClock className="size-4" />
                    </TooltipIconButton>
                    <TooltipIconButton
                      tooltip={ev.readOnly ? "Ocultar da Agenda (preserva origem)" : "Excluir"}
                      tone="danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEvent(ev);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </TooltipIconButton>
                  </div>
                </div>

                {/* Inline checklist items for personal agenda items */}
                {ev.personalRecord &&
                  !ev.isReminderProjection &&
                  ev.personalRecord.items.length > 0 && (
                    <div className="mt-2.5 space-y-1 border-t border-[#dce2e6]/70 pt-2 dark:border-[#233c53]">
                      {ev.personalRecord.items.map((item) => {
                        const key = `${ev.personalRecord!.id}:${ev.baseDate}:${item.key}`;
                        const done = Boolean(state.agendaChecks[key]);
                        return (
                          <label key={item.key} className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={done}
                              onChange={(e) =>
                                void toggleAgendaCheck(
                                  ev.personalRecord!.id,
                                  ev.baseDate,
                                  item.key,
                                  e.target.checked,
                                )
                              }
                              className="size-3.5 accent-[#16a34a]"
                            />
                            <span
                              className={
                                done
                                  ? "text-[#52616a] line-through dark:text-slate-400"
                                  : "text-[#0c1928] dark:text-slate-200"
                              }
                            >
                              {item.description}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
