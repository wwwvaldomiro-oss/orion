import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  Plus,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PluggySettings } from "@/components/PluggySettings";
import { useOrion } from "@/store/orionContext";
import { formatBRL, formatDateBR, parseBRL } from "@/lib/domain/money";
import type { CardBrand, CreditCardAccount } from "@/types/orion";

function getCardDesign(card: CreditCardAccount) {
  const text = `${card.institution} ${card.name}`.toLowerCase();
  if (/nubank|\bnu\b/.test(text)) {
    return { gradient: "linear-gradient(125deg,#5a0f70,#9b1db5 70%,#72118c)", label: "nu" };
  }
  if (/ita[uú]/.test(text)) {
    return { gradient: "linear-gradient(135deg,#0c1928,#22374f 70%,#ec7000)", label: "itaú" };
  }
  if (/btg/.test(text)) {
    return { gradient: "linear-gradient(135deg,#1d2b3a,#3b5169)", label: "btg pactual" };
  }
  return { gradient: "linear-gradient(135deg,#173d4a,#0c1928)", label: card.institution };
}

function formatCapturedAtBR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CarteiraPage() {
  const { state, addBankAccount, addCreditCard } = useOrion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCardIdx, setSelectedCardIdx] = useState(0);
  const [txFilter, setTxFilter] = useState<"all" | "income" | "expense">("all");
  const [txSearch, setTxSearch] = useState(() => searchParams.get("q") ?? "");
  const [expandedSnapIds, setExpandedSnapIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setTxSearch(q);
  }, [searchParams]);

  // Add account modal
  const [bankOpen, setBankOpen] = useState(false);
  const [bankInst, setBankInst] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankNum, setBankNum] = useState("");
  const [bankBal, setBankBal] = useState("");

  // Add card modal
  const [cardOpen, setCardOpen] = useState(false);
  const [cardInst, setCardInst] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardBrand, setCardBrand] = useState<CardBrand>("MASTERCARD");
  const [cardNum, setCardNum] = useState("");
  const [cardLimit, setCardLimit] = useState("");

  const activeCard = state.cards[selectedCardIdx] ?? state.cards[0];

  const sortedSnapshots = useMemo(() => {
    return [...state.cardMonthSnapshots].sort((a, b) => {
      const periodCmp = b.period.localeCompare(a.period);
      if (periodCmp !== 0) return periodCmp;
      return b.capturedAt.localeCompare(a.capturedAt);
    });
  }, [state.cardMonthSnapshots]);

  const cardLookup = useMemo(() => {
    const map = new Map<string, CreditCardAccount>();
    for (const card of state.cards) {
      map.set(card.id, card);
      if (card.sourceRecordId) map.set(card.sourceRecordId, card);
    }
    return map;
  }, [state.cards]);

  const filteredTx = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return state.transactions.filter((t) => {
      if (txFilter === "income" && t.amountCents >= 0) return false;
      if (txFilter === "expense" && t.amountCents < 0) return false;
      if (!q) return true;
      return `${t.description} ${t.accountName} ${t.institution} ${t.category} ${t.date}`
        .toLowerCase()
        .includes(q);
    });
  }, [state.transactions, txFilter, txSearch]);

  function toggleSnapshot(id: string) {
    setExpandedSnapIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function submitBank(e: React.FormEvent) {
    e.preventDefault();
    const bal = parseBRL(bankBal) ?? 0;
    if (!bankInst.trim() || !bankName.trim()) {
      toast.error("Informe instituição e nome da conta.");
      return;
    }
    addBankAccount({
      institution: bankInst.trim(),
      name: bankName.trim(),
      accountType: "CHECKING",
      number: bankNum.trim() || "0001",
      balanceCents: bal,
      color: "#173d4a",
    });
    setBankOpen(false);
    setBankInst("");
    setBankName("");
    setBankNum("");
    setBankBal("");
    toast.success("Conta adicionada à carteira.");
  }

  function submitCard(e: React.FormEvent) {
    e.preventDefault();
    const lim = parseBRL(cardLimit);
    if (!cardInst.trim() || !cardName.trim() || !lim || lim <= 0) {
      toast.error("Informe instituição, nome do cartão e limite válido.");
      return;
    }
    addCreditCard({
      institution: cardInst.trim(),
      name: cardName.trim(),
      brand: cardBrand,
      number: cardNum.trim() || "0000",
      creditLimitCents: lim,
      availableCents: lim,
      closingDay: 15,
      dueDay: 25,
    });
    setCardOpen(false);
    setCardInst("");
    setCardName("");
    setCardNum("");
    setCardLimit("");
    toast.success("Cartão adicionado à carteira.");
  }

  return (
    <AppShell
      title="Carteira"
      subtitle="Contas bancárias, cartões de crédito e movimentações consolidadas"
      actions={
        <div className="flex items-center gap-2">
          <PluggySettings />
          <button
            type="button"
            onClick={() => setBankOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#f0f3f5] whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Conta
          </button>
          <button
            type="button"
            onClick={() => setCardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Cartão
          </button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Bank Accounts */}
        <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#0c1928]">Contas Bancárias</h2>
          <div className="mt-3 divide-y divide-[#edf1f3]">
            {state.banks.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#52616a]">
                Nenhuma conta cadastrada. Clique em &quot;+ Conta&quot; para adicionar.
              </p>
            ) : (
              state.banks.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="grid size-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold text-white"
                      style={{ background: b.color }}
                    >
                      {b.institution.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#0c1928]">{b.name}</div>
                      <div className="truncate text-xs text-[#52616a]">
                        {b.institution} · •••• {b.number}
                      </div>
                    </div>
                  </div>
                  <div className="tabular-nums shrink-0 text-sm font-bold text-[#173d4a]">
                    {formatBRL(b.balanceCents)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Interactive Card Wallet */}
        <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#0c1928]">Cartões Cadastrados</h2>
          {activeCard ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={state.cards.length < 2}
                  onClick={() =>
                    setSelectedCardIdx(
                      (selectedCardIdx - 1 + state.cards.length) % state.cards.length,
                    )
                  }
                  aria-label="Cartão anterior"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-[#dce2e6] hover:bg-[#f0f3f5] disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>

                <div
                  className="relative flex-1 overflow-hidden rounded-2xl p-5 text-white shadow-md"
                  style={{ background: getCardDesign(activeCard).gradient }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] font-semibold tracking-[0.18em] uppercase opacity-80">
                        {activeCard.institution}
                      </div>
                      <div className="mt-0.5 text-lg font-bold">
                        {getCardDesign(activeCard).label}
                      </div>
                    </div>
                    <span className="text-xs font-extrabold tracking-wider">
                      {activeCard.brand}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center gap-2">
                    <div className="h-6 w-9 rounded border border-white/40 bg-white/25" />
                    <Radio className="size-4 rotate-90 opacity-80" />
                  </div>
                  <div className="mt-4 flex items-end justify-between text-xs">
                    <div>
                      <div className="font-semibold">{activeCard.name}</div>
                      <div className="opacity-80">•••• {activeCard.number}</div>
                    </div>
                    <div className="text-right opacity-90">
                      <div>Fecha dia {activeCard.closingDay}</div>
                      <div>Vence dia {activeCard.dueDay}</div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={state.cards.length < 2}
                  onClick={() => setSelectedCardIdx((selectedCardIdx + 1) % state.cards.length)}
                  aria-label="Próximo cartão"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-[#dce2e6] hover:bg-[#f0f3f5] disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-[#edf1f3] bg-[#f7f8fa] p-2.5">
                  <div className="text-[#52616a]">Limite</div>
                  <div className="tabular-nums mt-1 font-bold text-[#0c1928]">
                    {formatBRL(activeCard.manualLimitCents ?? activeCard.creditLimitCents)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#edf1f3] bg-[#f7f8fa] p-2.5">
                  <div className="text-[#52616a]">Utilizado</div>
                  <div className="tabular-nums mt-1 font-bold text-[#dc2626]">
                    {formatBRL(
                      activeCard.manualUsedCents ??
                        Math.max(0, activeCard.creditLimitCents - activeCard.availableCents),
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-[#edf1f3] bg-[#f7f8fa] p-2.5">
                  <div className="text-[#52616a]">Disponível</div>
                  <div className="tabular-nums mt-1 font-bold text-[#16a34a]">
                    {formatBRL(
                      (activeCard.manualLimitCents ?? activeCard.creditLimitCents) -
                        (activeCard.manualUsedCents ??
                          Math.max(0, activeCard.creditLimitCents - activeCard.availableCents)),
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-[#52616a]">Nenhum cartão cadastrado.</p>
          )}
        </section>

        {/* Transactions */}
        <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#0c1928]">Movimentações</h2>
            <div className="flex gap-1 rounded-lg bg-[#f0f3f5] p-0.5 text-xs">
              {(
                [
                  ["all", "Todas"],
                  ["income", "Entradas"],
                  ["expense", "Saídas"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTxFilter(id)}
                  className={`rounded-md px-2 py-1 font-semibold ${
                    txFilter === id ? "bg-white text-[#0c1928] shadow-xs" : "text-[#52616a]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <input
              value={txSearch}
              onChange={(e) => {
                setTxSearch(e.target.value);
                if (searchParams.has("q")) {
                  searchParams.delete("q");
                  setSearchParams(searchParams, { replace: true });
                }
              }}
              placeholder="Filtrar transações por descrição, conta ou categoria..."
              className="h-8 flex-1 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
            />
            {txSearch && (
              <button
                type="button"
                onClick={() => {
                  setTxSearch("");
                  if (searchParams.has("q")) {
                    searchParams.delete("q");
                    setSearchParams(searchParams, { replace: true });
                  }
                }}
                className="h-8 rounded-lg border border-[#dce2e6] px-2 text-xs text-[#52616a] hover:bg-[#f0f3f5]"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="max-h-[420px] divide-y divide-[#edf1f3] overflow-y-auto pr-1">
            {filteredTx.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#52616a]">
                Nenhuma movimentação registrada ainda.
              </p>
            ) : (
              filteredTx.map((t) => {
                const income = t.amountCents >= 0;
                return (
                  <div key={t.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-[#0c1928]">{t.description}</div>
                      <div className="text-xs text-[#52616a]">
                        {t.accountName} · {formatDateBR(t.date)} · {t.category}
                      </div>
                    </div>
                    <div
                      className={`tabular-nums shrink-0 font-bold ${
                        income ? "text-[#16a34a]" : "text-[#dc2626]"
                      }`}
                    >
                      {income ? "+ " : "− "}
                      {formatBRL(Math.abs(t.amountCents))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Historical Card Month Snapshots (Read-only) */}
      <section className="mt-6 rounded-xl border border-[#dce2e6] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History className="size-4 text-[#173d4a]" />
              <h2 className="text-lg font-semibold text-[#0c1928]">
                Retratos Mensais de Cartão (Histórico Pontual)
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#52616a]">
              Capturas históricas pontuais por competência (<span className="font-mono">capturedAt</span>
              ). Funcionam exclusivamente como registro de conferência e não alteram o limite atual
              dos cartões nem quitam faturas em aberto.
            </p>
          </div>
          <span className="rounded-full bg-[#f0f3f5] px-2.5 py-1 text-xs font-semibold text-[#173d4a]">
            {sortedSnapshots.length} retrato(s)
          </span>
        </div>

        {sortedSnapshots.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#52616a]">
            Nenhum retrato mensal de cartão importado até o momento.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {sortedSnapshots.map((snap) => {
              const linkedCard = cardLookup.get(snap.accountId);
              const isUnlinked = Boolean(snap.isUnlinked || !linkedCard);
              const cardTitle = linkedCard
                ? `${linkedCard.institution} · ${linkedCard.name}`
                : snap.accountName || "Cartão não encontrado no cadastro";
              const expanded = Boolean(expandedSnapIds[snap.id]);

              return (
                <div
                  key={snap.id}
                  className="rounded-xl border border-[#dce2e6] bg-[#fafbfc] p-4 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-[#173d4a] px-2 py-0.5 text-xs font-bold text-white">
                          {snap.period}
                        </span>
                        <span className="text-sm font-semibold text-[#0c1928]">{cardTitle}</span>
                        {isUnlinked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            <AlertTriangle className="size-3" />
                            Sem vínculo
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#52616a]">
                        <span>Capturado em: {formatCapturedAtBR(snap.capturedAt)}</span>
                        {snap.closingDate && (
                          <span>Fechamento: {formatDateBR(snap.closingDate)}</span>
                        )}
                        {snap.dueDate && <span>Vencimento: {formatDateBR(snap.dueDate)}</span>}
                        {isUnlinked && snap.accountId && (
                          <span className="font-mono text-[11px]">
                            ID origem: {snap.accountId}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleSnapshot(snap.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-1.5 text-xs font-semibold text-[#173d4a] hover:bg-[#f0f3f5]"
                    >
                      {snap.transactions.length} lançamento(s)
                      {expanded ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-lg border border-[#edf1f3] bg-white p-2.5">
                      <div className="text-[#52616a]">Fatura na captura</div>
                      <div className="tabular-nums mt-0.5 font-bold text-[#0c1928]">
                        {snap.invoiceCents !== null ? formatBRL(snap.invoiceCents) : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#edf1f3] bg-white p-2.5">
                      <div className="text-[#52616a]">Limite total (época)</div>
                      <div className="tabular-nums mt-0.5 font-bold text-[#0c1928]">
                        {snap.totalLimitCents !== null ? formatBRL(snap.totalLimitCents) : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#edf1f3] bg-white p-2.5">
                      <div className="text-[#52616a]">Utilizado (época)</div>
                      <div className="tabular-nums mt-0.5 font-bold text-[#dc2626]">
                        {snap.usedLimitCents !== null ? formatBRL(snap.usedLimitCents) : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#edf1f3] bg-white p-2.5">
                      <div className="text-[#52616a]">Disponível (época)</div>
                      <div className="tabular-nums mt-0.5 font-bold text-[#16a34a]">
                        {snap.availableLimitCents !== null
                          ? formatBRL(snap.availableLimitCents)
                          : "—"}
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 rounded-lg border border-[#e5eaee] bg-white p-3">
                      {snap.transactions.length === 0 ? (
                        <p className="text-center text-xs text-[#52616a]">
                          Sem lançamentos detalhados neste retrato.
                        </p>
                      ) : (
                        <div className="max-h-64 divide-y divide-[#edf1f3] overflow-y-auto pr-1">
                          {snap.transactions.map((tx) => {
                            const amountCents = Math.round(tx.amount * 100);
                            const isCredit = amountCents < 0;
                            return (
                              <div
                                key={tx.id}
                                className="flex items-center justify-between gap-3 py-2 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium text-[#0c1928]">
                                    {tx.description}
                                  </div>
                                  <div className="text-[11px] text-[#52616a]">
                                    {tx.date ? formatDateBR(tx.date) : "—"}
                                    {tx.category ? ` · ${tx.category}` : ""}
                                  </div>
                                </div>
                                <div
                                  className={`tabular-nums shrink-0 font-semibold ${
                                    isCredit ? "text-[#16a34a]" : "text-[#0c1928]"
                                  }`}
                                >
                                  {isCredit ? "− " : ""}
                                  {formatBRL(Math.abs(amountCents))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: Bank */}
      {bankOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0c1928]">Nova Conta Bancária</h3>
            <form onSubmit={submitBank} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Instituição</label>
                <input
                  value={bankInst}
                  onChange={(e) => setBankInst(e.target.value)}
                  placeholder="Ex.: Banco Inter"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Nome da conta</label>
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Ex.: Conta Digital"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Final</label>
                  <input
                    value={bankNum}
                    onChange={(e) => setBankNum(e.target.value)}
                    placeholder="1234"
                    maxLength={4}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Saldo inicial (R$)</label>
                  <input
                    value={bankBal}
                    onChange={(e) => setBankBal(e.target.value)}
                    placeholder="0,00"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBankOpen(false)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
                >
                  Adicionar conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Card */}
      {cardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0c1928]">Novo Cartão de Crédito</h3>
            <form onSubmit={submitCard} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Instituição</label>
                  <input
                    value={cardInst}
                    onChange={(e) => setCardInst(e.target.value)}
                    placeholder="Ex.: Nubank"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Bandeira</label>
                  <select
                    value={cardBrand}
                    onChange={(e) => setCardBrand(e.target.value as CardBrand)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                  >
                    {["MASTERCARD", "VISA", "ELO", "AMEX", "HIPERCARD"].map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Apelido do cartão</label>
                <input
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Ex.: Platinum"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Final (4 dígitos)</label>
                  <input
                    value={cardNum}
                    onChange={(e) => setCardNum(e.target.value)}
                    maxLength={4}
                    placeholder="8899"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Limite (R$)</label>
                  <input
                    value={cardLimit}
                    onChange={(e) => setCardLimit(e.target.value)}
                    placeholder="15000,00"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCardOpen(false)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
                >
                  Adicionar cartão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
