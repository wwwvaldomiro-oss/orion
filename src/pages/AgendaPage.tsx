import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useOrion } from "@/store/orionContext";
import { formatDateBR, todayBR } from "@/lib/domain/money";
import {
  AGENDA_KINDS,
  brasiliaHolidays,
  financialAgendaItems,
  orderAgendaDays,
  personalOccurrences,
} from "@/lib/domain/agenda";
import type { PersonalKind, PersonalAgendaRecord } from "@/types/orion";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function shiftMonth(month: string, delta: number): string {
  const [y = 2026, m = 11] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AgendaPage() {
  const { state, savePersonalAgenda, deletePersonalAgenda, toggleAgendaCheck } = useOrion();
  const today = todayBR();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string>(today);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [kind, setKind] = useState<PersonalKind>("appointment");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [recurrence, setRecurrence] = useState<PersonalAgendaRecord["recurrence"]>("none");
  const [favorite, setFavorite] = useState(false);
  const [reminder, setReminder] = useState(true);
  const [description, setDescription] = useState("");
  const [checklistText, setChecklistText] = useState("");

  const [y = 2026, m = 11] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];

  const holidays = useMemo(
    () => brasiliaHolidays(y).filter((h) => h.date.startsWith(month)),
    [y, month],
  );
  const financialItems = useMemo(
    () => financialAgendaItems(month, state.revenueEntries, state.monthlyBills),
    [month, state.revenueEntries, state.monthlyBills],
  );
  const personalItems = useMemo(
    () => personalOccurrences(month, state.personalAgenda),
    [month, state.personalAgenda],
  );

  const orderedDays = useMemo(
    () =>
      orderAgendaDays(
        [
          ...holidays.map((h) => h.date),
          ...financialItems.map((f) => f.date),
          ...personalItems.map((p) => p.date),
        ],
        today,
      ),
    [holidays, financialItems, personalItems, today],
  );

  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));

  function openNewModal(day?: string) {
    setStartDate(day ?? selectedDay);
    setTitle("");
    setDescription("");
    setChecklistText("");
    setKind("appointment");
    setRecurrence("none");
    setFavorite(false);
    setReminder(true);
    setModalOpen(true);
  }

  function submitRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Informe um título.");
      return;
    }
    const items = checklistText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((desc, idx) => ({ key: `i-${idx}`, description: desc }));

    savePersonalAgenda({
      kind,
      title: title.trim(),
      startDate,
      time,
      description: description.trim(),
      recurrence,
      favorite,
      reminder,
      items,
    });
    setModalOpen(false);
    toast.success("Compromisso salvo na agenda.");
  }

  const dayHolidays = holidays.filter((h) => h.date === selectedDay);
  const dayFinancial = financialItems.filter((f) => f.date === selectedDay);
  const dayPersonal = personalItems.filter((p) => p.date === selectedDay);

  return (
    <AppShell
      title="Agenda"
      subtitle="Brasília, DF · Feriados oficiais, vencimentos financeiros e rotina pessoal"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Mês anterior"
            className="grid size-9 place-items-center rounded-lg border border-[#dce2e6] bg-white hover:bg-[#f0f3f5]"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold capitalize text-[#0c1928]">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Próximo mês"
            className="grid size-9 place-items-center rounded-lg border border-[#dce2e6] bg-white hover:bg-[#f0f3f5]"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => openNewModal()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928] whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Novo evento
          </button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar Grid */}
        <section className="rounded-xl border border-[#dce2e6] bg-white p-4 lg:col-span-2">
          <div className="grid grid-cols-7 gap-1 text-xs">
            {WEEK.map((w) => (
              <div key={w} className="py-1.5 text-center font-semibold text-[#52616a]">
                {w}
              </div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="min-h-20 rounded-lg bg-[#f7f8fa]/50" />;
              const hasHoliday = holidays.some((h) => h.date === day);
              const finCount = financialItems.filter((f) => f.date === day).length;
              const perCount = personalItems.filter((p) => p.date === day).length;
              const isToday = day === today;
              const isSelected = day === selectedDay;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`flex min-h-20 flex-col items-start justify-between rounded-lg border p-1.5 text-left transition-colors ${
                    isSelected
                      ? "border-[#173d4a] bg-[#edf1f3]"
                      : isToday
                        ? "border-[#b99555] bg-[#faf7f0]"
                        : "border-[#edf1f3] hover:bg-[#f7f8fa]"
                  }`}
                >
                  <span
                    className={`tabular-nums text-xs font-bold ${
                      hasHoliday
                        ? "text-[#dc2626]"
                        : isToday
                          ? "text-[#173d4a]"
                          : "text-[#0c1928]"
                    }`}
                  >
                    {day.slice(8, 10)}
                  </span>
                  <div className="w-full space-y-0.5 text-[10px] leading-tight">
                    {hasHoliday && (
                      <div className="truncate font-semibold text-[#dc2626]">Feriado DF</div>
                    )}
                    {finCount > 0 && (
                      <div className="truncate text-[#173d4a]">{finCount} financ.</div>
                    )}
                    {perCount > 0 && (
                      <div className="truncate text-[#52616a]">{perCount} pessoal</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Day Inspector */}
        <section className="space-y-4 rounded-xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#0c1928]">{formatDateBR(selectedDay)}</h2>
              <p className="text-xs text-[#52616a]">
                {selectedDay === today ? "Hoje" : selectedDay > today ? "Próximo" : "Passado"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openNewModal(selectedDay)}
              className="rounded-lg border border-[#dce2e6] px-2.5 py-1.5 text-xs font-semibold hover:bg-[#f0f3f5]"
            >
              + Adicionar
            </button>
          </div>

          {dayHolidays.map((h) => (
            <div key={h.id} className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3 text-xs">
              <div className="font-bold text-[#dc2626]">Feriado · {h.title}</div>
            </div>
          ))}

          <div className="divide-y divide-[#edf1f3]">
            {dayFinancial.map((f) => (
              <div key={f.id} className="py-2.5 text-sm">
                <div className="font-semibold text-[#0c1928]">{f.title}</div>
                <div className="text-xs text-[#52616a]">
                  {f.kind === "pagamento" ? "Recebimento" : "Vencimento"} ·{" "}
                  {f.done ? "Concluído" : "Em aberto"}
                </div>
              </div>
            ))}

            {dayPersonal.map((p) => (
              <div key={p.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1 font-semibold text-[#0c1928]">
                      {p.record.favorite && <Star className="size-3.5 fill-[#b99555] text-[#b99555]" />}
                      {p.title}
                    </div>
                    <div className="text-xs text-[#52616a]">
                      {p.reminderDays
                        ? `Lembrete em ${p.reminderDays} dia(s)`
                        : `${AGENDA_KINDS[p.record.kind]}${p.record.time ? ` · ${p.record.time}` : ""}`}
                    </div>
                  </div>
                  {!p.reminderDays && (
                    <button
                      type="button"
                      onClick={() => {
                        deletePersonalAgenda(p.record.id);
                        toast.success("Registro removido.");
                      }}
                      aria-label="Excluir compromisso"
                      className="text-[#52616a] hover:text-[#dc2626]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>

                {!p.reminderDays && p.record.items.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {p.record.items.map((item) => {
                      const key = `${p.record.id}:${p.date}:${item.key}`;
                      const done = Boolean(state.agendaChecks[key]);
                      return (
                        <label key={item.key} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={(e) =>
                              toggleAgendaCheck(p.record.id, p.date, item.key, e.target.checked)
                            }
                            className="size-3.5 accent-[#16a34a]"
                          />
                          <span className={done ? "text-[#52616a] line-through" : "text-[#0c1928]"}>
                            {item.description}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {dayHolidays.length === 0 && dayFinancial.length === 0 && dayPersonal.length === 0 && (
              <p className="py-6 text-center text-xs text-[#52616a]">
                Nenhuma atividade registrada para esta data.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Ordered chronological list: Present -> Future -> Past */}
      <section className="mt-6 rounded-xl border border-[#dce2e6] bg-white p-5">
        <h2 className="text-base font-semibold text-[#0c1928]">
          Linha do Tempo do Mês (Presente · Futuro · Passado)
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {orderedDays.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDay(d)}
              className={`tabular-nums rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                d === selectedDay
                  ? "border-[#173d4a] bg-[#173d4a] text-white"
                  : d < today
                    ? "border-[#edf1f3] bg-[#f7f8fa] text-[#52616a]"
                    : "border-[#dce2e6] bg-white text-[#0c1928] hover:bg-[#f0f3f5]"
              }`}
            >
              {formatDateBR(d)}
            </button>
          ))}
        </div>
      </section>

      {/* Modal: New Personal Agenda Record */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0c1928]">Novo Registro na Agenda</h3>
            <form onSubmit={submitRecord} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Tipo</label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as PersonalKind)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                  >
                    {Object.entries(AGENDA_KINDS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Recorrência</label>
                  <select
                    value={recurrence}
                    onChange={(e) =>
                      setRecurrence(e.target.value as PersonalAgendaRecord["recurrence"])
                    }
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                  >
                    <option value="none">Única</option>
                    <option value="daily">Diária</option>
                    <option value="12x36">Plantão 12x36</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Título</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Consulta médica ou Plantão"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Data</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Horário</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">
                  Checklist (um item por linha, opcional)
                </label>
                <textarea
                  value={checklistText}
                  onChange={(e) => setChecklistText(e.target.value)}
                  rows={3}
                  placeholder="Item 1&#10;Item 2"
                  className="w-full rounded-lg border border-[#cbd3d8] p-2.5 text-sm"
                />
              </div>

              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={favorite}
                    onChange={(e) => setFavorite(e.target.checked)}
                    className="size-4 accent-[#173d4a]"
                  />
                  Destacar (lembretes 7, 3 e 1d)
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={reminder}
                    onChange={(e) => setReminder(e.target.checked)}
                    className="size-4 accent-[#173d4a]"
                  />
                  Exibir lembrete
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
