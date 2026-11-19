import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Lock, Plus, Unlock } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useOrion } from "@/store/orionContext";
import { formatBRL, formatDateBR, parseBRL, todayBR } from "@/lib/domain/money";
import { EXPENSE_CATEGORIES, REVENUE_CATEGORIES } from "@/lib/domain/contracts";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function MicroRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" width={42} height={42} aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="#B99555"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
      />
    </svg>
  );
}

export function PainelPage() {
  const { state, addQuickMovement, saveCardOverride, clearCardOverride } = useOrion();
  const today = todayBR();
  const currentMonth = today.slice(0, 7);

  const [chartYear, setChartYear] = useState(Number(today.slice(0, 4)) || 2026);

  const availableYears = useMemo(() => {
    const set = new Set<number>([2026]);
    for (const y of state.annualYears) set.add(y.year);
    for (const r of state.annualExpenses) set.add(r.year);
    return [...set].sort((a, b) => a - b);
  }, [state.annualYears, state.annualExpenses]);

  // Quick launcher form state
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState(state.banks[0]?.id ?? "");
  const [settled, setSettled] = useState(true);

  // Card limit manual unlock
  const [cardsUnlocked, setCardsUnlocked] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { limit: string; used: string }>>({});

  const totalBalanceCents = useMemo(
    () => state.banks.reduce((sum, b) => sum + b.balanceCents, 0),
    [state.banks],
  );

  const monthRevenues = useMemo(
    () => state.revenueEntries.filter((e) => e.dueDate.startsWith(currentMonth)),
    [state.revenueEntries, currentMonth],
  );
  const monthRevExpected = monthRevenues.reduce((s, e) => s + e.expectedCents, 0);
  const monthRevReceived = monthRevenues.reduce((s, e) => s + (e.receivedCents ?? 0), 0);

  const monthBills = useMemo(
    () => state.monthlyBills.filter((b) => b.period === currentMonth),
    [state.monthlyBills, currentMonth],
  );
  const monthExpExpected = monthBills.reduce((s, b) => s + b.expectedCents, 0);
  const monthExpPaid = monthBills.reduce(
    (s, b) => s + (b.isSettled ? b.expectedCents : (b.paidCents ?? 0)),
    0,
  );
  const expPct = monthExpExpected > 0 ? Math.round((monthExpPaid / monthExpExpected) * 100) : 0;

  const cardLimits = useMemo(() => {
    return state.cards.reduce(
      (acc, c) => {
        const limit = c.manualLimitCents ?? c.creditLimitCents;
        const used = c.manualUsedCents ?? Math.max(0, c.creditLimitCents - c.availableCents);
        return { limit: acc.limit + limit, used: acc.used + used };
      },
      { limit: 0, used: 0 },
    );
  }, [state.cards]);
  const cardUsedPct = cardLimits.limit > 0 ? Math.round((cardLimits.used / cardLimits.limit) * 100) : 0;

  // Annual monthly cashflow series for Recharts (strictly single-counted from annualExpenses + revenueEntries)
  const annualSeries = useMemo(() => {
    return MONTHS.map((label, idx) => {
      const mKey = String(idx + 1).padStart(2, "0");
      const prefix = `${chartYear}-${mKey}`;
      const receitas = state.revenueEntries
        .filter((e) => e.dueDate.startsWith(prefix))
        .reduce((s, e) => s + (e.receivedCents ?? e.expectedCents), 0);
      const despesas = state.annualExpenses
        .filter((r) => r.year === chartYear)
        .reduce((s, r) => s + (r.months[mKey]?.expectedCents ?? 0), 0);
      return {
        month: label,
        Receitas: Math.round(receitas / 100),
        Despesas: Math.round(despesas / 100),
      };
    });
  }, [state.revenueEntries, state.annualExpenses, chartYear]);

  const upcomingItems = useMemo(() => {
    const bills = state.monthlyBills
      .filter((b) => !b.isSettled)
      .map((b) => ({
        id: b.id,
        type: "Despesa" as const,
        title: b.creditor,
        date: b.dueDate,
        cents: b.expectedCents,
        overdue: b.dueDate < today,
      }));
    const revs = state.revenueEntries
      .filter((r) => !r.receivedDate)
      .map((r) => ({
        id: r.id,
        type: "Receita" as const,
        title: r.title,
        date: r.dueDate,
        cents: r.expectedCents,
        overdue: r.dueDate < today,
      }));
    return [...bills, ...revs].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  }, [state.monthlyBills, state.revenueEntries, today]);

  async function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBRL(amountText);
    if (!title.trim() || !cents || cents <= 0) {
      toast.error("Informe descrição e valor válido em reais.");
      return;
    }
    await addQuickMovement({
      kind,
      title: title.trim(),
      category,
      amountCents: cents,
      date,
      accountId,
      settled,
    });
    setTitle("");
    setAmountText("");
    toast.success(`${kind === "income" ? "Receita" : "Despesa"} registrada com sucesso.`);
  }

  function toggleUnlockCards() {
    if (cardsUnlocked) {
      setCardsUnlocked(false);
      return;
    }
    const next: Record<string, { limit: string; used: string }> = {};
    for (const c of state.cards) {
      const lim = c.manualLimitCents ?? c.creditLimitCents;
      const used = c.manualUsedCents ?? Math.max(0, c.creditLimitCents - c.availableCents);
      next[c.id] = {
        limit: (lim / 100).toFixed(2).replace(".", ","),
        used: (used / 100).toFixed(2).replace(".", ","),
      };
    }
    setDrafts(next);
    setCardsUnlocked(true);
  }

  function handleSaveCardDraft(cardId: string) {
    const d = drafts[cardId];
    if (!d) return;
    const lim = parseBRL(d.limit);
    const used = parseBRL(d.used);
    if (lim === null || used === null || used > lim) {
      toast.error("Limite inválido ou valor utilizado maior que o limite.");
      return;
    }
    saveCardOverride(cardId, lim, used);
    toast.success("Ajuste manual de limite salvo.");
  }

  return (
    <AppShell
      title="Painel Financeiro"
      subtitle={`Consolidado patrimonial · Competência ${currentMonth}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/receitas"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] whitespace-nowrap"
          >
            Receitas <ArrowUpRight className="size-3.5" />
          </Link>
          <Link
            to="/despesas"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] whitespace-nowrap"
          >
            Despesas <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 4 KPI Strip */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="orion-kpi-featured rounded-xl p-5 shadow-xs">
            <div className="text-xs font-semibold tracking-wider text-[#d8c9a8] uppercase">
              Saldo em Contas
            </div>
            <div className="tabular-nums mt-2 text-2xl font-bold">{formatBRL(totalBalanceCents)}</div>
            <div className="mt-1 text-xs text-white/75">
              {state.banks.length} contas bancárias ativas
            </div>
          </div>

          <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold tracking-wider text-[#52616a] uppercase">
                  Receitas do Mês
                </div>
                <div className="tabular-nums mt-2 text-2xl font-bold text-[#0c1928]">
                  {formatBRL(monthRevReceived)}
                </div>
                <div className="tabular-nums mt-1 text-xs text-[#52616a]">
                  Previsto: {formatBRL(monthRevExpected)}
                </div>
              </div>
              <MicroRing
                value={monthRevExpected > 0 ? Math.round((monthRevReceived / monthRevExpected) * 100) : 0}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold tracking-wider text-[#52616a] uppercase">
                  Despesas do Mês
                </div>
                <div className="tabular-nums mt-2 text-2xl font-bold text-[#0c1928]">
                  {formatBRL(monthExpPaid)}
                </div>
                <div className="tabular-nums mt-1 text-xs text-[#52616a]">
                  Total previsto: {formatBRL(monthExpExpected)} · {expPct}% quitado
                </div>
              </div>
              <MicroRing value={expPct} />
            </div>
          </div>

          <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold tracking-wider text-[#52616a] uppercase">
                  Limites de Cartões
                </div>
                <div className="tabular-nums mt-2 text-2xl font-bold text-[#0c1928]">
                  {formatBRL(cardLimits.limit - cardLimits.used)}
                </div>
                <div className="tabular-nums mt-1 text-xs text-[#52616a]">
                  Usado: {formatBRL(cardLimits.used)} de {formatBRL(cardLimits.limit)}
                </div>
              </div>
              <MicroRing value={cardUsedPct} />
            </div>
          </div>
        </section>

        {/* Chart + Quick Launcher */}
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-[#dce2e6] bg-white p-5 lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[#0c1928]">Fluxo Anual {chartYear}</h2>
                <p className="text-xs text-[#52616a]">
                  Receitas previstas/recebidas comparadas às obrigações da grade anual (R$)
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#52616a]">
                <select
                  value={chartYear}
                  onChange={(e) => setChartYear(Number(e.target.value))}
                  aria-label="Ano do gráfico"
                  className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs font-semibold text-[#0c1928]"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-xs bg-[#173d4a]" /> Receitas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-xs bg-[#b99555]" /> Despesas
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={annualSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e9ec" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#52616a" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#52616a" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) =>
                      value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    }
                    contentStyle={{
                      borderRadius: "10px",
                      borderColor: "#dce2e6",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="Receitas" fill="#173d4a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas" fill="#b99555" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lançador Rápido */}
          <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#0c1928]">Lançador Rápido</h2>
            <p className="mt-0.5 text-xs text-[#52616a]">
              Registra diretamente em receitas ou despesas do mês
            </p>

            <form onSubmit={handleQuickSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f0f3f5] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setKind("expense");
                    setCategory(EXPENSE_CATEGORIES[0]);
                  }}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    kind === "expense" ? "bg-white text-[#0c1928] shadow-xs" : "text-[#52616a]"
                  }`}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKind("income");
                    setCategory(REVENUE_CATEGORIES[0]);
                  }}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    kind === "income" ? "bg-white text-[#0c1928] shadow-xs" : "text-[#52616a]"
                  }`}
                >
                  Receita
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Descrição</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={kind === "income" ? "Ex.: Consultoria extra" : "Ex.: Manutenção residencial"}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Valor (R$)</label>
                  <input
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    placeholder="0,00"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm"
                  >
                    {(kind === "income" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Conta</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm"
                  >
                    {state.banks.length === 0 ? (
                      <option value="">Sem conta vinculada</option>
                    ) : (
                      state.banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.institution}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-[#0c1928]">
                <input
                  type="checkbox"
                  checked={settled}
                  onChange={(e) => setSettled(e.target.checked)}
                  className="size-4 accent-[#173d4a]"
                />
                <span>{kind === "income" ? "Já recebido em conta" : "Já pago / quitado"}</span>
              </label>

              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#173d4a] text-sm font-semibold text-white hover:bg-[#0c1928]"
              >
                <Plus className="size-4" /> Registrar {kind === "income" ? "receita" : "despesa"}
              </button>
            </form>
          </div>
        </section>

        {/* Bottom 2 columns: Upcoming Obligations & Card Limits */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[#0c1928]">Próximos Vencimentos & Recebíveis</h2>
                <p className="text-xs text-[#52616a]">Ordenados por data de vencimento</p>
              </div>
              <Link to="/agenda" className="text-xs font-semibold text-[#173d4a] hover:underline">
                Ver agenda
              </Link>
            </div>

            {upcomingItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#52616a]">
                Nenhuma pendência em aberto.
              </p>
            ) : (
              <div className="divide-y divide-[#edf1f3]">
                {upcomingItems.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-[#0c1928]">{it.title}</div>
                      <div className="text-xs text-[#52616a]">
                        {it.type} · {formatDateBR(it.date)}
                        {it.overdue ? " · Em atraso" : ""}
                      </div>
                    </div>
                    <div
                      className={`tabular-nums shrink-0 font-semibold ${
                        it.type === "Receita"
                          ? "text-[#16a34a]"
                          : it.overdue
                            ? "text-[#dc2626]"
                            : "text-[#0c1928]"
                      }`}
                    >
                      {it.type === "Receita" ? "+ " : "− "}
                      {formatBRL(it.cents)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[#0c1928]">Cartões de Crédito</h2>
                <p className="text-xs text-[#52616a]">
                  Controle de limite disponível com ajuste manual opcional
                </p>
              </div>
              <button
                type="button"
                onClick={toggleUnlockCards}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] px-2.5 py-1.5 text-xs font-semibold text-[#173d4a] hover:bg-[#f0f3f5]"
              >
                {cardsUnlocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                {cardsUnlocked ? "Bloquear" : "Ajustar limites"}
              </button>
            </div>

            <div className="space-y-4">
              {state.cards.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-[#52616a]">Nenhum cartão cadastrado ainda.</p>
                  <Link
                    to="/carteira"
                    className="mt-3 inline-flex rounded-lg bg-[#173d4a] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0c1928]"
                  >
                    Adicionar cartão na Carteira
                  </Link>
                </div>
              ) : (
                state.cards.map((c) => {
                const limit = c.manualLimitCents ?? c.creditLimitCents;
                const used = c.manualUsedCents ?? Math.max(0, c.creditLimitCents - c.availableCents);
                const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                const draft = drafts[c.id];
                return (
                  <div key={c.id} className="space-y-1.5 border-b border-[#edf1f3] pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-semibold text-[#0c1928]">{c.name}</span>
                        <span className="ml-2 text-xs text-[#52616a]">
                          •••• {c.number} · {c.brand}
                        </span>
                      </div>
                      <span className="tabular-nums text-xs font-semibold text-[#173d4a]">
                        {pct}% utilizado
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#edf1f3]">
                      <div
                        className="h-full rounded-full bg-[#173d4a] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="tabular-nums flex justify-between text-xs text-[#52616a]">
                      <span>Usado: {formatBRL(used)}</span>
                      <span>Disponível: {formatBRL(Math.max(0, limit - used))}</span>
                    </div>

                    {cardsUnlocked && draft && (
                      <div className="mt-2 flex flex-wrap items-end gap-2 pt-1">
                        <div>
                          <label className="block text-[11px] text-[#52616a]">Limite (R$)</label>
                          <input
                            value={draft.limit}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [c.id]: { ...draft, limit: e.target.value },
                              }))
                            }
                            className="tabular-nums h-8 w-28 rounded-md border border-[#cbd3d8] px-2 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#52616a]">Utilizado (R$)</label>
                          <input
                            value={draft.used}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [c.id]: { ...draft, used: e.target.value },
                              }))
                            }
                            className="tabular-nums h-8 w-28 rounded-md border border-[#cbd3d8] px-2 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveCardDraft(c.id)}
                          className="h-8 rounded-md bg-[#173d4a] px-3 text-xs font-semibold text-white"
                        >
                          Salvar
                        </button>
                        {c.manualLimitCents !== undefined && (
                          <button
                            type="button"
                            onClick={() => {
                              clearCardOverride(c.id);
                              toast.success("Valores originais restaurados.");
                            }}
                            className="h-8 rounded-md border border-[#dce2e6] px-2.5 text-xs text-[#52616a]"
                          >
                            Restaurar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
