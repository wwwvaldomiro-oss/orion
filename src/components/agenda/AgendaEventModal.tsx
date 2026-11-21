import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Edit3,
  ExternalLink,
  RotateCcw,
  StickyNote,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/domain/money";
import type { UnifiedAgendaEvent } from "@/lib/domain/agenda";
import { useOrion } from "@/store/orionContext";

export type AgendaEventModalActionMode =
  | "details"
  | "complete"
  | "postpone"
  | "delete"
  | "edit-scope";

export function AgendaEventModal({
  event,
  initialMode = "details",
  onClose,
  onEditFullSeries,
  onEditSingleOccurrence,
  onOpenLinkedNote,
  onOpenLinkedContact,
}: {
  event: UnifiedAgendaEvent | null;
  initialMode?: AgendaEventModalActionMode;
  onClose: () => void;
  onEditFullSeries: (event: UnifiedAgendaEvent) => void;
  onEditSingleOccurrence: (event: UnifiedAgendaEvent) => void;
  onOpenLinkedNote: (noteId: string) => void;
  onOpenLinkedContact: (contactId: string) => void;
}) {
  const { savePersonalAgenda, deletePersonalAgenda, saveAgendaOverride, clearAgendaOverride } =
    useOrion();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AgendaEventModalActionMode>(initialMode);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeTime, setPostponeTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!event) return;
    setMode(initialMode);
    setPostponeDate(event.displayDate);
    setPostponeTime(event.startTime || "09:00");
  }, [event, initialMode]);

  if (!event) return null;

  const isFinancialOrExternal = event.readOnly;
  const isOwnSeries = !event.readOnly && event.sourceType === "personal" && Boolean(event.isRecurring);
  const canClearOverride = Boolean(event.override);

  async function handleConfirmComplete(scope: "occurrence" | "series") {
    if (!event) return;
    setBusy(true);
    try {
      if (isFinancialOrExternal || (isOwnSeries && scope === "occurrence")) {
        const alreadyMarked = event.override?.action === "completed";
        if (alreadyMarked && event.override) {
          await clearAgendaOverride(event.override.id);
          toast.success("Marcação visual removida na Agenda.");
        } else {
          await saveAgendaOverride({
            id: event.override?.id,
            sourceType: event.sourceType,
            sourceId: event.sourceId,
            occurrenceDate: event.baseDate,
            action: "completed",
          });
          toast.success(
            isFinancialOrExternal
              ? "Marcado apenas como visto na Agenda. O módulo de origem permanece inalterado."
              : "Ocorrência concluída na Agenda.",
          );
        }
      } else if (event.personalRecord) {
        const nextCompleted = !event.personalRecord.completed;
        await savePersonalAgenda({
          ...event.personalRecord,
          completed: nextCompleted,
          completedAt: nextCompleted ? new Date().toISOString() : undefined,
        });
        toast.success(nextCompleted ? "Compromisso concluído." : "Compromisso reaberto.");
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmPostpone(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !postponeDate) return;
    setBusy(true);
    try {
      if (!event.readOnly && event.personalRecord && !event.isRecurring) {
        await savePersonalAgenda({
          ...event.personalRecord,
          startDate: postponeDate,
          time: postponeTime || event.personalRecord.time,
        });
        toast.success("Data e horário do compromisso atualizados.");
      } else {
        await saveAgendaOverride({
          id: event.override?.id,
          sourceType: event.sourceType,
          sourceId: event.sourceId,
          occurrenceDate: event.baseDate,
          action: "postponed",
          postponedToDate: postponeDate,
          postponedToTime: postponeTime || undefined,
        });
        toast.success(
          event.readOnly
            ? "Lembrete adiado apenas na Agenda (vencimento original preservado)."
            : "Ocorrência adiada sem alterar a regra da série.",
        );
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmDelete(scope: "occurrence" | "series") {
    if (!event) return;
    setBusy(true);
    try {
      if (isFinancialOrExternal || scope === "occurrence") {
        await saveAgendaOverride({
          id: event.override?.id,
          sourceType: event.sourceType,
          sourceId: event.sourceId,
          occurrenceDate: event.baseDate,
          action: "hidden",
        });
        toast.success(
          isFinancialOrExternal
            ? "Exibição ocultada da Agenda. Nenhum registro de origem foi apagado."
            : "Somente esta ocorrência foi removida. A série continua ativa.",
        );
      } else if (event.personalRecord) {
        await deletePersonalAgenda(event.personalRecord.id);
        toast.success("Série removida da Agenda.");
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreOverride() {
    if (!event?.override) return;
    setBusy(true);
    try {
      await clearAgendaOverride(event.override.id);
      toast.success("Ocorrência restaurada para a configuração original.");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agenda-event-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e] dark:text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#b99555]">
              {event.kindLabel} · {event.originModule}
            </p>
            <h2
              id="agenda-event-modal-title"
              className="mt-0.5 truncate text-lg font-semibold text-[#0c1928] dark:text-white"
            >
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5] dark:text-slate-300 dark:hover:bg-[#152b3f]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
          {mode === "details" && (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3.5 text-xs dark:border-[#233c53] dark:bg-[#132537]">
                <div>
                  <span className="block text-[#52616a] dark:text-slate-400">Data exibida</span>
                  <strong className="tabular-nums text-sm text-[#0c1928] dark:text-white">
                    {formatDateBR(event.displayDate)}
                  </strong>
                  {event.displayDate !== event.baseDate && (
                    <span className="tabular-nums block text-[11px] text-[#b99555]">
                      Original: {formatDateBR(event.baseDate)}
                    </span>
                  )}
                </div>
                <div>
                  <span className="block text-[#52616a] dark:text-slate-400">Horário / Jornada</span>
                  <strong className="tabular-nums text-sm text-[#0c1928] dark:text-white">
                    {event.startTime
                      ? event.endTime
                        ? `${event.startTime} às ${event.endTime}${event.spansNextDay ? " (+1 dia)" : ""}`
                        : event.startTime
                      : "Dia inteiro"}
                  </strong>
                </div>
                {event.company && (
                  <div className="col-span-2">
                    <span className="block text-[#52616a] dark:text-slate-400">Empresa / Local</span>
                    <strong className="text-[#0c1928] dark:text-white">{event.company}</strong>
                  </div>
                )}
                {event.breakRule && (
                  <div className="col-span-2">
                    <span className="block text-[#52616a] dark:text-slate-400">Intervalo</span>
                    <strong className="text-[#0c1928] dark:text-white">{event.breakRule}</strong>
                  </div>
                )}
                {typeof event.amountCents === "number" && event.amountCents > 0 && (
                  <div>
                    <span className="block text-[#52616a] dark:text-slate-400">Valor</span>
                    <strong className="tabular-nums text-sm text-[#0c1928] dark:text-amber-200">
                      {formatBRL(event.amountCents)}
                    </strong>
                  </div>
                )}
                <div>
                  <span className="block text-[#52616a] dark:text-slate-400">Situação</span>
                  <strong className="text-[#0c1928] dark:text-white">
                    {event.status === "completed"
                      ? event.readOnly
                        ? "Confirmado na origem"
                        : "Concluído"
                      : event.status === "overdue"
                        ? "Em atraso"
                        : event.status === "info"
                          ? "Informativo"
                          : "Em aberto / Pendente"}
                  </strong>
                </div>
              </div>

              {(event.subtitle || event.description) && (
                <div className="space-y-1.5 text-xs">
                  {event.subtitle && (
                    <p className="font-medium text-[#173d4a] dark:text-slate-200">{event.subtitle}</p>
                  )}
                  {event.description && (
                    <p className="whitespace-pre-line text-[#52616a] dark:text-slate-300">
                      {event.description}
                    </p>
                  )}
                </div>
              )}

              {event.readOnly && (
                <div className="rounded-lg border border-[#dce2e6] bg-[#faf7f0] p-3 text-xs text-[#52616a] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-300">
                  Registro sincronizado de <strong>{event.originModule}</strong>. Ações na Agenda não baixam saldos nem modificam lançamentos contratuais.
                </div>
              )}

              {/* Origin / Linked deep-action buttons */}
              <div className="flex flex-wrap gap-2">
                {event.originRoute && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(event.originRoute!);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#173d4a] px-3 text-xs font-semibold text-[#173d4a] hover:bg-[#edf1f3] dark:border-[#b99555] dark:text-[#b99555] dark:hover:bg-[#152b3f]"
                  >
                    <ExternalLink className="size-3.5" /> Ir para {event.originModule}
                  </button>
                )}
                {event.linkedNoteId && (
                  <button
                    type="button"
                    onClick={() => onOpenLinkedNote(event.linkedNoteId!)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#b99555] bg-[#faf7f0] px-3 text-xs font-semibold text-[#0c1928] hover:bg-[#f2eee7] dark:bg-[#152b3f] dark:text-amber-200"
                  >
                    <StickyNote className="size-3.5" /> Abrir nota vinculada
                  </button>
                )}
                {event.linkedContactId && (
                  <button
                    type="button"
                    onClick={() => onOpenLinkedContact(event.linkedContactId!)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dce2e6] px-3 text-xs font-semibold hover:bg-[#f0f3f5] dark:border-[#2b4761]"
                  >
                    <UserRound className="size-3.5" /> Ver ficha do contato
                  </button>
                )}
                {canClearOverride && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRestoreOverride()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dce2e6] px-3 text-xs font-semibold text-[#52616a] hover:bg-[#f0f3f5] dark:border-[#2b4761] dark:text-slate-300"
                  >
                    <RotateCcw className="size-3.5" /> Restaurar original
                  </button>
                )}
              </div>
            </>
          )}

          {mode === "complete" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[#dce2e6] bg-[#f7f8fa] p-4 text-xs leading-relaxed dark:border-[#233c53] dark:bg-[#132537]">
                {isFinancialOrExternal ? (
                  <>
                    <p className="font-semibold text-[#0c1928] dark:text-white">
                      Marcar lembrete como visto apenas na Agenda?
                    </p>
                    <p className="mt-1.5 text-[#52616a] dark:text-slate-300">
                      Esta ação <strong>NÃO quita</strong> o lançamento financeiro, <strong>NÃO altera saldos bancários</strong> e preserva intacta a obrigação em {event.originModule}.
                    </p>
                  </>
                ) : isOwnSeries ? (
                  <>
                    <p className="font-semibold text-[#0c1928] dark:text-white">
                      Concluir esta ocorrência ou toda a série?
                    </p>
                    <p className="mt-1.5 text-[#52616a] dark:text-slate-300">
                      Para escalas 12×36 e eventos recorrentes, recomendamos concluir apenas o dia{" "}
                      <strong>{formatDateBR(event.baseDate)}</strong>.
                    </p>
                  </>
                ) : (
                  <p className="font-semibold text-[#0c1928] dark:text-white">
                    Confirmar conclusão de "{event.title}"?
                  </p>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode("details")}
                  className="h-9 rounded-lg border border-[#dce2e6] px-3 text-xs font-semibold dark:border-[#2b4761]"
                >
                  Voltar
                </button>
                {isOwnSeries && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleConfirmComplete("series")}
                    className="h-9 rounded-lg border border-[#16a34a] px-3 text-xs font-semibold text-[#15803d] hover:bg-[#f0fdf4] dark:text-emerald-300"
                  >
                    Concluir série inteira
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleConfirmComplete("occurrence")}
                  className="h-9 rounded-lg bg-[#16a34a] px-4 text-xs font-semibold text-white hover:bg-[#15803d]"
                >
                  {isFinancialOrExternal
                    ? event.override?.action === "completed"
                      ? "Desmarcar visto"
                      : "Marcar visto na Agenda"
                    : "Confirmar"}
                </button>
              </div>
            </div>
          )}

          {mode === "postpone" && (
            <form onSubmit={(e) => void handleConfirmPostpone(e)} className="space-y-3">
              <div className="rounded-lg border border-[#dce2e6] bg-[#faf7f0] p-3 text-xs text-[#52616a] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-300">
                {event.readOnly
                  ? "Adiar altera apenas a exibição do lembrete na Agenda e NÃO modifica o vencimento original do módulo financeiro/veicular."
                  : event.isRecurring
                    ? "Adiar cria uma exceção pontual somente para esta ocorrência, preservando os demais dias da escala."
                    : "Escolha a nova data e horário deste compromisso."}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                    Nova data
                  </span>
                  <input
                    type="date"
                    value={postponeDate}
                    onChange={(e) => setPostponeDate(e.target.value)}
                    required
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                    Horário
                  </span>
                  <input
                    type="time"
                    value={postponeTime}
                    onChange={(e) => setPostponeTime(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMode("details")}
                  className="h-9 rounded-lg border border-[#dce2e6] px-3 text-xs font-semibold dark:border-[#2b4761]"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928]"
                >
                  Salvar adiamento
                </button>
              </div>
            </form>
          )}

          {mode === "delete" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-4 text-xs text-[#991b1b] dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {isFinancialOrExternal ? (
                  <>
                    <p className="font-semibold">Ocultar apenas da Agenda?</p>
                    <p className="mt-1">
                      Este registro pertence a <strong>{event.originModule}</strong>. A exclusão na Agenda apenas oculta a visualização/lembrete desta ocorrência e <strong>nunca apaga</strong> o documento original.
                    </p>
                  </>
                ) : isOwnSeries ? (
                  <>
                    <p className="font-semibold">Escopo da exclusão em série recorrente</p>
                    <p className="mt-1">
                      Deseja remover somente o dia <strong>{formatDateBR(event.baseDate)}</strong> (criando exceção) ou excluir permanentemente toda a série/escala?
                    </p>
                  </>
                ) : (
                  <p className="font-semibold">
                    Deseja excluir permanentemente "{event.title}" da sua Agenda?
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode("details")}
                  className="h-9 rounded-lg border border-[#dce2e6] px-3 text-xs font-semibold dark:border-[#2b4761]"
                >
                  Cancelar
                </button>
                {(isFinancialOrExternal || isOwnSeries) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleConfirmDelete("occurrence")}
                    className="h-9 rounded-lg border border-[#dc2626] bg-white px-3 text-xs font-semibold text-[#dc2626] hover:bg-[#fef2f2] dark:bg-[#132537] dark:text-red-300"
                  >
                    {isFinancialOrExternal ? "Ocultar da Agenda" : "Excluir só esta ocorrência"}
                  </button>
                )}
                {!isFinancialOrExternal && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleConfirmDelete("series")}
                    className="h-9 rounded-lg bg-[#dc2626] px-4 text-xs font-semibold text-white hover:bg-[#b91c1c]"
                  >
                    {isOwnSeries ? "Excluir série completa" : "Confirmar exclusão"}
                  </button>
                )}
              </div>
            </div>
          )}

          {mode === "edit-scope" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[#dce2e6] bg-[#f7f8fa] p-4 text-xs dark:border-[#233c53] dark:bg-[#132537]">
                <p className="font-semibold text-[#0c1928] dark:text-white">
                  Como deseja editar este compromisso recorrente?
                </p>
                <p className="mt-1 text-[#52616a] dark:text-slate-300">
                  Você pode registrar uma troca/exceção somente para <strong>{formatDateBR(event.baseDate)}</strong> sem alterar a regra-base da escala, ou editar a série inteira.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode("details")}
                  className="h-9 rounded-lg border border-[#dce2e6] px-3 text-xs font-semibold dark:border-[#2b4761]"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => onEditSingleOccurrence(event)}
                  className="h-9 rounded-lg border border-[#173d4a] px-3 text-xs font-semibold text-[#173d4a] hover:bg-[#edf1f3] dark:border-[#b99555] dark:text-[#b99555]"
                >
                  Editar só esta ocorrência
                </button>
                <button
                  type="button"
                  onClick={() => onEditFullSeries(event)}
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928]"
                >
                  Editar série inteira
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions on Details view */}
        {mode === "details" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dce2e6] bg-[#f7f8fa] px-5 py-3 dark:border-[#233c53] dark:bg-[#132537]">
            <div className="flex flex-wrap items-center gap-1.5">
              {event.canEdit && event.personalRecord && (
                <button
                  type="button"
                  onClick={() =>
                    event.isRecurring ? setMode("edit-scope") : onEditFullSeries(event)
                  }
                  title="Editar compromisso"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-2.5 text-xs font-semibold hover:bg-[#f0f3f5] dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                >
                  <Edit3 className="size-3.5" /> Editar
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("complete")}
                title="Concluir"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-2.5 text-xs font-semibold text-[#15803d] hover:bg-[#f0fdf4] dark:border-[#2b4761] dark:bg-[#0e1e2e] dark:text-emerald-300"
              >
                <CheckCircle2 className="size-3.5" /> Concluir
              </button>
              <button
                type="button"
                onClick={() => setMode("postpone")}
                title="Adiar"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-2.5 text-xs font-semibold hover:bg-[#f0f3f5] dark:border-[#2b4761] dark:bg-[#0e1e2e]"
              >
                <CalendarClock className="size-3.5" /> Adiar
              </button>
              <button
                type="button"
                onClick={() => setMode("delete")}
                title="Excluir"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#fecaca] bg-white px-2.5 text-xs font-semibold text-[#dc2626] hover:bg-[#fef2f2] dark:border-red-900/50 dark:bg-[#0e1e2e] dark:text-red-300"
              >
                <Trash2 className="size-3.5" /> Excluir
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg bg-[#173d4a] px-3.5 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
