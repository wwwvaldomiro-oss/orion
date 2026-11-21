import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  Check,
  CheckSquare,
  FileText,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  computeItemTotalCents,
  computeShoppingNoteTotals,
  computeStoreTotals,
  NOTE_COLOR_PALETTE,
  parseBrlCurrencyToCents,
  parseQuantityValue,
  SHOPPING_HIGHLIGHT_PALETTE,
} from "@/lib/domain/agendaNotes";
import { getContrastTextColor, normalizeTextKey } from "@/lib/domain/agendaContacts";
import { formatBRL, todayBR } from "@/lib/domain/money";
import type {
  AgendaChecklistEntry,
  AgendaNote,
  AgendaNoteType,
  ShoppingStoreGroup,
  ShoppingStoreProduct,
} from "@/types/orion";
import { useOrion } from "@/store/orionContext";

function makeUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function NotesShoppingModal({
  open,
  initialNoteId,
  defaultDate,
  onClose,
}: {
  open: boolean;
  initialNoteId?: string | null;
  defaultDate: string;
  onClose: () => void;
}) {
  const { state, upsertAgendaNote, deleteAgendaNote, sendNoteToCalendar, updateAgendaSettings } =
    useOrion();

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Send to Calendar sub-dialog
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calDate, setCalDate] = useState(defaultDate);
  const [calTime, setCalTime] = useState("09:00");
  const [calTitle, setCalTitle] = useState("");
  const [calReminder, setCalReminder] = useState(true);

  // Draft editing state (immediately synced & saved)
  const [draft, setDraft] = useState<AgendaNote | null>(null);
  const [newTaskText, setNewTaskText] = useState("");

  // Per-store quick add product inputs
  const [newStoreName, setNewStoreName] = useState("");
  const [itemInputs, setItemInputs] = useState<
    Record<string, { description: string; qty: string; unit: string; price: string }>
  >({});

  useEffect(() => {
    if (!open) return;
    if (initialNoteId) {
      const found = state.agendaNotes.find((n) => n.id === initialNoteId);
      if (found) {
        setSelectedNoteId(found.id);
        setDraft(structuredClone(found));
        return;
      }
    }
    if (!selectedNoteId && state.agendaNotes.length > 0) {
      setSelectedNoteId(state.agendaNotes[0]!.id);
      setDraft(structuredClone(state.agendaNotes[0]!));
    }
  }, [initialNoteId, open, selectedNoteId, state.agendaNotes]);

  const filteredNotes = useMemo(() => {
    const q = normalizeTextKey(searchText);
    if (!q) return state.agendaNotes;
    return state.agendaNotes.filter(
      (n) =>
        normalizeTextKey(n.title).includes(q) || normalizeTextKey(n.content).includes(q),
    );
  }, [searchText, state.agendaNotes]);

  if (!open) return null;

  async function persistDraft(next: AgendaNote) {
    setDraft(next);
    const id = await upsertAgendaNote(next);
    if (id !== next.id) {
      setDraft({ ...next, id });
      setSelectedNoteId(id);
    }
  }

  async function createNewNote(type: AgendaNoteType) {
    const id = makeUid("note");
    const defaultTitle =
      type === "free"
        ? "Nova nota livre"
        : type === "checklist"
          ? "Nova lista de tarefas"
          : "Nova lista de compras";
    const fresh: AgendaNote = {
      id,
      type,
      title: defaultTitle,
      color: "#ffffff",
      content: "",
      checklistItems: [],
      stores: type === "shopping" ? [{ id: makeUid("store"), name: "Supermercado", items: [] }] : [],
      updatedAtIso: new Date().toISOString(),
    };
    setSelectedNoteId(id);
    setDraft(fresh);
    await upsertAgendaNote(fresh);
  }

  function selectExistingNote(note: AgendaNote) {
    setSelectedNoteId(note.id);
    setDraft(structuredClone(note));
    setConfirmDeleteId(null);
  }

  function handleAddChecklistItem(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !newTaskText.trim()) return;
    const item: AgendaChecklistEntry = {
      id: makeUid("chk"),
      text: newTaskText.trim(),
      done: false,
    };
    const next: AgendaNote = {
      ...draft,
      checklistItems: [...draft.checklistItems, item],
    };
    setNewTaskText("");
    void persistDraft(next);
  }

  function handleToggleChecklistItem(itemId: string) {
    if (!draft) return;
    const next: AgendaNote = {
      ...draft,
      checklistItems: draft.checklistItems.map((it) =>
        it.id === itemId ? { ...it, done: !it.done } : it,
      ),
    };
    void persistDraft(next);
  }

  function handleRemoveChecklistItem(itemId: string) {
    if (!draft) return;
    const next: AgendaNote = {
      ...draft,
      checklistItems: draft.checklistItems.filter((it) => it.id !== itemId),
    };
    void persistDraft(next);
  }

  function handleAddStore(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !newStoreName.trim()) {
      toast.error("Informe o nome da loja.");
      return;
    }
    const store: ShoppingStoreGroup = {
      id: makeUid("store"),
      name: newStoreName.trim(),
      items: [],
    };
    setNewStoreName("");
    void persistDraft({ ...draft, stores: [...draft.stores, store] });
  }

  function handleRemoveStore(storeId: string) {
    if (!draft) return;
    void persistDraft({
      ...draft,
      stores: draft.stores.filter((s) => s.id !== storeId),
    });
  }

  function handleAddProduct(storeId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const inp = itemInputs[storeId] ?? { description: "", qty: "1", unit: "", price: "0,00" };
    if (!inp.description.trim()) {
      toast.error("Informe a descrição do produto.");
      return;
    }
    const qty = parseQuantityValue(inp.qty || "1");
    if (qty <= 0) {
      toast.error("Informe uma quantidade positiva.");
      return;
    }
    const unitPriceCents = parseBrlCurrencyToCents(inp.price || "0");
    const product: ShoppingStoreProduct = {
      id: makeUid("prod"),
      description: inp.description.trim(),
      quantity: qty,
      ...(inp.unit.trim() ? { unit: inp.unit.trim() } : {}),
      unitPriceCents,
      purchased: false,
    };
    setItemInputs((prev) => ({
      ...prev,
      [storeId]: { description: "", qty: "1", unit: "", price: "0,00" },
    }));
    void persistDraft({
      ...draft,
      stores: draft.stores.map((s) =>
        s.id === storeId ? { ...s, items: [...s.items, product] } : s,
      ),
    });
  }

  function handleUpdateProduct(
    storeId: string,
    prodId: string,
    patch: Partial<ShoppingStoreProduct>,
  ) {
    if (!draft) return;
    void persistDraft({
      ...draft,
      stores: draft.stores.map((s) =>
        s.id === storeId
          ? {
              ...s,
              items: s.items.map((it) => (it.id === prodId ? { ...it, ...patch } : it)),
            }
          : s,
      ),
    });
  }

  function handleRemoveProduct(storeId: string, prodId: string) {
    if (!draft) return;
    void persistDraft({
      ...draft,
      stores: draft.stores.map((s) =>
        s.id === storeId ? { ...s, items: s.items.filter((it) => it.id !== prodId) } : s,
      ),
    });
  }

  async function handleConfirmSendToCalendar(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    await upsertAgendaNote(draft);
    await sendNoteToCalendar(draft.id, {
      date: calDate,
      time: calTime,
      title: calTitle.trim() || draft.title,
      reminder: calReminder,
    });
    setCalendarModalOpen(false);
    toast.success("Nota vinculada e enviada para o calendário.");
  }

  const highlighterColor = state.agendaSettings.shoppingHighlightColor || "#fef08a";
  const highlighterText = getContrastTextColor(highlighterColor);
  const shoppingTotals = draft ? computeShoppingNoteTotals(draft.stores) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notes-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e] dark:text-slate-100">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
          <div className="flex items-center gap-2.5">
            <FileText className="size-5 text-[#173d4a] dark:text-[#b99555]" />
            <h2 id="notes-modal-title" className="text-lg font-semibold">
              Bloco de Notas, Tarefas & Compras Multiloja
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void createNewNote("free")}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dce2e6] px-2.5 text-xs font-semibold hover:bg-[#f0f3f5] dark:border-[#2b4761]"
            >
              <Plus className="size-3.5" /> Nota livre
            </button>
            <button
              type="button"
              onClick={() => void createNewNote("checklist")}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dce2e6] px-2.5 text-xs font-semibold hover:bg-[#f0f3f5] dark:border-[#2b4761]"
            >
              <CheckSquare className="size-3.5" /> Tarefas
            </button>
            <button
              type="button"
              onClick={() => void createNewNote("shopping")}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#173d4a] px-2.5 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              <ShoppingCart className="size-3.5" /> Compras
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-8 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5] dark:text-slate-300"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Two-column body */}
        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-3">
          {/* Sidebar notes list */}
          <div className="flex flex-col border-b border-[#dce2e6] bg-[#f7f8fa] md:border-r md:border-b-0 dark:border-[#233c53] dark:bg-[#132537]">
            <div className="border-b border-[#dce2e6] p-3 dark:border-[#233c53]">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#52616a]" />
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Buscar notas..."
                  className="h-8 w-full rounded-lg border border-[#cbd3d8] bg-white pr-2.5 pl-8 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                />
              </div>
            </div>
            <div className="max-h-44 flex-1 space-y-1.5 overflow-y-auto p-3 md:max-h-none">
              {filteredNotes.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#52616a] dark:text-slate-400">
                  Nenhuma nota salva.
                </p>
              ) : (
                filteredNotes.map((note) => {
                  const active = draft?.id === note.id;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => selectExistingNote(note)}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        active
                          ? "border-[#173d4a] bg-white shadow-xs dark:border-[#b99555] dark:bg-[#0e1e2e]"
                          : "border-[#dce2e6] bg-white/70 hover:bg-white dark:border-[#233c53] dark:bg-[#0e1e2e]/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold">{note.title}</span>
                        <span
                          className="size-3 shrink-0 rounded-full border border-[#dce2e6]"
                          style={{ backgroundColor: note.color }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-[#52616a] dark:text-slate-400">
                        {note.type === "free"
                          ? "Nota livre"
                          : note.type === "checklist"
                            ? `Tarefas (${note.checklistItems.filter((i) => i.done).length}/${note.checklistItems.length})`
                            : `Compras (${note.stores.length} loja(s))`}
                        {note.linkedDate ? ` · Agendada ${note.linkedDate.split("-").reverse().join("/")}` : ""}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Active note editor */}
          <div className="flex flex-1 flex-col overflow-y-auto p-5 md:col-span-2">
            {!draft ? (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-xs text-[#52616a] dark:text-slate-400">
                <p>Selecione uma nota ao lado ou crie uma nova acima.</p>
              </div>
            ) : (
              <div
                className="space-y-4 rounded-xl border border-[#dce2e6] p-4 dark:border-[#233c53]"
                style={{
                  backgroundColor:
                    document.documentElement.classList.contains("dark") ? undefined : draft.color,
                }}
              >
                {/* Note Title + Color + Calendar + Delete */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    value={draft.title}
                    onChange={(e) => {
                      const next = { ...draft, title: e.target.value };
                      setDraft(next);
                    }}
                    onBlur={() => void persistDraft(draft)}
                    className="h-9 min-w-44 flex-1 rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm font-semibold text-[#0c1928] dark:border-[#2b4761] dark:bg-[#132537] dark:text-white"
                  />

                  <div className="flex flex-wrap items-center gap-1.5">
                    {NOTE_COLOR_PALETTE.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => void persistDraft({ ...draft, color: col.hex })}
                        title={`Cor da nota: ${col.label}`}
                        className={`size-5 rounded-full border ${
                          draft.color === col.hex ? "scale-110 border-[#0c1928] ring-1 ring-[#173d4a]" : "border-[#cbd3d8]"
                        }`}
                        style={{ backgroundColor: col.hex }}
                      />
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setCalDate(draft.linkedDate || defaultDate);
                        setCalTitle(draft.title);
                        setCalendarModalOpen(true);
                      }}
                      title="Enviar nota para dia escolhido no calendário"
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#173d4a] bg-white px-2.5 text-xs font-semibold text-[#173d4a] hover:bg-[#edf1f3] dark:border-[#b99555] dark:bg-[#132537] dark:text-[#b99555]"
                    >
                      <CalendarPlus className="size-3.5" /> Calendário
                    </button>

                    {confirmDeleteId === draft.id ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteAgendaNote(draft.id);
                          setDraft(null);
                          setSelectedNoteId(null);
                          setConfirmDeleteId(null);
                          toast.success("Nota excluída.");
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#dc2626] px-2.5 text-xs font-semibold text-white"
                      >
                        <Check className="size-3.5" /> Confirmar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(draft.id)}
                        title="Excluir nota"
                        aria-label="Excluir nota"
                        className="grid size-8 place-items-center rounded-lg border border-[#fecaca] bg-white text-[#dc2626] hover:bg-[#fef2f2] dark:border-red-900/50 dark:bg-[#132537]"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Type 1: Free Note */}
                {draft.type === "free" && (
                  <textarea
                    value={draft.content}
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                    onBlur={() => void persistDraft(draft)}
                    rows={10}
                    placeholder="Escreva sua anotação aqui... O conteúdo é salvo automaticamente."
                    className="w-full rounded-lg border border-[#cbd3d8] bg-white p-3 text-sm text-[#0c1928] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-100"
                  />
                )}

                {/* Type 2: Checklist */}
                {draft.type === "checklist" && (
                  <div className="space-y-3">
                    <form onSubmit={handleAddChecklistItem} className="flex gap-2">
                      <input
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        placeholder="Nova tarefa..."
                        className="h-9 flex-1 rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs text-[#0c1928] dark:border-[#2b4761] dark:bg-[#132537] dark:text-white"
                      />
                      <button
                        type="submit"
                        className="h-9 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white"
                      >
                        Adicionar
                      </button>
                    </form>
                    <div className="divide-y divide-[#edf1f3] rounded-lg border border-[#dce2e6] bg-white dark:divide-[#233c53] dark:border-[#233c53] dark:bg-[#0e1e2e]">
                      {draft.checklistItems.length === 0 ? (
                        <p className="py-6 text-center text-xs text-[#52616a]">Lista vazia.</p>
                      ) : (
                        draft.checklistItems.map((it) => (
                          <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                            <label className="flex flex-1 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={it.done}
                                onChange={() => handleToggleChecklistItem(it.id)}
                                className="size-4 accent-[#16a34a]"
                              />
                              <span
                                className={
                                  it.done
                                    ? "text-[#52616a] line-through dark:text-slate-400"
                                    : "text-[#0c1928] dark:text-slate-100"
                                }
                              >
                                {it.text}
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemoveChecklistItem(it.id)}
                              aria-label="Remover item"
                              className="text-[#52616a] hover:text-[#dc2626]"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Type 3: Multi-store Shopping List */}
                {draft.type === "shopping" && shoppingTotals && (
                  <div className="space-y-4">
                    {/* Reactive Totals Summary */}
                    <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#dce2e6] bg-white p-3 text-xs dark:border-[#233c53] dark:bg-[#0e1e2e]">
                      <div>
                        <span className="block text-[#52616a] dark:text-slate-400">Total previsto</span>
                        <strong className="tabular-nums text-base text-[#0c1928] dark:text-white">
                          {formatBRL(shoppingTotals.expectedCents)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[#52616a] dark:text-slate-400">Comprado</span>
                        <strong className="tabular-nums text-base text-[#16a34a] dark:text-emerald-400">
                          {formatBRL(shoppingTotals.purchasedCents)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[#52616a] dark:text-slate-400">Falta comprar</span>
                        <strong className="tabular-nums text-base text-[#b99555]">
                          {formatBRL(shoppingTotals.remainingCents)}
                        </strong>
                      </div>
                    </div>

                    {/* Highlighter color quick selector */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#52616a] dark:text-slate-300">Cor do marca-texto:</span>
                        {SHOPPING_HIGHLIGHT_PALETTE.map((hl) => (
                          <button
                            key={hl.id}
                            type="button"
                            onClick={() => void updateAgendaSettings({ shoppingHighlightColor: hl.hex })}
                            title={hl.label}
                            className={`size-5 rounded border ${
                              highlighterColor === hl.hex ? "scale-110 border-[#0c1928] ring-1 ring-[#173d4a]" : "border-[#cbd3d8]"
                            }`}
                            style={{ backgroundColor: hl.hex }}
                          />
                        ))}
                      </div>

                      <form onSubmit={handleAddStore} className="flex gap-1.5">
                        <input
                          value={newStoreName}
                          onChange={(e) => setNewStoreName(e.target.value)}
                          placeholder="Nome da nova loja"
                          className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                        />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#173d4a] px-2.5 text-xs font-semibold text-white"
                        >
                          <Plus className="size-3.5" /> + Nova loja
                        </button>
                      </form>
                    </div>

                    {/* Store Groups */}
                    {draft.stores.map((store) => {
                      const sub = computeStoreTotals(store);
                      const inp = itemInputs[store.id] ?? {
                        description: "",
                        qty: "1",
                        unit: "",
                        price: "0,00",
                      };
                      return (
                        <div
                          key={store.id}
                          className="rounded-xl border border-[#dce2e6] bg-white p-3 dark:border-[#233c53] dark:bg-[#0e1e2e]"
                        >
                          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#edf1f3] pb-2 dark:border-[#233c53]">
                            <div className="flex items-center gap-2 font-semibold text-sm">
                              <Store className="size-4 text-[#173d4a] dark:text-[#b99555]" />
                              <input
                                value={store.name}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    stores: draft.stores.map((s) =>
                                      s.id === store.id ? { ...s, name: e.target.value } : s,
                                    ),
                                  })
                                }
                                onBlur={() => void persistDraft(draft)}
                                className="rounded border border-transparent px-1 font-semibold hover:border-[#cbd3d8] focus:border-[#173d4a] dark:bg-transparent"
                              />
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="tabular-nums text-[#52616a] dark:text-slate-300">
                                Subtotal: <strong>{formatBRL(sub.expectedCents)}</strong> (Comprado:{" "}
                                <strong>{formatBRL(sub.purchasedCents)}</strong>)
                              </span>
                              {draft.stores.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveStore(store.id)}
                                  title="Remover loja"
                                  className="text-[#dc2626] hover:underline"
                                >
                                  Excluir loja
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Items table */}
                          {store.items.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="border-b border-[#edf1f3] text-[#52616a] dark:border-[#233c53] dark:text-slate-400">
                                  <tr>
                                    <th className="py-1.5 pr-2">Comprado</th>
                                    <th className="py-1.5 pr-2">Produto</th>
                                    <th className="py-1.5 pr-2 text-right">Qtde.</th>
                                    <th className="py-1.5 pr-2 text-right">Unitário</th>
                                    <th className="py-1.5 pr-2 text-right">Subtotal</th>
                                    <th className="py-1.5" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#edf1f3] dark:divide-[#233c53]">
                                  {store.items.map((item) => {
                                    const lineCents = computeItemTotalCents(
                                      item.quantity,
                                      item.unitPriceCents,
                                    );
                                    return (
                                      <tr
                                        key={item.id}
                                        style={
                                          item.purchased
                                            ? {
                                                backgroundColor: highlighterColor,
                                                color: highlighterText,
                                              }
                                            : undefined
                                        }
                                      >
                                        <td className="py-1.5 pr-2">
                                          <input
                                            type="checkbox"
                                            checked={item.purchased}
                                            onChange={(e) =>
                                              handleUpdateProduct(store.id, item.id, {
                                                purchased: e.target.checked,
                                              })
                                            }
                                            aria-label={`Marcar ${item.description} como comprado`}
                                            className="size-4 accent-[#16a34a]"
                                          />
                                        </td>
                                        <td className="py-1.5 pr-2 font-medium">
                                          {item.description}
                                          {item.unit ? ` (${item.unit})` : ""}
                                        </td>
                                        <td className="tabular-nums py-1.5 pr-2 text-right">
                                          <input
                                            type="number"
                                            step="any"
                                            min="0.001"
                                            value={item.quantity}
                                            onChange={(e) => {
                                              const val = Number(e.target.value);
                                              if (val > 0)
                                                handleUpdateProduct(store.id, item.id, {
                                                  quantity: val,
                                                });
                                            }}
                                            aria-label={`Quantidade de ${item.description}`}
                                            className="tabular-nums h-7 w-16 rounded border border-[#cbd3d8] bg-white/90 px-1.5 text-right text-[#0c1928]"
                                          />
                                        </td>
                                        <td className="tabular-nums py-1.5 pr-2 text-right">
                                          <input
                                            defaultValue={(item.unitPriceCents / 100)
                                              .toFixed(2)
                                              .replace(".", ",")}
                                            onBlur={(e) =>
                                              handleUpdateProduct(store.id, item.id, {
                                                unitPriceCents: parseBrlCurrencyToCents(e.target.value),
                                              })
                                            }
                                            aria-label={`Valor unitário de ${item.description}`}
                                            className="tabular-nums h-7 w-20 rounded border border-[#cbd3d8] bg-white/90 px-1.5 text-right text-[#0c1928]"
                                          />
                                        </td>
                                        <td className="tabular-nums py-1.5 pr-2 text-right font-semibold">
                                          {formatBRL(lineCents)}
                                        </td>
                                        <td className="py-1.5 text-right">
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveProduct(store.id, item.id)}
                                            aria-label={`Remover ${item.description}`}
                                            className="text-[#dc2626] hover:opacity-80"
                                          >
                                            <Trash2 className="size-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Quick-add product row */}
                          <form
                            onSubmit={(e) => handleAddProduct(store.id, e)}
                            className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-6"
                          >
                            <input
                              value={inp.description}
                              onChange={(e) =>
                                setItemInputs((p) => ({
                                  ...p,
                                  [store.id]: { ...inp, description: e.target.value },
                                }))
                              }
                              placeholder="Produto"
                              className="h-8 rounded border border-[#cbd3d8] bg-white px-2 text-xs sm:col-span-2 dark:border-[#2b4761] dark:bg-[#132537]"
                            />
                            <input
                              value={inp.qty}
                              onChange={(e) =>
                                setItemInputs((p) => ({
                                  ...p,
                                  [store.id]: { ...inp, qty: e.target.value },
                                }))
                              }
                              placeholder="Qtde"
                              className="tabular-nums h-8 rounded border border-[#cbd3d8] bg-white px-2 text-xs dark:border-[#2b4761] dark:bg-[#132537]"
                            />
                            <input
                              value={inp.unit}
                              onChange={(e) =>
                                setItemInputs((p) => ({
                                  ...p,
                                  [store.id]: { ...inp, unit: e.target.value },
                                }))
                              }
                              placeholder="Un (kg, un)"
                              className="h-8 rounded border border-[#cbd3d8] bg-white px-2 text-xs dark:border-[#2b4761] dark:bg-[#132537]"
                            />
                            <input
                              value={inp.price}
                              onChange={(e) =>
                                setItemInputs((p) => ({
                                  ...p,
                                  [store.id]: { ...inp, price: e.target.value },
                                }))
                              }
                              placeholder="R$ unit."
                              className="tabular-nums h-8 rounded border border-[#cbd3d8] bg-white px-2 text-xs dark:border-[#2b4761] dark:bg-[#132537]"
                            />
                            <button
                              type="submit"
                              className="h-8 rounded bg-[#173d4a] px-2.5 text-xs font-semibold text-white hover:bg-[#0c1928]"
                            >
                              + Item
                            </button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Send Note to Calendar Sub-modal */}
      {calendarModalOpen && draft && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-note-cal-title"
          className="fixed inset-0 z-[65] flex items-center justify-center bg-[#0c1928]/65 p-4"
        >
          <form
            onSubmit={(e) => void handleConfirmSendToCalendar(e)}
            className="w-full max-w-md space-y-3 rounded-xl border border-[#dce2e6] bg-white p-5 shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e]"
          >
            <div className="flex items-center justify-between">
              <h3 id="send-note-cal-title" className="text-base font-semibold">
                Enviar nota para o calendário
              </h3>
              <button
                type="button"
                onClick={() => setCalendarModalOpen(false)}
                className="grid size-7 place-items-center rounded text-[#52616a]"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-[#52616a] dark:text-slate-300">
              Cria ou atualiza um único evento vinculado a esta nota (sem duplicação ao reenviar).
            </p>
            <label className="block text-xs">
              <span className="mb-1 block font-medium">Título no calendário</span>
              <input
                value={calTitle}
                onChange={(e) => setCalTitle(e.target.value)}
                required
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
              />
            </label>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="block">
                <span className="mb-1 block font-medium">Dia *</span>
                <input
                  type="date"
                  value={calDate}
                  onChange={(e) => setCalDate(e.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Horário</span>
                <input
                  type="time"
                  value={calTime}
                  onChange={(e) => setCalTime(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={calReminder}
                onChange={(e) => setCalReminder(e.target.checked)}
                className="size-4 accent-[#173d4a]"
              />
              Ativar lembrete antecipado na Agenda
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCalendarModalOpen(false)}
                className="h-9 rounded-lg border border-[#dce2e6] px-3 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
              >
                Vincular ao dia
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
