import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import {
  AGENDA_KINDS,
  buildMonthGrid,
  crossesMidnight,
  type UnifiedAgendaEvent,
} from "@/lib/domain/agenda";
import { CONTACT_COLOR_PALETTE } from "@/lib/domain/agendaContacts";
import type { AgendaRecurrence, PersonalAgendaRecord, PersonalKind } from "@/types/orion";
import { useOrion } from "@/store/orionContext";

function shiftYm(ym: string, delta: number): string {
  const [y = 2026, m = 1] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AgendaEventFormModal({
  open,
  defaultDate,
  editingRecord,
  overrideTargetEvent,
  onClose,
}: {
  open: boolean;
  defaultDate: string;
  editingRecord?: PersonalAgendaRecord | null;
  overrideTargetEvent?: UnifiedAgendaEvent | null;
  onClose: () => void;
}) {
  const { savePersonalAgenda, saveAgendaOverride } = useOrion();

  const isSingleOccurrenceMode = Boolean(overrideTargetEvent);

  const [kind, setKind] = useState<PersonalKind>("appointment");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [company, setCompany] = useState("");
  const [breakRule, setBreakRule] = useState("");
  const [recurrence, setRecurrence] = useState<AgendaRecurrence>("none");
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [miniMonth, setMiniMonth] = useState(defaultDate.slice(0, 7));
  const [description, setDescription] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [reminder, setReminder] = useState(true);
  const [color, setColor] = useState("#173d4a");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (overrideTargetEvent) {
      setKind(overrideTargetEvent.personalRecord?.kind ?? "work");
      setTitle(overrideTargetEvent.title);
      setStartDate(overrideTargetEvent.baseDate);
      setTime(overrideTargetEvent.startTime || "07:00");
      setEndTime(overrideTargetEvent.endTime || "19:00");
      setCompany(overrideTargetEvent.company || "");
      setBreakRule(overrideTargetEvent.breakRule || "");
      setDescription(overrideTargetEvent.description || "");
      setColor(overrideTargetEvent.accentColor || "#2563eb");
      return;
    }

    if (editingRecord) {
      setKind(editingRecord.kind);
      setTitle(editingRecord.title);
      setStartDate(editingRecord.startDate);
      setTime(editingRecord.time || "09:00");
      setEndTime(editingRecord.endTime || (editingRecord.kind === "work" ? "19:00" : ""));
      setCompany(editingRecord.company || "");
      setBreakRule(editingRecord.breakRule || "");
      setRecurrence(editingRecord.recurrence);
      setCustomDates(editingRecord.customDates ?? [editingRecord.startDate]);
      setMiniMonth((editingRecord.startDate || defaultDate).slice(0, 7));
      setDescription(editingRecord.description || "");
      setChecklistText(editingRecord.items.map((i) => i.description).join("\n"));
      setFavorite(editingRecord.favorite);
      setReminder(editingRecord.reminder);
      setColor(editingRecord.color || (editingRecord.kind === "work" ? "#2563eb" : "#173d4a"));
      return;
    }

    setKind("appointment");
    setTitle("");
    setStartDate(defaultDate);
    setTime("09:00");
    setEndTime("");
    setCompany("");
    setBreakRule("");
    setRecurrence("none");
    setCustomDates([defaultDate]);
    setMiniMonth(defaultDate.slice(0, 7));
    setDescription("");
    setChecklistText("");
    setFavorite(false);
    setReminder(true);
    setColor("#173d4a");
  }, [defaultDate, editingRecord, open, overrideTargetEvent]);

  const miniCells = useMemo(() => buildMonthGrid(miniMonth), [miniMonth]);

  if (!open) return null;

  function handleKindChange(nextKind: PersonalKind) {
    setKind(nextKind);
    if (nextKind === "work") {
      if (!endTime) setEndTime("19:00");
      if (time === "09:00") setTime("07:00");
      if (recurrence === "none") setRecurrence("12x36");
      setColor("#2563eb");
    }
  }

  function toggleCustomDate(ymd: string) {
    setCustomDates((prev) =>
      prev.includes(ymd) ? prev.filter((d) => d !== ymd) : [...prev, ymd].sort(),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Informe um título.");
      return;
    }

    if (recurrence === "custom" && customDates.length === 0) {
      toast.error("Selecione ao menos um dia no mini calendário.");
      return;
    }

    setSaving(true);
    try {
      if (overrideTargetEvent) {
        await saveAgendaOverride({
          id: overrideTargetEvent.override?.id,
          sourceType: overrideTargetEvent.sourceType,
          sourceId: overrideTargetEvent.sourceId,
          occurrenceDate: overrideTargetEvent.baseDate,
          action: "modified",
          overrideTitle: title.trim(),
          overrideTime: time,
          overrideEndTime: endTime || undefined,
          overrideCompany: company.trim() || undefined,
          overrideBreakRule: breakRule.trim() || undefined,
          overrideDescription: description.trim(),
        });
        toast.success("Exceção registrada apenas para esta ocorrência.");
        onClose();
        return;
      }

      const items = checklistText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((desc, idx) => ({
          key: editingRecord?.items[idx]?.key ?? `i-${idx}`,
          description: desc,
        }));

      const sortedCustom = recurrence === "custom" ? [...customDates].sort() : undefined;
      const effectiveStart =
        recurrence === "custom" && sortedCustom && sortedCustom.length > 0
          ? sortedCustom[0]!
          : startDate;

      await savePersonalAgenda({
        ...(editingRecord ? { id: editingRecord.id } : {}),
        kind,
        title: title.trim(),
        startDate: effectiveStart,
        time,
        ...(endTime ? { endTime } : {}),
        ...(company.trim() ? { company: company.trim() } : {}),
        ...(breakRule.trim() ? { breakRule: breakRule.trim() } : {}),
        description: description.trim(),
        recurrence,
        ...(sortedCustom ? { customDates: sortedCustom } : {}),
        favorite,
        reminder,
        color,
        items,
        ...(editingRecord?.linkedNoteId ? { linkedNoteId: editingRecord.linkedNoteId } : {}),
        ...(editingRecord?.linkedContactId ? { linkedContactId: editingRecord.linkedContactId } : {}),
      });
      toast.success(editingRecord ? "Compromisso atualizado." : "Compromisso salvo na Agenda.");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const showMidnightBadge = crossesMidnight(time, endTime);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agenda-form-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e] dark:text-slate-100">
        <div className="flex items-center justify-between border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
          <h2 id="agenda-form-modal-title" className="text-lg font-semibold">
            {isSingleOccurrenceMode
              ? `Editar ocorrência (${overrideTargetEvent!.baseDate.split("-").reverse().join("/")})`
              : editingRecord
                ? "Editar compromisso"
                : "Novo compromisso na Agenda"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="grid size-8 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5] dark:text-slate-300 dark:hover:bg-[#152b3f]"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 space-y-3.5 overflow-y-auto p-5">
          {!isSingleOccurrenceMode && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                  Tipo de registro
                </span>
                <select
                  value={kind}
                  onChange={(e) => handleKindChange(e.target.value as PersonalKind)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                >
                  {Object.entries(AGENDA_KINDS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                  {kind === "work" ? "Escala / Recorrência" : "Recorrência"}
                </span>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as AgendaRecurrence)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                >
                  <option value="none">Única</option>
                  <option value="12x36">Plantão 12×36 (escala contínua)</option>
                  <option value="custom">Outros (selecionar dias no mini calendário)</option>
                  <option value="daily">Diária</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
              Título *
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "work" ? "Ex.: Plantão Diurno ou Expediente" : "Ex.: Consulta, Reunião..."
              }
              required
              className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
            />
          </label>

          {/* Work-specific fields: Empresa/Local & Intervalo — always visible when kind === "work" */}
          {kind === "work" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                  Empresa / Trabalho / Local
                </span>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Ex.: Hospital Regional / Unidade Centro"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                  Regra de intervalo
                </span>
                <input
                  value={breakRule}
                  onChange={(e) => setBreakRule(e.target.value)}
                  placeholder="Ex.: 1h de intervalo (12:00–13:00)"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                />
              </label>
            </div>
          )}

          {/* Date & Start/End Times */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {!isSingleOccurrenceMode && recurrence !== "custom" && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                  {recurrence === "12x36" ? "Data-base da escala *" : "Data inicial *"}
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                {kind === "work" ? "Entrada" : "Horário início"}
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                {kind === "work" ? "Saída" : "Horário término (opcional)"}
              </span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
              />
              {showMidnightBadge && (
                <span className="mt-0.5 block text-[10px] font-semibold text-[#b99555]">
                  Jornada noturna: termina no dia seguinte (+1d)
                </span>
              )}
            </label>
          </div>

          {recurrence === "12x36" && !isSingleOccurrenceMode && (
            <div className="rounded-lg border border-[#dce2e6] bg-[#f7f8fa] px-3 py-2 text-xs text-[#52616a] dark:border-[#233c53] dark:bg-[#132537] dark:text-slate-300">
              A escala 12×36 mantém a fase fixa a cada 2 dias a partir de{" "}
              <strong className="tabular-nums">{startDate.split("-").reverse().join("/")}</strong>{" "}
              atravessando viradas de mês, ano e anos bissextos sem reiniciar contagem.
            </div>
          )}

          {/* Mini-calendar for custom "Outros" schedule */}
          {recurrence === "custom" && !isSingleOccurrenceMode && (
            <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3 dark:border-[#233c53] dark:bg-[#132537]">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMiniMonth(shiftYm(miniMonth, -1))}
                  aria-label="Mês anterior no mini calendário"
                  className="grid size-7 place-items-center rounded border border-[#dce2e6] bg-white dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="text-xs font-semibold capitalize">
                  {new Intl.DateTimeFormat("pt-BR", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${miniMonth}-01T12:00:00Z`))}
                </span>
                <button
                  type="button"
                  onClick={() => setMiniMonth(shiftYm(miniMonth, 1))}
                  aria-label="Próximo mês no mini calendário"
                  className="grid size-7 place-items-center rounded border border-[#dce2e6] bg-white dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((w, idx) => (
                  <span key={idx} className="font-semibold text-[#52616a] dark:text-slate-400">
                    {w}
                  </span>
                ))}
                {miniCells.map((cell) => {
                  const active = customDates.includes(cell.date);
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => toggleCustomDate(cell.date)}
                      className={`tabular-nums h-7 rounded text-[11px] font-semibold ${
                        active
                          ? "bg-[#173d4a] text-white dark:bg-[#b99555] dark:text-[#0c1928]"
                          : cell.inMonth
                            ? "bg-white text-[#0c1928] hover:bg-[#edf1f3] dark:bg-[#0e1e2e] dark:text-slate-200"
                            : "bg-transparent text-[#9ca3af] dark:text-slate-600"
                      }`}
                    >
                      {cell.dayNumber}
                    </button>
                  );
                })}
              </div>
              <p className="tabular-nums mt-2 text-[11px] text-[#52616a] dark:text-slate-300">
                {customDates.length} dia(s) selecionado(s).
              </p>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
              Observações / Descrição
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Detalhes adicionais..."
              className="w-full rounded-lg border border-[#cbd3d8] bg-white p-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
            />
          </label>

          {!isSingleOccurrenceMode && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                  Checklist (um item por linha, opcional)
                </span>
                <textarea
                  value={checklistText}
                  onChange={(e) => setChecklistText(e.target.value)}
                  rows={2}
                  placeholder="Item 1&#10;Item 2"
                  className="w-full rounded-lg border border-[#cbd3d8] bg-white p-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                />
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                  Cor de identificação
                </span>
                <div className="flex flex-wrap gap-2">
                  {CONTACT_COLOR_PALETTE.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColor(c.hex)}
                      title={c.label}
                      aria-label={c.label}
                      className={`size-6 rounded-full border-2 transition-transform ${
                        color === c.hex ? "scale-110 border-[#0c1928] dark:border-white" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={favorite}
                    onChange={(e) => setFavorite(e.target.checked)}
                    className="size-4 accent-[#173d4a]"
                  />
                  Destacar (lembretes 7, 3 e 1d antes)
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={reminder}
                    onChange={(e) => setReminder(e.target.checked)}
                    className="size-4 accent-[#173d4a]"
                  />
                  Exibir lembrete antecipado
                </label>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 border-t border-[#edf1f3] pt-3 dark:border-[#233c53]">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold dark:border-[#2b4761]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
