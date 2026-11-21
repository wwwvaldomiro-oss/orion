import { useMemo } from "react";
import { buildMonthGrid, type UnifiedAgendaCategory, type UnifiedAgendaEvent } from "@/lib/domain/agenda";

const WEEK_HEADERS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CATEGORY_DOT_COLORS: Record<UnifiedAgendaCategory, string> = {
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

export function AgendaCalendarGrid({
  month,
  today,
  selectedDay,
  events,
  onSelectDay,
  onOpenEvent,
}: {
  month: string;
  today: string;
  selectedDay: string;
  events: UnifiedAgendaEvent[];
  onSelectDay: (date: string) => void;
  onOpenEvent: (event: UnifiedAgendaEvent) => void;
}) {
  const cells = useMemo(() => buildMonthGrid(month), [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, UnifiedAgendaEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.displayDate);
      if (list) list.push(ev);
      else map.set(ev.displayDate, [ev]);
    }
    return map;
  }, [events]);

  return (
    <section
      aria-label="Calendário mensal"
      className="rounded-xl border border-[#dce2e6] bg-white p-3 sm:p-5 dark:border-[#233c53] dark:bg-[#0e1e2e]"
    >
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEK_HEADERS.map((w, idx) => (
          <div
            key={w}
            className={`py-2 text-center text-[11px] font-semibold uppercase tracking-wider sm:text-xs ${
              idx === 0 || idx === 6
                ? "text-[#b99555]"
                : "text-[#52616a] dark:text-slate-400"
            }`}
          >
            {w}
          </div>
        ))}

        {cells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.date) ?? [];
          const hasHoliday = dayEvents.some((ev) => ev.category === "holiday");
          const isToday = cell.date === today;
          const isSelected = cell.date === selectedDay;
          const isWeekend = cell.weekday === 0 || cell.weekday === 6;
          const previewEvents = dayEvents.slice(0, 3);
          const extraCount = Math.max(0, dayEvents.length - previewEvents.length);
          const distinctCats = Array.from(new Set(dayEvents.map((e) => e.category)));

          return (
            <div
              key={cell.date}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${cell.date.split("-").reverse().join("/")}, ${dayEvents.length} compromisso(s)`}
              onClick={() => onSelectDay(cell.date)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDay(cell.date);
                }
              }}
              className={`group relative flex min-h-20 cursor-pointer flex-col justify-between rounded-lg border p-1.5 text-left transition-colors sm:min-h-28 sm:p-2 ${
                isSelected
                  ? "border-[#173d4a] bg-[#edf1f3] ring-1 ring-[#173d4a] dark:border-[#b99555] dark:bg-[#173348] dark:ring-[#b99555]"
                  : isToday
                    ? "border-[#b99555] bg-[#faf7f0] dark:border-[#b99555]/70 dark:bg-[#1b2b34]"
                    : !cell.inMonth
                      ? "border-[#edf1f3] bg-[#f7f8fa]/70 text-[#52616a]/70 dark:border-[#1c3247] dark:bg-[#091522] dark:text-slate-500"
                      : isWeekend
                        ? "border-[#edf1f3] bg-[#fafbfc] hover:bg-[#f0f3f5] dark:border-[#233c53] dark:bg-[#0c1a29] dark:hover:bg-[#132537]"
                        : "border-[#dce2e6]/80 bg-white hover:bg-[#f7f8fa] dark:border-[#233c53] dark:bg-[#0e1e2e] dark:hover:bg-[#132537]"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`tabular-nums inline-flex size-6 items-center justify-center rounded-md text-xs font-bold ${
                    isSelected
                      ? "bg-[#173d4a] text-white dark:bg-[#b99555] dark:text-[#0c1928]"
                      : isToday
                        ? "border border-[#b99555] bg-[#b99555]/15 text-[#0c1928] dark:text-amber-200"
                        : hasHoliday
                          ? "text-[#dc2626] dark:text-red-400"
                          : !cell.inMonth
                            ? "text-[#9ca3af] dark:text-slate-600"
                            : "text-[#0c1928] dark:text-slate-100"
                  }`}
                >
                  {String(cell.dayNumber).padStart(2, "0")}
                </span>

                {distinctCats.length > 0 && (
                  <div className="flex items-center gap-0.5 sm:gap-1" aria-hidden="true">
                    {distinctCats.slice(0, 4).map((cat) => (
                      <span
                        key={cat}
                        className="size-1.5 rounded-full sm:size-2"
                        style={{ backgroundColor: CATEGORY_DOT_COLORS[cat] }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile summary */}
              <div className="mt-1 sm:hidden">
                {dayEvents.length > 0 && (
                  <div className="tabular-nums truncate text-[10px] font-semibold text-[#173d4a] dark:text-[#b99555]">
                    {dayEvents.length} item{dayEvents.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>

              {/* Desktop / Tablet preview lines */}
              <div className="mt-1 hidden w-full space-y-0.5 sm:block">
                {previewEvents.map((ev) => {
                  const dotColor = ev.accentColor || CATEGORY_DOT_COLORS[ev.category];
                  return (
                    <button
                      key={ev.occurrenceKey}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDay(cell.date);
                        onOpenEvent(ev);
                      }}
                      title={`${ev.startTime ? `${ev.startTime} · ` : ""}${ev.title} (${ev.originModule})`}
                      className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
                        ev.status === "completed"
                          ? "text-[#52616a] line-through dark:text-slate-400"
                          : ev.category === "holiday"
                            ? "font-semibold text-[#dc2626] dark:text-red-300"
                            : "text-[#0c1928] dark:text-slate-200"
                      }`}
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: dotColor }}
                      />
                      {ev.startTime && (
                        <span className="tabular-nums shrink-0 font-mono text-[9px] text-[#52616a] dark:text-slate-400">
                          {ev.startTime}
                        </span>
                      )}
                      <span className="truncate">{ev.title}</span>
                    </button>
                  );
                })}
                {extraCount > 0 && (
                  <div className="tabular-nums px-1 text-[10px] font-semibold text-[#173d4a] dark:text-[#b99555]">
                    +{extraCount} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Discrete color legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#edf1f3] pt-3 text-[11px] text-[#52616a] dark:border-[#233c53] dark:text-slate-400">
        {[
          { label: "Trabalho", color: CATEGORY_DOT_COLORS.work },
          { label: "Pessoal / Notas", color: CATEGORY_DOT_COLORS.personal },
          { label: "Despesa / Fatura", color: CATEGORY_DOT_COLORS.finance_expense },
          { label: "Recebível", color: CATEGORY_DOT_COLORS.finance_revenue },
          { label: "Aniversário", color: CATEGORY_DOT_COLORS.birthday },
          { label: "Veículo", color: CATEGORY_DOT_COLORS.vehicle },
          { label: "Feriado", color: CATEGORY_DOT_COLORS.holiday },
        ].map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
