import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Cake,
  Check,
  Edit3,
  FolderCog,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  CONTACT_COLOR_PALETTE,
  findDuplicateContacts,
  isValidEmail,
  mergeContactCategories,
  mergeContactSubcategories,
  normalizeTextKey,
  splitContactsForTabs,
} from "@/lib/domain/agendaContacts";
import type { AgendaContact, ContactCategory, ContactPhone, ContactSubcategory } from "@/types/orion";
import { useOrion } from "@/store/orionContext";
import { todayBR } from "@/lib/domain/money";

type DirectoryTab = "contacts" | "commercial" | "birthdays";

export function ContactsDirectoryModal({
  open,
  initialContactId,
  onClose,
}: {
  open: boolean;
  initialContactId?: string | null;
  onClose: () => void;
}) {
  const {
    state,
    upsertAgendaContact,
    deleteAgendaContact,
    upsertContactCategory,
    deleteContactCategoryWithRemap,
    upsertContactSubcategory,
    deleteContactSubcategory,
    updateAgendaSettings,
  } = useOrion();

  const today = todayBR();
  const categories = useMemo(
    () =>
      mergeContactCategories(
        state.contactCategories,
        state.agendaSettings.hiddenDefaultCategoryIds ?? [],
      ),
    [state.agendaSettings.hiddenDefaultCategoryIds, state.contactCategories],
  );
  const subcategories = useMemo(
    () =>
      mergeContactSubcategories(
        state.contactSubcategories,
        state.agendaSettings.hiddenDefaultSubcategoryIds ?? [],
      ),
    [state.agendaSettings.hiddenDefaultSubcategoryIds, state.contactSubcategories],
  );

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const subMap = useMemo(() => new Map(subcategories.map((s) => [s.id, s])), [subcategories]);

  const split = useMemo(
    () =>
      splitContactsForTabs(
        state.agendaContacts,
        categories,
        subcategories,
        today,
        state.agendaSettings.leapYearBirthdayRule,
      ),
    [categories, state.agendaContacts, state.agendaSettings.leapYearBirthdayRule, subcategories, today],
  );

  const [tab, setTab] = useState<DirectoryTab>("contacts");
  const [searchText, setSearchText] = useState("");
  const [filterCatId, setFilterCatId] = useState<string>("");
  const [birthdaySort, setBirthdaySort] = useState<"upcoming" | "calendar">("upcoming");

  // Sub-modals inside directory
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [confirmDeleteContactId, setConfirmDeleteContactId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);

  // Contact form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [phones, setPhones] = useState<ContactPhone[]>([{ label: "Celular", number: "", isWhatsApp: true }]);
  const [emails, setEmails] = useState<string[]>([""]);
  const [categoryId, setCategoryId] = useState<string>("cat-familia");
  const [subcategoryId, setSubcategoryId] = useState<string>("");
  const [categoryColor, setCategoryColor] = useState<string>("#173d4a");
  const [subcategoryColor, setSubcategoryColor] = useState<string>("#b99555");
  const [relationship, setRelationship] = useState("");
  const [company, setCompany] = useState("");
  const [profession, setProfession] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [bdayReminderEnabled, setBdayReminderEnabled] = useState(true);
  const [bdayReminderDays, setBdayReminderDays] = useState(1);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [duplicateAck, setDuplicateAck] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline +Novo Category / Subcategory quick creators
  const [inlineNewCatOpen, setInlineNewCatOpen] = useState(false);
  const [inlineNewCatName, setInlineNewCatName] = useState("");
  const [inlineNewCatColor, setInlineNewCatColor] = useState("#173d4a");
  const [inlineNewCatCommercial, setInlineNewCatCommercial] = useState(false);

  const [inlineNewSubOpen, setInlineNewSubOpen] = useState(false);
  const [inlineNewSubName, setInlineNewSubName] = useState("");
  const [inlineNewSubColor, setInlineNewSubColor] = useState("#b99555");

  // Category Manager state
  const [editingCat, setEditingCat] = useState<ContactCategory | null>(null);
  const [editingSub, setEditingSub] = useState<ContactSubcategory | null>(null);
  const [remapSourceCat, setRemapSourceCat] = useState<ContactCategory | null>(null);
  const [remapTargetCatId, setRemapTargetCatId] = useState<string>("");

  useEffect(() => {
    if (open && initialContactId) {
      setDetailContactId(initialContactId);
    }
  }, [initialContactId, open]);

  useEffect(() => {
    if (!open) {
      setDetailContactId(null);
      setFormOpen(false);
      setCatManagerOpen(false);
      setConfirmDeleteContactId(null);
    }
  }, [open]);

  const detailContact = useMemo(
    () => state.agendaContacts.find((c) => c.id === detailContactId) ?? null,
    [detailContactId, state.agendaContacts],
  );

  const availableSubcategories = useMemo(
    () => subcategories.filter((s) => s.categoryId === categoryId),
    [categoryId, subcategories],
  );

  const duplicates = useMemo(() => {
    if (!formOpen || !name.trim()) return [];
    return findDuplicateContacts(state.agendaContacts, {
      id: editingId ?? undefined,
      name,
      phones,
    });
  }, [editingId, formOpen, name, phones, state.agendaContacts]);

  const qNorm = normalizeTextKey(searchText);

  const visiblePersonal = useMemo(
    () =>
      split.personal.filter((c) => {
        if (filterCatId && c.categoryId !== filterCatId) return false;
        if (!qNorm) return true;
        const catName = catMap.get(c.categoryId)?.name ?? "";
        return (
          normalizeTextKey(c.name).includes(qNorm) || normalizeTextKey(catName).includes(qNorm)
        );
      }),
    [catMap, filterCatId, qNorm, split.personal],
  );

  const visibleCommercial = useMemo(
    () =>
      split.commercial.filter((c) => {
        if (filterCatId && c.categoryId !== filterCatId) return false;
        if (!qNorm) return true;
        const subName = c.subcategoryId ? subMap.get(c.subcategoryId)?.name ?? "" : "";
        return (
          normalizeTextKey(c.name).includes(qNorm) ||
          normalizeTextKey(c.company || "").includes(qNorm) ||
          normalizeTextKey(subName).includes(qNorm)
        );
      }),
    [filterCatId, qNorm, split.commercial, subMap],
  );

  const visibleBirthdays = useMemo(() => {
    const filtered = split.birthdays.filter((row) => {
      if (filterCatId && row.contact.categoryId !== filterCatId) return false;
      if (!qNorm) return true;
      return (
        normalizeTextKey(row.contact.name).includes(qNorm) ||
        normalizeTextKey(row.categoryName).includes(qNorm) ||
        normalizeTextKey(row.subcategoryName).includes(qNorm)
      );
    });
    return [...filtered].sort((a, b) =>
      birthdaySort === "upcoming"
        ? a.nextOccurrenceDate.localeCompare(b.nextOccurrenceDate) ||
          a.contact.name.localeCompare(b.contact.name, "pt-BR")
        : a.sortMonthDay.localeCompare(b.sortMonthDay) ||
          a.contact.name.localeCompare(b.contact.name, "pt-BR"),
    );
  }, [birthdaySort, filterCatId, qNorm, split.birthdays]);

  if (!open) return null;

  function openNewContactForm(defaultCommercial = tab === "commercial") {
    const defaultCat =
      categories.find((c) => c.isCommercial === defaultCommercial) ?? categories[0];
    setEditingId(null);
    setName("");
    setNickname("");
    setBirthDay("");
    setBirthMonth("");
    setBirthYear("");
    setPhones([{ label: "Celular", number: "", isWhatsApp: true }]);
    setEmails([""]);
    setCategoryId(defaultCat?.id ?? "cat-familia");
    setSubcategoryId("");
    setCategoryColor(defaultCat?.color ?? "#173d4a");
    setSubcategoryColor("#b99555");
    setRelationship("");
    setCompany("");
    setProfession("");
    setAddress("");
    setCity("");
    setStateUf("");
    setWebsite("");
    setNotes("");
    setBdayReminderEnabled(true);
    setBdayReminderDays(1);
    setNotificationsEnabled(true);
    setDuplicateAck(false);
    setInlineNewCatOpen(false);
    setInlineNewSubOpen(false);
    setFormOpen(true);
  }

  function openEditContactForm(contact: AgendaContact) {
    const cat = catMap.get(contact.categoryId);
    const sub = contact.subcategoryId ? subMap.get(contact.subcategoryId) : undefined;
    setEditingId(contact.id);
    setName(contact.name);
    setNickname(contact.nickname || "");
    setBirthDay(contact.birthDay ? String(contact.birthDay) : "");
    setBirthMonth(contact.birthMonth ? String(contact.birthMonth) : "");
    setBirthYear(contact.birthYear ? String(contact.birthYear) : "");
    setPhones(
      contact.phones.length > 0
        ? contact.phones
        : [{ label: "Celular", number: "", isWhatsApp: true }],
    );
    setEmails(contact.emails.length > 0 ? contact.emails : [""]);
    setCategoryId(contact.categoryId);
    setSubcategoryId(contact.subcategoryId || "");
    setCategoryColor(contact.categoryColor || cat?.color || "#173d4a");
    setSubcategoryColor(contact.subcategoryColor || sub?.color || "#b99555");
    setRelationship(contact.relationship || "");
    setCompany(contact.company || "");
    setProfession(contact.profession || "");
    setAddress(contact.address || "");
    setCity(contact.city || "");
    setStateUf(contact.state || "");
    setWebsite(contact.website || "");
    setNotes(contact.notes || "");
    setBdayReminderEnabled(contact.birthdayReminderEnabled);
    setBdayReminderDays(contact.birthdayReminderDaysBefore);
    setNotificationsEnabled(contact.notificationsEnabled);
    setDuplicateAck(false);
    setDetailContactId(null);
    setFormOpen(true);
  }

  async function handleSaveInlineCategory() {
    if (!inlineNewCatName.trim()) {
      toast.error("Informe o nome da categoria.");
      return;
    }
    const newId = await upsertContactCategory({
      name: inlineNewCatName.trim(),
      color: inlineNewCatColor,
      isCommercial: inlineNewCatCommercial,
      order: categories.length + 1,
    });
    setCategoryId(newId);
    setCategoryColor(inlineNewCatColor);
    setSubcategoryId("");
    setInlineNewCatName("");
    setInlineNewCatOpen(false);
    toast.success("Categoria criada e selecionada.");
  }

  async function handleSaveInlineSubcategory() {
    if (!inlineNewSubName.trim()) {
      toast.error("Informe o nome da subcategoria.");
      return;
    }
    const newId = await upsertContactSubcategory({
      categoryId,
      name: inlineNewSubName.trim(),
      color: inlineNewSubColor,
      order: availableSubcategories.length + 1,
    });
    setSubcategoryId(newId);
    setSubcategoryColor(inlineNewSubColor);
    setInlineNewSubName("");
    setInlineNewSubOpen(false);
    toast.success("Subcategoria criada e selecionada.");
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome completo é obrigatório.");
      return;
    }
    if (!categoryId) {
      toast.error("Selecione uma categoria.");
      return;
    }

    const cleanPhones = phones
      .map((p) => ({ ...p, number: p.number.trim(), label: p.label.trim() || "Telefone" }))
      .filter((p) => p.number.length > 0);
    const cleanEmails = emails.map((em) => em.trim()).filter(Boolean);
    for (const em of cleanEmails) {
      if (!isValidEmail(em)) {
        toast.error(`E-mail inválido: ${em}`);
        return;
      }
    }

    const bDayNum = birthDay ? Number(birthDay) : null;
    const bMonthNum = birthMonth ? Number(birthMonth) : null;
    const bYearNum = birthYear ? Number(birthYear) : null;
    if ((bDayNum && !bMonthNum) || (!bDayNum && bMonthNum)) {
      toast.error("Informe dia e mês para o aniversário (o ano é opcional).");
      return;
    }
    if (bDayNum && (bDayNum < 1 || bDayNum > 31)) {
      toast.error("Dia de nascimento inválido.");
      return;
    }
    if (bMonthNum && (bMonthNum < 1 || bMonthNum > 12)) {
      toast.error("Mês de nascimento inválido.");
      return;
    }
    if (bYearNum && (bYearNum < 1900 || bYearNum > 2100)) {
      toast.error("Ano de nascimento inválido.");
      return;
    }

    if (duplicates.length > 0 && !duplicateAck) {
      toast.warning("Há contato semelhante já cadastrado. Clique em 'Salvar mesmo assim' se for pessoa distinta.");
      setDuplicateAck(true);
      return;
    }

    setSaving(true);
    try {
      await upsertAgendaContact({
        ...(editingId ? { id: editingId } : {}),
        name: name.trim(),
        ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
        birthDay: bDayNum,
        birthMonth: bMonthNum,
        birthYear: bYearNum,
        phones: cleanPhones,
        emails: cleanEmails,
        categoryId,
        ...(subcategoryId ? { subcategoryId } : {}),
        categoryColor,
        ...(subcategoryId ? { subcategoryColor } : {}),
        ...(relationship.trim() ? { relationship: relationship.trim() } : {}),
        ...(company.trim() ? { company: company.trim() } : {}),
        ...(profession.trim() ? { profession: profession.trim() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(stateUf.trim() ? { state: stateUf.trim().toUpperCase() } : {}),
        ...(website.trim() ? { website: website.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        birthdayReminderEnabled: bdayReminderEnabled,
        birthdayReminderDaysBefore: Math.max(0, Math.min(30, bdayReminderDays)),
        notificationsEnabled,
      });
      toast.success(editingId ? "Contato atualizado." : "Contato cadastrado com sucesso.");
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contacts-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e] dark:text-slate-100">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
          <div className="flex items-center gap-2.5">
            <Users className="size-5 text-[#173d4a] dark:text-[#b99555]" />
            <h2 id="contacts-modal-title" className="text-lg font-semibold">
              Diretório de Contatos
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openNewContactForm(tab === "commercial")}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              <Plus className="size-3.5" /> + Novo
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("contacts");
                setFilterCatId("");
              }}
              className={`h-8 rounded-lg border px-3 text-xs font-semibold ${
                tab === "contacts"
                  ? "border-[#173d4a] bg-[#edf1f3] text-[#173d4a] dark:border-[#b99555] dark:bg-[#152b3f] dark:text-[#b99555]"
                  : "border-[#dce2e6] text-[#52616a] dark:border-[#233c53] dark:text-slate-300"
              }`}
            >
              Contatos ({split.personal.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("commercial");
                setFilterCatId("");
              }}
              className={`h-8 rounded-lg border px-3 text-xs font-semibold ${
                tab === "commercial"
                  ? "border-[#173d4a] bg-[#edf1f3] text-[#173d4a] dark:border-[#b99555] dark:bg-[#152b3f] dark:text-[#b99555]"
                  : "border-[#dce2e6] text-[#52616a] dark:border-[#233c53] dark:text-slate-300"
              }`}
            >
              Comercial ({split.commercial.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("birthdays");
                setFilterCatId("");
              }}
              className={`h-8 rounded-lg border px-3 text-xs font-semibold ${
                tab === "birthdays"
                  ? "border-[#173d4a] bg-[#edf1f3] text-[#173d4a] dark:border-[#b99555] dark:bg-[#152b3f] dark:text-[#b99555]"
                  : "border-[#dce2e6] text-[#52616a] dark:border-[#233c53] dark:text-slate-300"
              }`}
            >
              Aniversários ({split.birthdays.length})
            </button>
            <button
              type="button"
              onClick={() => setCatManagerOpen(true)}
              title="Gerenciar categorias e subcategorias"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dce2e6] px-2.5 text-xs font-semibold text-[#52616a] hover:bg-[#f0f3f5] dark:border-[#233c53] dark:text-slate-300 dark:hover:bg-[#152b3f]"
            >
              <FolderCog className="size-3.5" /> Categorias
            </button>
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
        </div>

        {/* Local search & filters inside Directory */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#edf1f3] bg-[#f7f8fa] px-5 py-2.5 dark:border-[#233c53] dark:bg-[#132537]">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#52616a]" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Filtrar contatos desta lista..."
              className="h-8 w-full rounded-lg border border-[#cbd3d8] bg-white pr-3 pl-8 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
            />
          </div>
          <select
            value={filterCatId}
            onChange={(e) => setFilterCatId(e.target.value)}
            aria-label="Filtrar por categoria"
            className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
          >
            <option value="">Todas as categorias</option>
            {categories
              .filter((c) =>
                tab === "contacts"
                  ? !c.isCommercial
                  : tab === "commercial"
                    ? c.isCommercial
                    : true,
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>

          {tab === "birthdays" && (
            <>
              <select
                value={birthdaySort}
                onChange={(e) => setBirthdaySort(e.target.value as "upcoming" | "calendar")}
                aria-label="Ordenar aniversários"
                className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
              >
                <option value="upcoming">Mais próximo primeiro</option>
                <option value="calendar">Ordem de mês/dia (Jan–Dez)</option>
              </select>
              <select
                value={state.agendaSettings.leapYearBirthdayRule}
                onChange={(e) =>
                  void updateAgendaSettings({
                    leapYearBirthdayRule: e.target.value as "feb28" | "mar01",
                  })
                }
                aria-label="Regra para 29/02 em ano não bissexto"
                title="Regra para aniversários de 29/02 em anos não bissextos"
                className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
              >
                <option value="feb28">29/02 → 28/02 (não bissexto)</option>
                <option value="mar01">29/02 → 01/03 (não bissexto)</option>
              </select>
            </>
          )}
        </div>

        {/* Main List Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "contacts" && (
            <div className="divide-y divide-[#edf1f3] rounded-xl border border-[#dce2e6] dark:divide-[#233c53] dark:border-[#233c53]">
              {visiblePersonal.length === 0 ? (
                <p className="py-10 text-center text-xs text-[#52616a] dark:text-slate-400">
                  Nenhum contato pessoal cadastrado. Clique em <strong>+ Novo</strong> para adicionar.
                </p>
              ) : (
                visiblePersonal.map((contact) => {
                  const cat = catMap.get(contact.categoryId);
                  const dotColor = contact.categoryColor || cat?.color || "#173d4a";
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setDetailContactId(contact.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[#f7f8fa] dark:hover:bg-[#132537]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5 font-semibold text-[#0c1928] dark:text-white">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="truncate">{contact.name}</span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-[#52616a] dark:text-slate-300">
                        {cat?.name ?? "Sem categoria"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {tab === "commercial" && (
            <div className="divide-y divide-[#edf1f3] rounded-xl border border-[#dce2e6] dark:divide-[#233c53] dark:border-[#233c53]">
              {visibleCommercial.length === 0 ? (
                <p className="py-10 text-center text-xs text-[#52616a] dark:text-slate-400">
                  Nenhum contato comercial cadastrado ainda.
                </p>
              ) : (
                visibleCommercial.map((contact) => {
                  const cat = catMap.get(contact.categoryId);
                  const sub = contact.subcategoryId ? subMap.get(contact.subcategoryId) : undefined;
                  const dotColor = contact.categoryColor || cat?.color || "#b99555";
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setDetailContactId(contact.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[#f7f8fa] dark:hover:bg-[#132537]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5 font-semibold text-[#0c1928] dark:text-white">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="truncate">{contact.name}</span>
                        {sub && (
                          <span className="hidden text-xs font-normal text-[#52616a] dark:text-slate-400 sm:inline">
                            · {sub.name}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-[#52616a] dark:text-slate-300">
                        {cat?.name ?? "Comércio"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {tab === "birthdays" && (
            <div className="overflow-x-auto rounded-xl border border-[#dce2e6] dark:border-[#233c53]">
              {visibleBirthdays.length === 0 ? (
                <p className="py-10 text-center text-xs text-[#52616a] dark:text-slate-400">
                  Nenhum contato com data de nascimento cadastrada.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#dce2e6] bg-[#f7f8fa] text-[#52616a] dark:border-[#233c53] dark:bg-[#132537] dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Nome</th>
                      <th className="px-4 py-2.5 font-semibold">Nascimento</th>
                      <th className="px-4 py-2.5 font-semibold">Idade</th>
                      <th className="px-4 py-2.5 font-semibold">Categoria</th>
                      <th className="px-4 py-2.5 font-semibold">Subcategoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f3] dark:divide-[#233c53]">
                    {visibleBirthdays.map((row) => (
                      <tr
                        key={row.contact.id}
                        className="hover:bg-[#f7f8fa] dark:hover:bg-[#132537]"
                      >
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => setDetailContactId(row.contact.id)}
                            className="inline-flex items-center gap-2 font-semibold text-[#0c1928] hover:underline dark:text-white"
                          >
                            <Cake className="size-3.5 text-[#b99555]" />
                            {row.contact.name}
                          </button>
                        </td>
                        <td className="tabular-nums px-4 py-2.5">{row.birthDisplay}</td>
                        <td className="tabular-nums px-4 py-2.5 text-[#52616a] dark:text-slate-300">
                          {row.nextAge !== null ? `${row.nextAge} ano(s)` : "Não informada"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: row.categoryColor }}
                            />
                            {row.categoryName}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            {row.subcategoryName !== "—" && (
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: row.subcategoryColor }}
                              />
                            )}
                            {row.subcategoryName}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contact Detail Popup */}
      {detailContact && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-detail-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0c1928]/60 p-4"
        >
          <div className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e]">
            <div className="flex items-start justify-between gap-3 border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
              <div>
                <h3 id="contact-detail-title" className="text-lg font-semibold">
                  {detailContact.name}
                </h3>
                {detailContact.nickname && (
                  <p className="text-xs text-[#52616a] dark:text-slate-400">
                    Apelido: {detailContact.nickname}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditContactForm(detailContact)}
                  title="Editar contato"
                  aria-label="Editar contato"
                  className="grid size-8 place-items-center rounded-lg border border-[#dce2e6] text-[#52616a] hover:bg-[#f0f3f5] dark:border-[#2b4761] dark:text-slate-200"
                >
                  <Edit3 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteContactId(detailContact.id)}
                  title="Excluir contato"
                  aria-label="Excluir contato"
                  className="grid size-8 place-items-center rounded-lg border border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2] dark:border-red-900/50 dark:text-red-300"
                >
                  <Trash2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailContactId(null);
                    setConfirmDeleteContactId(null);
                  }}
                  title="Fechar ficha"
                  aria-label="Fechar ficha"
                  className="grid size-8 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5] dark:text-slate-300"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5 text-xs">
              {confirmDeleteContactId === detailContact.id && (
                <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3 text-[#991b1b] dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  <p className="font-semibold">Confirmar exclusão de {detailContact.name}?</p>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteContactId(null)}
                      className="h-7 rounded border border-[#dce2e6] bg-white px-2.5 font-semibold text-[#0c1928]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteAgendaContact(detailContact.id);
                        setDetailContactId(null);
                        setConfirmDeleteContactId(null);
                        toast.success("Contato excluído.");
                      }}
                      className="h-7 rounded bg-[#dc2626] px-2.5 font-semibold text-white"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#dce2e6] bg-[#f7f8fa] p-3 dark:border-[#233c53] dark:bg-[#132537]">
                <div>
                  <span className="block text-[#52616a] dark:text-slate-400">Categoria</span>
                  <span className="mt-0.5 inline-flex items-center gap-1.5 font-semibold">
                    <span
                      className="size-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          detailContact.categoryColor ||
                          catMap.get(detailContact.categoryId)?.color ||
                          "#173d4a",
                      }}
                    />
                    {catMap.get(detailContact.categoryId)?.name ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-[#52616a] dark:text-slate-400">Subcategoria</span>
                  <span className="mt-0.5 inline-flex items-center gap-1.5 font-semibold">
                    {detailContact.subcategoryId ? (
                      <>
                        <span
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              detailContact.subcategoryColor ||
                              subMap.get(detailContact.subcategoryId)?.color ||
                              "#b99555",
                          }}
                        />
                        {subMap.get(detailContact.subcategoryId)?.name ?? "—"}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                {detailContact.birthDay && detailContact.birthMonth && (
                  <div className="col-span-2">
                    <span className="block text-[#52616a] dark:text-slate-400">Nascimento</span>
                    <span className="tabular-nums font-semibold">
                      {String(detailContact.birthDay).padStart(2, "0")}/
                      {String(detailContact.birthMonth).padStart(2, "0")}
                      {detailContact.birthYear ? `/${detailContact.birthYear}` : " (ano não informado)"}
                    </span>
                  </div>
                )}
              </div>

              {detailContact.phones.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold text-[#52616a] dark:text-slate-300">Telefones</div>
                  {detailContact.phones.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Phone className="size-3.5 text-[#173d4a] dark:text-[#b99555]" />
                      <span className="tabular-nums font-semibold">{p.number}</span>
                      <span className="text-[#52616a] dark:text-slate-400">({p.label})</span>
                      {p.isWhatsApp && (
                        <span className="inline-flex items-center gap-0.5 text-[#16a34a]">
                          <MessageCircle className="size-3" /> WhatsApp
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {detailContact.emails.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold text-[#52616a] dark:text-slate-300">E-mails</div>
                  {detailContact.emails.map((em, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Mail className="size-3.5 text-[#173d4a] dark:text-[#b99555]" />
                      <span>{em}</span>
                    </div>
                  ))}
                </div>
              )}

              {(detailContact.company || detailContact.profession || detailContact.relationship) && (
                <div className="space-y-1 rounded-lg border border-[#edf1f3] p-3 dark:border-[#233c53]">
                  {detailContact.company && (
                    <div className="flex items-center gap-2">
                      <Building2 className="size-3.5 text-[#b99555]" />
                      <span>
                        <strong>Empresa:</strong> {detailContact.company}
                      </span>
                    </div>
                  )}
                  {detailContact.profession && (
                    <div>
                      <strong>Profissão / Serviço:</strong> {detailContact.profession}
                    </div>
                  )}
                  {detailContact.relationship && (
                    <div>
                      <strong>Relação / Vínculo:</strong> {detailContact.relationship}
                    </div>
                  )}
                </div>
              )}

              {(detailContact.address || detailContact.city || detailContact.website) && (
                <div className="space-y-1 text-[#52616a] dark:text-slate-300">
                  {detailContact.address && (
                    <div>
                      <strong>Endereço:</strong> {detailContact.address}
                    </div>
                  )}
                  {(detailContact.city || detailContact.state) && (
                    <div>
                      <strong>Cidade/UF:</strong> {[detailContact.city, detailContact.state].filter(Boolean).join(" / ")}
                    </div>
                  )}
                  {detailContact.website && (
                    <div>
                      <strong>Site:</strong> {detailContact.website}
                    </div>
                  )}
                </div>
              )}

              {detailContact.notes && (
                <div className="rounded-lg border border-[#edf1f3] bg-[#faf7f0] p-3 whitespace-pre-line dark:border-[#233c53] dark:bg-[#132537]">
                  <strong className="block mb-1">Observações</strong>
                  {detailContact.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Contact Modal */}
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-form-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0c1928]/65 p-4"
        >
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e]">
            <div className="flex items-center justify-between border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
              <h3 id="contact-form-title" className="text-lg font-semibold">
                {editingId ? "Editar contato" : "Novo contato"}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Fechar"
                className="grid size-8 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5]"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveContact(e)} className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
              {duplicates.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3 text-[#92400e] dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Possível duplicidade detectada com: {duplicates.map((d) => d.name).join(", ")}
                    </p>
                    <p className="mt-0.5">
                      Se forem pessoas diferentes com o mesmo nome, você pode prosseguir normalmente.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-medium text-[#52616a] dark:text-slate-300">
                    Nome completo *
                  </span>
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setDuplicateAck(false);
                    }}
                    required
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-[#52616a] dark:text-slate-300">
                    Apelido / Nome social
                  </span>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                  />
                </label>
              </div>

              {/* Category + Subcategory with inline +Novo */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#52616a] dark:text-slate-300">
                      Categoria *
                    </span>
                    <button
                      type="button"
                      onClick={() => setInlineNewCatOpen((v) => !v)}
                      className="font-semibold text-[#173d4a] hover:underline dark:text-[#b99555]"
                    >
                      + Novo
                    </button>
                  </div>
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setCategoryId(nextId);
                      setSubcategoryId("");
                      const found = catMap.get(nextId);
                      if (found) setCategoryColor(found.color);
                    }}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.isCommercial ? "(Comercial)" : ""}
                      </option>
                    ))}
                  </select>

                  {inlineNewCatOpen && (
                    <div className="space-y-2 rounded-lg border border-[#173d4a]/40 bg-[#f7f8fa] p-2.5 dark:border-[#2b4761] dark:bg-[#132537]">
                      <input
                        value={inlineNewCatName}
                        onChange={(e) => setInlineNewCatName(e.target.value)}
                        placeholder="Nome da nova categoria"
                        className="h-8 w-full rounded border border-[#cbd3d8] bg-white px-2 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                      />
                      <label className="flex items-center gap-1.5 text-[11px]">
                        <input
                          type="checkbox"
                          checked={inlineNewCatCommercial}
                          onChange={(e) => setInlineNewCatCommercial(e.target.checked)}
                          className="size-3.5 accent-[#173d4a]"
                        />
                        Exibir na aba Comercial
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {CONTACT_COLOR_PALETTE.map((col) => (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => setInlineNewCatColor(col.hex)}
                            title={col.label}
                            className={`size-5 rounded-full border-2 ${
                              inlineNewCatColor === col.hex ? "border-[#0c1928]" : "border-transparent"
                            }`}
                            style={{ backgroundColor: col.hex }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSaveInlineCategory()}
                        className="h-7 rounded bg-[#173d4a] px-3 font-semibold text-white"
                      >
                        Salvar categoria
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-[#52616a] dark:text-slate-400">Cor cat.:</span>
                    {CONTACT_COLOR_PALETTE.slice(0, 8).map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setCategoryColor(col.hex)}
                        title={col.label}
                        className={`size-4 rounded-full border ${
                          categoryColor === col.hex ? "scale-125 border-[#0c1928] dark:border-white" : "border-transparent"
                        }`}
                        style={{ backgroundColor: col.hex }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#52616a] dark:text-slate-300">
                      Subcategoria (opcional)
                    </span>
                    <button
                      type="button"
                      onClick={() => setInlineNewSubOpen((v) => !v)}
                      className="font-semibold text-[#173d4a] hover:underline dark:text-[#b99555]"
                    >
                      + Novo
                    </button>
                  </div>
                  <select
                    value={subcategoryId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSubcategoryId(nextId);
                      const found = subMap.get(nextId);
                      if (found) setSubcategoryColor(found.color);
                    }}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm dark:border-[#2b4761] dark:bg-[#132537]"
                  >
                    <option value="">Sem subcategoria</option>
                    {availableSubcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  {inlineNewSubOpen && (
                    <div className="space-y-2 rounded-lg border border-[#173d4a]/40 bg-[#f7f8fa] p-2.5 dark:border-[#2b4761] dark:bg-[#132537]">
                      <input
                        value={inlineNewSubName}
                        onChange={(e) => setInlineNewSubName(e.target.value)}
                        placeholder="Nome da nova subcategoria"
                        className="h-8 w-full rounded border border-[#cbd3d8] bg-white px-2 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                      />
                      <div className="flex flex-wrap gap-1">
                        {CONTACT_COLOR_PALETTE.map((col) => (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => setInlineNewSubColor(col.hex)}
                            title={col.label}
                            className={`size-5 rounded-full border-2 ${
                              inlineNewSubColor === col.hex ? "border-[#0c1928]" : "border-transparent"
                            }`}
                            style={{ backgroundColor: col.hex }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSaveInlineSubcategory()}
                        className="h-7 rounded bg-[#173d4a] px-3 font-semibold text-white"
                      >
                        Salvar subcategoria
                      </button>
                    </div>
                  )}

                  {subcategoryId && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-[#52616a] dark:text-slate-400">Cor sub.:</span>
                      {CONTACT_COLOR_PALETTE.slice(0, 8).map((col) => (
                        <button
                          key={col.id}
                          type="button"
                          onClick={() => setSubcategoryColor(col.hex)}
                          title={col.label}
                          className={`size-4 rounded-full border ${
                            subcategoryColor === col.hex ? "scale-125 border-[#0c1928] dark:border-white" : "border-transparent"
                          }`}
                          style={{ backgroundColor: col.hex }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Birthday */}
              <div className="rounded-lg border border-[#dce2e6] bg-[#f7f8fa] p-3 dark:border-[#233c53] dark:bg-[#132537]">
                <div className="mb-2 font-semibold text-[#0c1928] dark:text-white">
                  Data de nascimento (ano opcional)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="mb-0.5 block text-[11px]">Dia</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={birthDay}
                      onChange={(e) => setBirthDay(e.target.value)}
                      placeholder="Ex.: 29"
                      className="tabular-nums h-8 w-full rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[11px]">Mês</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={birthMonth}
                      onChange={(e) => setBirthMonth(e.target.value)}
                      placeholder="Ex.: 02"
                      className="tabular-nums h-8 w-full rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[11px]">Ano (opcional)</span>
                    <input
                      type="number"
                      min={1900}
                      max={2100}
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      placeholder="Ex.: 1992"
                      className="tabular-nums h-8 w-full rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                    />
                  </label>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={bdayReminderEnabled}
                      onChange={(e) => setBdayReminderEnabled(e.target.checked)}
                      className="size-3.5 accent-[#173d4a]"
                    />
                    Lembrete antecipado de aniversário
                  </label>
                  {bdayReminderEnabled && (
                    <label className="flex items-center gap-1.5">
                      <span>Dias antes:</span>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={bdayReminderDays}
                        onChange={(e) => setBdayReminderDays(Number(e.target.value) || 0)}
                        className="tabular-nums h-7 w-14 rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Phones */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Telefones</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPhones((p) => [...p, { label: "Celular", number: "", isWhatsApp: true }])
                    }
                    className="font-semibold text-[#173d4a] hover:underline dark:text-[#b99555]"
                  >
                    + Adicionar telefone
                  </button>
                </div>
                {phones.map((ph, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <input
                      value={ph.label}
                      onChange={(e) =>
                        setPhones((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)),
                        )
                      }
                      placeholder="Tipo (Celular)"
                      className="h-8 w-28 rounded-lg border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#132537]"
                    />
                    <input
                      value={ph.number}
                      onChange={(e) =>
                        setPhones((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, number: e.target.value } : row)),
                        )
                      }
                      placeholder="(61) 99999-9999"
                      className="tabular-nums h-8 min-w-40 flex-1 rounded-lg border border-[#cbd3d8] bg-white px-2.5 dark:border-[#2b4761] dark:bg-[#132537]"
                    />
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(ph.isWhatsApp)}
                        onChange={(e) =>
                          setPhones((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, isWhatsApp: e.target.checked } : row,
                            ),
                          )
                        }
                        className="size-3.5 accent-[#16a34a]"
                      />
                      WhatsApp
                    </label>
                    {phones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPhones((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-[#dc2626] hover:underline"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Emails */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">E-mails</span>
                  <button
                    type="button"
                    onClick={() => setEmails((p) => [...p, ""])}
                    className="font-semibold text-[#173d4a] hover:underline dark:text-[#b99555]"
                  >
                    + Adicionar e-mail
                  </button>
                </div>
                {emails.map((em, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="email"
                      value={em}
                      onChange={(e) =>
                        setEmails((prev) => prev.map((row, i) => (i === idx ? e.target.value : row)))
                      }
                      placeholder="contato@exemplo.com"
                      className="h-8 flex-1 rounded-lg border border-[#cbd3d8] bg-white px-2.5 dark:border-[#2b4761] dark:bg-[#132537]"
                    />
                    {emails.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEmails((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-[#dc2626] hover:underline"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Work / Address / Notes */}
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="Relação / Vínculo"
                  className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 dark:border-[#2b4761] dark:bg-[#132537]"
                />
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Empresa / Estabelecimento"
                  className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 dark:border-[#2b4761] dark:bg-[#132537]"
                />
                <input
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder="Profissão / Serviço"
                  className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 dark:border-[#2b4761] dark:bg-[#132537]"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Endereço"
                  className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 sm:col-span-2 dark:border-[#2b4761] dark:bg-[#132537]"
                />
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Cidade"
                  className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 dark:border-[#2b4761] dark:bg-[#132537]"
                />
                <input
                  value={stateUf}
                  onChange={(e) => setStateUf(e.target.value)}
                  maxLength={2}
                  placeholder="UF"
                  className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2.5 uppercase dark:border-[#2b4761] dark:bg-[#132537]"
                />
              </div>

              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="Site ou rede social (opcional)"
                className="h-8 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 dark:border-[#2b4761] dark:bg-[#132537]"
              />

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Observações gerais..."
                className="w-full rounded-lg border border-[#cbd3d8] bg-white p-2.5 dark:border-[#2b4761] dark:bg-[#132537]"
              />

              <div className="flex justify-end gap-2 border-t border-[#edf1f3] pt-3 dark:border-[#233c53]">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 font-semibold dark:border-[#2b4761]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 rounded-lg bg-[#173d4a] px-4 font-semibold text-white hover:bg-[#0c1928]"
                >
                  {duplicates.length > 0 ? "Salvar mesmo assim" : saving ? "Salvando..." : "Salvar contato"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category & Subcategory Manager Modal */}
      {catManagerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cat-mgr-title"
          className="fixed inset-0 z-[65] flex items-center justify-center bg-[#0c1928]/65 p-4"
        >
          <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e]">
            <div className="flex items-center justify-between border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
              <h3 id="cat-mgr-title" className="text-lg font-semibold">
                Categorias e Subcategorias
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCatManagerOpen(false);
                  setEditingCat(null);
                  setEditingSub(null);
                  setRemapSourceCat(null);
                }}
                aria-label="Fechar"
                className="grid size-8 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
              {remapSourceCat && (
                <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4 dark:border-amber-800 dark:bg-amber-950/40">
                  <p className="font-semibold">
                    Remanejar contatos antes de excluir "{remapSourceCat.name}"
                  </p>
                  <p className="mt-1 text-[#52616a] dark:text-slate-300">
                    Escolha a categoria de destino para preservar os contatos vinculados:
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <select
                      value={remapTargetCatId}
                      onChange={(e) => setRemapTargetCatId(e.target.value)}
                      className="h-8 rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                    >
                      {categories
                        .filter((c) => c.id !== remapSourceCat.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteContactCategoryWithRemap(remapSourceCat.id, remapTargetCatId);
                        setRemapSourceCat(null);
                        toast.success("Contatos remanejados e categoria excluída.");
                      }}
                      className="h-8 rounded bg-[#dc2626] px-3 font-semibold text-white"
                    >
                      Confirmar remanejamento e exclusão
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemapSourceCat(null)}
                      className="h-8 rounded border border-[#dce2e6] bg-white px-3 font-semibold text-[#0c1928]"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-2 font-semibold">Categorias</h4>
                <div className="divide-y divide-[#edf1f3] rounded-xl border border-[#dce2e6] dark:divide-[#233c53] dark:border-[#233c53]">
                  {categories.map((cat) => {
                    const count = state.agendaContacts.filter((c) => c.categoryId === cat.id).length;
                    const isEditing = editingCat?.id === cat.id;
                    return (
                      <div key={cat.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        {isEditing ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={editingCat.name}
                              onChange={(e) =>
                                setEditingCat((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                              }
                              className="h-8 rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#132537]"
                            />
                            <div className="flex gap-1">
                              {CONTACT_COLOR_PALETTE.slice(0, 7).map((col) => (
                                <button
                                  key={col.id}
                                  type="button"
                                  onClick={() =>
                                    setEditingCat((prev) =>
                                      prev ? { ...prev, color: col.hex } : prev,
                                    )
                                  }
                                  className={`size-5 rounded-full border-2 ${
                                    editingCat.color === col.hex ? "border-[#0c1928]" : "border-transparent"
                                  }`}
                                  style={{ backgroundColor: col.hex }}
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await upsertContactCategory(editingCat);
                                setEditingCat(null);
                                toast.success("Categoria atualizada.");
                              }}
                              className="inline-flex h-7 items-center gap-1 rounded bg-[#173d4a] px-2.5 font-semibold text-white"
                            >
                              <Check className="size-3" /> Salvar
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span
                                className="size-3 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="font-semibold">{cat.name}</span>
                              <span className="text-[#52616a] dark:text-slate-400">
                                ({count} contato{count === 1 ? "" : "s"}
                                {cat.isCommercial ? " · Comercial" : ""})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingCat(cat)}
                                className="rounded border border-[#dce2e6] px-2 py-1 font-semibold hover:bg-[#f0f3f5] dark:border-[#2b4761]"
                              >
                                Editar
                              </button>
                              {categories.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fallback = categories.find((c) => c.id !== cat.id)?.id ?? "";
                                    if (count > 0) {
                                      setRemapSourceCat(cat);
                                      setRemapTargetCatId(fallback);
                                    } else {
                                      void deleteContactCategoryWithRemap(cat.id).then(() =>
                                        toast.success("Categoria removida."),
                                      );
                                    }
                                  }}
                                  className="rounded border border-[#fecaca] px-2 py-1 font-semibold text-[#dc2626] hover:bg-[#fef2f2]"
                                >
                                  Excluir
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-semibold">Subcategorias</h4>
                <div className="divide-y divide-[#edf1f3] rounded-xl border border-[#dce2e6] dark:divide-[#233c53] dark:border-[#233c53]">
                  {subcategories.map((sub) => {
                    const parentName = catMap.get(sub.categoryId)?.name ?? "—";
                    const isEditing = editingSub?.id === sub.id;
                    return (
                      <div key={sub.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        {isEditing ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={editingSub.name}
                              onChange={(e) =>
                                setEditingSub((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                              }
                              className="h-8 rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#132537]"
                            />
                            <div className="flex gap-1">
                              {CONTACT_COLOR_PALETTE.slice(0, 7).map((col) => (
                                <button
                                  key={col.id}
                                  type="button"
                                  onClick={() =>
                                    setEditingSub((prev) =>
                                      prev ? { ...prev, color: col.hex } : prev,
                                    )
                                  }
                                  className={`size-5 rounded-full border-2 ${
                                    editingSub.color === col.hex ? "border-[#0c1928]" : "border-transparent"
                                  }`}
                                  style={{ backgroundColor: col.hex }}
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await upsertContactSubcategory(editingSub);
                                setEditingSub(null);
                                toast.success("Subcategoria atualizada.");
                              }}
                              className="inline-flex h-7 items-center gap-1 rounded bg-[#173d4a] px-2.5 font-semibold text-white"
                            >
                              <Check className="size-3" /> Salvar
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span
                                className="size-2.5 rounded-full"
                                style={{ backgroundColor: sub.color }}
                              />
                              <span className="font-semibold">{sub.name}</span>
                              <span className="text-[#52616a] dark:text-slate-400">
                                ({parentName})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingSub(sub)}
                                className="rounded border border-[#dce2e6] px-2 py-1 font-semibold hover:bg-[#f0f3f5] dark:border-[#2b4761]"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void deleteContactSubcategory(sub.id).then(() =>
                                    toast.success("Subcategoria removida."),
                                  )
                                }
                                className="rounded border border-[#fecaca] px-2 py-1 font-semibold text-[#dc2626] hover:bg-[#fef2f2]"
                              >
                                Excluir
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
