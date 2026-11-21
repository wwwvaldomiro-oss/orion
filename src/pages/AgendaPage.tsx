import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudSun,
  FileText,
  Plus,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AgendaCalendarGrid } from "@/components/agenda/AgendaCalendarGrid";
import { AgendaDayPanel } from "@/components/agenda/AgendaDayPanel";
import {
  AgendaEventModal,
  type AgendaEventModalActionMode,
} from "@/components/agenda/AgendaEventModal";
import { AgendaEventFormModal } from "@/components/agenda/AgendaEventFormModal";
import { ContactsDirectoryModal } from "@/components/agenda/ContactsDirectoryModal";
import { ClockAlarmStopwatchModal } from "@/components/agenda/AgendaAlarmManager";
import { NotesShoppingModal } from "@/components/agenda/NotesShoppingModal";
import { CalculatorHistoryModal } from "@/components/agenda/CalculatorHistoryModal";
import { WeatherModal } from "@/components/agenda/WeatherModal";
import { AgendaSettingsModal } from "@/components/agenda/AgendaSettingsModal";
import { buildMonthGrid, buildUnifiedAgendaEvents, type UnifiedAgendaEvent } from "@/lib/domain/agenda";
import { todayBR } from "@/lib/domain/money";
import type { PersonalAgendaRecord } from "@/types/orion";
import { useOrion } from "@/store/orionContext";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function shiftMonth(month: string, delta: number): string {
  const [y = 2026, m = 11] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AgendaPage() {
  const { state } = useOrion();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayBR();

  const paramDate = searchParams.get("date");
  const paramNoteId = searchParams.get("noteId");
  const initialDate = paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate) ? paramDate : today;

  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(initialDate);

  // Modals & Gear Dropdown
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement | null>(null);

  const [eventModalState, setEventModalState] = useState<{
    event: UnifiedAgendaEvent | null;
    mode: AgendaEventModalActionMode;
  }>({ event: null, mode: "details" });

  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    defaultDate: string;
    editingRecord?: PersonalAgendaRecord | null;
    overrideTargetEvent?: UnifiedAgendaEvent | null;
  }>({ open: false, defaultDate: initialDate });

  const [contactsOpen, setContactsOpen] = useState(false);
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null);
  const [clockOpen, setClockOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [linkedNoteId, setLinkedNoteId] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sync deep link params (?date=... & ?noteId=...)
  useEffect(() => {
    if (paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate)) {
      setMonth(paramDate.slice(0, 7));
      setSelectedDay(paramDate);
    }
    if (paramNoteId) {
      setLinkedNoteId(paramNoteId);
      setNotesOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("noteId");
      setSearchParams(nextParams, { replace: true });
    }
  }, [paramDate, paramNoteId, searchParams, setSearchParams]);

  // Close Gear menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!gearOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGearOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [gearOpen]);

  const [currentYear = 2026, currentMonthNum = 11] = month.split("-").map(Number);

  const gridCells = useMemo(() => buildMonthGrid(month), [month]);
  const rangeStart = gridCells[0]?.date ?? `${month}-01`;
  const rangeEnd = gridCells[gridCells.length - 1]?.date ?? `${month}-28`;

  const unifiedEvents = useMemo(
    () =>
      buildUnifiedAgendaEvents({
        rangeStart,
        rangeEnd,
        state,
        today,
      }),
    [rangeEnd, rangeStart, state, today],
  );

  const selectedDayEvents = useMemo(
    () => unifiedEvents.filter((ev) => ev.displayDate === selectedDay),
    [selectedDay, unifiedEvents],
  );

  const yearChoices = useMemo(() => {
    const base = Number(today.slice(0, 4)) || 2026;
    const set = new Set<number>();
    for (let y = base - 5; y <= base + 10; y++) set.add(y);
    set.add(currentYear);
    return Array.from(set).sort((a, b) => a - b);
  }, [currentYear, today]);

  function handleChangeMonth(nextMonth: string) {
    setMonth(nextMonth);
    if (!selectedDay.startsWith(nextMonth)) {
      const nextDay = nextMonth === today.slice(0, 7) ? today : `${nextMonth}-01`;
      setSelectedDay(nextDay);
    }
  }

  function handleSelectDay(day: string) {
    setSelectedDay(day);
    const dayYm = day.slice(0, 7);
    if (dayYm !== month) {
      setMonth(dayYm);
    }
  }

  function handleGoToday() {
    setMonth(today.slice(0, 7));
    setSelectedDay(today);
  }

  const gearItems = [
    {
      id: "clock",
      label: "Relógio, Despertador & Cronômetro",
      icon: Clock,
      onClick: () => setClockOpen(true),
    },
    {
      id: "notes",
      label: "Bloco de notas & Compras",
      icon: FileText,
      onClick: () => {
        setLinkedNoteId(null);
        setNotesOpen(true);
      },
    },
    {
      id: "calc",
      label: "Calculadora & Histórico",
      icon: Calculator,
      onClick: () => setCalcOpen(true),
    },
    {
      id: "weather",
      label: "Previsão do tempo",
      icon: CloudSun,
      onClick: () => setWeatherOpen(true),
    },
    {
      id: "settings",
      label: "Configurações da Agenda",
      icon: SlidersHorizontal,
      onClick: () => setSettingsOpen(true),
    },
  ];

  return (
    <AppShell
      title="Agenda"
      hideGlobalSearch={true}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setFormModalState({
                open: true,
                defaultDate: selectedDay,
                editingRecord: null,
                overrideTargetEvent: null,
              })
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#0c1928]"
          >
            <Plus className="size-3.5" /> Novo evento
          </button>

          <button
            type="button"
            onClick={() => {
              setLinkedContactId(null);
              setContactsOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 text-xs font-semibold text-[#0c1928] transition-colors hover:border-[#b99555] hover:bg-[#f7f8fa] dark:border-[#233c53] dark:bg-[#132537] dark:text-slate-100"
          >
            <Users className="size-3.5 text-[#173d4a] dark:text-[#b99555]" /> Contatos
          </button>

          {/* Gear dropdown menu */}
          <div ref={gearRef} className="relative">
            <button
              type="button"
              onClick={() => setGearOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={gearOpen}
              aria-label="Ferramentas e Configurações da Agenda"
              title="Ferramentas e Configurações da Agenda"
              className="grid size-9 place-items-center rounded-lg border border-[#dce2e6] bg-white text-[#0c1928] transition-colors hover:border-[#b99555] hover:bg-[#f7f8fa] dark:border-[#233c53] dark:bg-[#132537] dark:text-slate-100"
            >
              <Settings className="size-4" />
            </button>

            {gearOpen && (
              <div
                role="menu"
                aria-label="Ferramentas da Agenda"
                className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-[#dce2e6] bg-white py-1.5 shadow-xl dark:border-[#233c53] dark:bg-[#0e1e2e]"
              >
                {gearItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setGearOpen(false);
                      item.onClick();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-[#0c1928] transition-colors hover:bg-[#f0f3f5] dark:text-slate-100 dark:hover:bg-[#152b3f]"
                  >
                    <item.icon className="size-4 shrink-0 text-[#173d4a] dark:text-[#b99555]" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      }
    >
      {/* Second Header Row: Month/Year Selector directly below Agenda title */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce2e6] bg-white px-4 py-2.5 dark:border-[#233c53] dark:bg-[#0e1e2e]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleChangeMonth(shiftMonth(month, -1))}
            aria-label="Mês anterior"
            title="Mês anterior"
            className="grid size-8 place-items-center rounded-lg border border-[#dce2e6] bg-[#f7f8fa] text-[#0c1928] hover:bg-[#edf1f3] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-100"
          >
            <ChevronLeft className="size-4" />
          </button>

          <select
            aria-label="Selecionar mês"
            value={currentMonthNum}
            onChange={(e) =>
              handleChangeMonth(`${currentYear}-${String(Number(e.target.value)).padStart(2, "0")}`)
            }
            className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-semibold text-[#0c1928] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-100"
          >
            {MONTH_NAMES.map((mName, idx) => (
              <option key={mName} value={idx + 1}>
                {mName}
              </option>
            ))}
          </select>

          <select
            aria-label="Selecionar ano"
            value={currentYear}
            onChange={(e) =>
              handleChangeMonth(`${e.target.value}-${String(currentMonthNum).padStart(2, "0")}`)
            }
            className="tabular-nums h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-semibold text-[#0c1928] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-100"
          >
            {yearChoices.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => handleChangeMonth(shiftMonth(month, 1))}
            aria-label="Próximo mês"
            title="Próximo mês"
            className="grid size-8 place-items-center rounded-lg border border-[#dce2e6] bg-[#f7f8fa] text-[#0c1928] hover:bg-[#edf1f3] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-100"
          >
            <ChevronRight className="size-4" />
          </button>

          <button
            type="button"
            onClick={handleGoToday}
            className="h-8 rounded-lg border border-[#dce2e6] bg-[#f7f8fa] px-3 text-xs font-semibold text-[#173d4a] hover:border-[#b99555] hover:bg-white dark:border-[#2b4761] dark:bg-[#132537] dark:text-[#b99555]"
          >
            Hoje
          </button>
        </div>

        <div className="tabular-nums text-xs text-[#52616a] dark:text-slate-400">
          {unifiedEvents.length} compromisso(s) neste período
        </div>
      </div>

      {/* Enlarged Monthly Calendar Grid + Day Inspector Side Panel */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <AgendaCalendarGrid
            month={month}
            today={today}
            selectedDay={selectedDay}
            events={unifiedEvents}
            onSelectDay={handleSelectDay}
            onOpenEvent={(ev) => setEventModalState({ event: ev, mode: "details" })}
          />
        </div>

        <div className="lg:col-span-4">
          <AgendaDayPanel
            selectedDay={selectedDay}
            today={today}
            events={selectedDayEvents}
            onAddForDay={(day) =>
              setFormModalState({
                open: true,
                defaultDate: day,
                editingRecord: null,
                overrideTargetEvent: null,
              })
            }
            onOpenDetails={(ev) => setEventModalState({ event: ev, mode: "details" })}
            onCompleteEvent={(ev) => setEventModalState({ event: ev, mode: "complete" })}
            onPostponeEvent={(ev) => setEventModalState({ event: ev, mode: "postpone" })}
            onDeleteEvent={(ev) => setEventModalState({ event: ev, mode: "delete" })}
          />
        </div>
      </div>

      {/* Centered Modals */}
      <AgendaEventModal
        event={eventModalState.event}
        initialMode={eventModalState.mode}
        onClose={() => setEventModalState({ event: null, mode: "details" })}
        onEditFullSeries={(ev) => {
          setEventModalState({ event: null, mode: "details" });
          setFormModalState({
            open: true,
            defaultDate: ev.baseDate,
            editingRecord: ev.personalRecord ?? null,
            overrideTargetEvent: null,
          });
        }}
        onEditSingleOccurrence={(ev) => {
          setEventModalState({ event: null, mode: "details" });
          setFormModalState({
            open: true,
            defaultDate: ev.baseDate,
            editingRecord: null,
            overrideTargetEvent: ev,
          });
        }}
        onOpenLinkedNote={(noteId) => {
          setEventModalState({ event: null, mode: "details" });
          setLinkedNoteId(noteId);
          setNotesOpen(true);
        }}
        onOpenLinkedContact={(contactId) => {
          setEventModalState({ event: null, mode: "details" });
          setLinkedContactId(contactId);
          setContactsOpen(true);
        }}
      />

      <AgendaEventFormModal
        open={formModalState.open}
        defaultDate={formModalState.defaultDate}
        editingRecord={formModalState.editingRecord}
        overrideTargetEvent={formModalState.overrideTargetEvent}
        onClose={() => setFormModalState((prev) => ({ ...prev, open: false }))}
      />

      <ContactsDirectoryModal
        open={contactsOpen}
        initialContactId={linkedContactId}
        onClose={() => {
          setContactsOpen(false);
          setLinkedContactId(null);
        }}
      />

      <ClockAlarmStopwatchModal open={clockOpen} onClose={() => setClockOpen(false)} />

      <NotesShoppingModal
        open={notesOpen}
        initialNoteId={linkedNoteId}
        defaultDate={selectedDay}
        onClose={() => {
          setNotesOpen(false);
          setLinkedNoteId(null);
        }}
      />

      <CalculatorHistoryModal open={calcOpen} onClose={() => setCalcOpen(false)} />

      <WeatherModal open={weatherOpen} onClose={() => setWeatherOpen(false)} />

      <AgendaSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </AppShell>
  );
}
