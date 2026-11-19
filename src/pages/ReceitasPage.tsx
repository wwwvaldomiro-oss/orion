import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Download, FileText, Plus, QrCode } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useOrion } from "@/store/orionContext";
import { formatBRL, formatDateBR, parseBRL, todayBR } from "@/lib/domain/money";
import {
  CONTRACT_STATUSES,
  REVENUE_CATEGORIES,
  derivedContractStatus,
  installmentPlan,
  type MonthlyCorrectionIndex,
} from "@/lib/domain/contracts";
import { buildContractQuote, downloadBlob, generateInvoicePdf } from "@/lib/domain/invoice";
import type { CorrectionIndex, RevenueContract, RevenueEntry } from "@/types/orion";

type Tab = "sources" | "annual" | "contracts" | "history";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function ReceitasPage() {
  const {
    state,
    addRevenueSource,
    receiveRevenueEntry,
    createRevenueContract,
    updateContractStatus,
  } = useOrion();

  const today = todayBR();
  const [tab, setTab] = useState<Tab>("sources");
  const [year, setYear] = useState(2026);
  const [selectedContractId, setSelectedContractId] = useState<string>(
    state.revenueContracts[0]?.id ?? "",
  );

  // Add source modal
  const [sourceOpen, setSourceOpen] = useState(false);
  const [srcTitle, setSrcTitle] = useState("");
  const [srcCategory, setSrcCategory] = useState<string>(REVENUE_CATEGORIES[0]);
  const [srcAmount, setSrcAmount] = useState("");
  const [srcDueDay, setSrcDueDay] = useState("10");
  const [srcRecurrence, setSrcRecurrence] = useState<"monthly" | "single">("monthly");

  // Receive entry modal
  const [receiveTarget, setReceiveTarget] = useState<RevenueEntry | null>(null);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [receiveDate, setReceiveDate] = useState(today);
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveAccountId, setReceiveAccountId] = useState("");

  // New contract modal
  const [contractOpen, setContractOpen] = useState(false);
  const [ctrTitle, setCtrTitle] = useState("");
  const [ctrBuyer, setCtrBuyer] = useState("");
  const [ctrCpf, setCtrCpf] = useState("");
  const [ctrTotal, setCtrTotal] = useState("");
  const [ctrDown, setCtrDown] = useState("0,00");
  const [ctrCount, setCtrCount] = useState("4");
  const [ctrFirstDue, setCtrFirstDue] = useState("2026-12-10");
  const [ctrIndex, setCtrIndex] = useState<CorrectionIndex>("IPCA");
  const [ctrCustomRate, setCtrCustomRate] = useState("0.5");

  // Invoice preview state
  const [invoicePaymentDate, setInvoicePaymentDate] = useState(today);
  const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<string[]>([]);
  const [sgsSeries, setSgsSeries] = useState<{ observations: MonthlyCorrectionIndex[]; source: string }>({
    observations: [],
    source: "BCB SGS",
  });
  const [generatedInvoice, setGeneratedInvoice] = useState<{
    qr: string;
    payload: string;
    blob: Blob;
    total: number;
  } | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const selectedContract = useMemo(
    () => state.revenueContracts.find((c) => c.id === selectedContractId) ?? state.revenueContracts[0],
    [state.revenueContracts, selectedContractId],
  );

  const contractId = selectedContract?.id;
  const contractIndex = selectedContract?.correctionIndex;

  useEffect(() => {
    if (!contractId || !contractIndex) return;
    if (contractIndex === "IPCA" || contractIndex === "IGP-M") {
      fetch(`/api/sgs/${encodeURIComponent(contractIndex)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error("SGS indisponível");
          return (await r.json()) as { observations?: MonthlyCorrectionIndex[]; source?: string };
        })
        .then((d) => {
          setSgsSeries({
            observations: d.observations ?? [],
            source: d.source ?? contractIndex,
          });
        })
        .catch(() => {
          setSgsSeries({ observations: [], source: `${contractIndex} indisponível` });
        });
    }
    setGeneratedInvoice(null);
    const openIds = state.revenueEntries
      .filter((e) => e.contractId === contractId && !e.receivedDate)
      .map((e) => e.id);
    setSelectedInstallmentIds(openIds.slice(0, 1));
  }, [contractId, contractIndex, state.revenueEntries]);

  const availableYears = useMemo(() => {
    const set = new Set<number>([2025, 2026, 2027]);
    for (const y of state.annualYears) set.add(y.year);
    for (const e of state.revenueEntries) {
      const y = Number(e.dueDate.slice(0, 4));
      if (Number.isFinite(y) && y > 2000) set.add(y);
    }
    return [...set].sort((a, b) => a - b);
  }, [state.annualYears, state.revenueEntries]);

  const bankNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of state.banks) map.set(b.id, `${b.institution} · ${b.name}`);
    return map;
  }, [state.banks]);

  const revenueEntryById = useMemo(() => {
    const map = new Map<string, RevenueEntry>();
    for (const e of state.revenueEntries) map.set(e.id, e);
    return map;
  }, [state.revenueEntries]);

  const yearEntries = useMemo(
    () =>
      state.revenueEntries
        .filter((e) => e.dueDate.startsWith(`${year}-`))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [state.revenueEntries, year],
  );

  const summary = useMemo(() => {
    return yearEntries.reduce(
      (acc, e) => ({
        expected: acc.expected + e.expectedCents,
        received: acc.received + (e.receivedCents ?? 0),
        pending: acc.pending + (e.receivedDate ? 0 : e.expectedCents),
        overdue: acc.overdue + (!e.receivedDate && e.dueDate < today ? e.expectedCents : 0),
      }),
      { expected: 0, received: 0, pending: 0, overdue: 0 },
    );
  }, [yearEntries, today]);

  // Group entries by source/contract for annual grid
  const annualRows = useMemo(() => {
    const map = new Map<string, { label: string; months: Record<string, RevenueEntry[]> }>();
    for (const e of yearEntries) {
      const key = e.sourceId ?? e.contractId ?? e.title;
      const existing = map.get(key) ?? {
        label: e.contractId
          ? state.revenueContracts.find((c) => c.id === e.contractId)?.title ?? e.title
          : e.title,
        months: {},
      };
      const mKey = e.dueDate.slice(5, 7);
      existing.months[mKey] = [...(existing.months[mKey] ?? []), e];
      map.set(key, existing);
    }
    return [...map.entries()].map(([id, data]) => ({ id, ...data }));
  }, [yearEntries, state.revenueContracts]);

  const receivedHistory = useMemo(
    () =>
      state.revenueEntries
        .filter((e) => Boolean(e.receivedDate))
        .sort((a, b) => (b.receivedDate ?? "").localeCompare(a.receivedDate ?? "")),
    [state.revenueEntries],
  );

  function openReceiveModal(entry: RevenueEntry) {
    setReceiveTarget(entry);
    setReceiveAmount(((entry.receivedCents ?? entry.expectedCents) / 100).toFixed(2).replace(".", ","));
    setReceiveDate(entry.receivedDate ?? today);
    setReceiveNote(entry.note ?? "");
    setReceiveAccountId(entry.accountId ?? "");
  }

  function submitReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receiveTarget) return;
    const cents = parseBRL(receiveAmount);
    if (!cents || cents <= 0) {
      toast.error("Informe um valor recebido válido.");
      return;
    }
    const chosenAccount = receiveAccountId.trim() ? receiveAccountId.trim() : null;
    void receiveRevenueEntry(
      receiveTarget.id,
      cents,
      receiveDate,
      receiveNote.trim() || undefined,
      chosenAccount,
    );
    setReceiveTarget(null);
    toast.success("Recebimento confirmado e registrado no histórico.");
  }

  function submitNewSource(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBRL(srcAmount);
    const day = Math.min(31, Math.max(1, Number(srcDueDay) || 1));
    if (!srcTitle.trim() || !cents || cents <= 0) {
      toast.error("Preencha título e valor esperado.");
      return;
    }
    addRevenueSource(
      {
        title: srcTitle.trim(),
        category: srcCategory,
        expectedCents: cents,
        dueDay: day,
        recurrence: srcRecurrence,
        active: true,
      },
      year,
    );
    setSourceOpen(false);
    setSrcTitle("");
    setSrcAmount("");
    toast.success("Fonte de receita cadastrada.");
  }

  const contractPlanPreview = useMemo(() => {
    const total = parseBRL(ctrTotal) ?? 0;
    const down = parseBRL(ctrDown) ?? 0;
    const count = Number(ctrCount) || 0;
    if (total <= 0 || count < 1 || down >= total) return null;
    try {
      return installmentPlan(total, down, "count", count, "last");
    } catch {
      return null;
    }
  }, [ctrTotal, ctrDown, ctrCount]);

  function submitNewContract(e: React.FormEvent) {
    e.preventDefault();
    const total = parseBRL(ctrTotal);
    const down = parseBRL(ctrDown) ?? 0;
    const count = Number(ctrCount);
    if (!ctrTitle.trim() || !ctrBuyer.trim() || !total || !Number.isInteger(count) || count < 1) {
      toast.error("Preencha título, pagador, valor total e parcelas.");
      return;
    }
    try {
      const plan = installmentPlan(total, down, "count", count, "last");
      createRevenueContract(
        {
          title: ctrTitle.trim(),
          buyer: ctrBuyer.trim(),
          cpf: ctrCpf.trim() || "—",
          phone: "—",
          email: "—",
          city: state.profile.city,
          state: state.profile.state,
          address: "—",
          postalCode: "—",
          totalCents: total,
          downPaymentCents: down,
          interestPercent: 1,
          finePercent: 2,
          correctionIndex: ctrIndex,
          ...(ctrIndex === "Personalizado" ? { customRatePercent: Number(ctrCustomRate) || 0 } : {}),
        },
        plan.plan,
        ctrFirstDue,
      );
      setContractOpen(false);
      setCtrTitle("");
      setCtrBuyer("");
      setCtrTotal("");
      setTab("contracts");
      toast.success("Contrato parcelado criado com cálculo exato em centavos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar contrato.");
    }
  }

  const contractInstallments = useMemo(
    () =>
      selectedContract
        ? state.revenueEntries
            .filter((e) => e.contractId === selectedContract.id)
            .sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0))
        : [],
    [state.revenueEntries, selectedContract],
  );

  async function handleGenerateInvoice() {
    if (!selectedContract) return;
    const chosen = contractInstallments.filter((e) => selectedInstallmentIds.includes(e.id));
    if (chosen.length === 0) {
      toast.error("Selecione ao menos uma parcela para gerar a fatura.");
      return;
    }
    setGeneratingPdf(true);
    try {
      const quote = buildContractQuote(
        selectedContract,
        chosen,
        invoicePaymentDate,
        sgsSeries.observations,
        sgsSeries.source,
      );
      const pdfData = await generateInvoicePdf(quote, state.pixRecipient);
      setGeneratedInvoice({ ...pdfData, total: quote.total });
      toast.success("Fatura PDF e QR Code Pix prontos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar fatura.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <AppShell
      title="Receitas & Contratos"
      subtitle="Fontes de renda, grade anual de recebíveis, contratos parcelados e faturas Pix"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSourceOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Nova receita
          </button>
          <button
            type="button"
            onClick={() => setContractOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Novo contrato
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
            <div className="text-xs font-semibold text-[#52616a] uppercase">Previsto ({year})</div>
            <div className="tabular-nums mt-1.5 text-xl font-bold text-[#0c1928]">
              {formatBRL(summary.expected)}
            </div>
          </div>
          <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
            <div className="text-xs font-semibold text-[#52616a] uppercase">Recebido ({year})</div>
            <div className="tabular-nums mt-1.5 text-xl font-bold text-[#16a34a]">
              {formatBRL(summary.received)}
            </div>
          </div>
          <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
            <div className="text-xs font-semibold text-[#52616a] uppercase">A Receber</div>
            <div className="tabular-nums mt-1.5 text-xl font-bold text-[#173d4a]">
              {formatBRL(summary.pending)}
            </div>
          </div>
          <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
            <div className="text-xs font-semibold text-[#52616a] uppercase">Em Atraso</div>
            <div className="tabular-nums mt-1.5 text-xl font-bold text-[#dc2626]">
              {formatBRL(summary.overdue)}
            </div>
          </div>
        </section>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-[#edf1f3] p-1">
            {(
              [
                ["sources", "Fontes & Lançamentos"],
                ["annual", "Contas a Receber (Grade Anual)"],
                ["contracts", "Contratos Parcelados & Pix"],
                ["history", "Histórico de Recebimentos"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  tab === id ? "bg-white text-[#0c1928] shadow-xs" : "text-[#52616a] hover:text-[#0c1928]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Exercício"
            className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs font-semibold"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                Exercício {y}
              </option>
            ))}
          </select>
        </div>

        {/* Tab 1: Sources & Entries */}
        {tab === "sources" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
              <h2 className="text-base font-semibold text-[#0c1928]">Fontes Cadastradas</h2>
              <div className="mt-3 divide-y divide-[#edf1f3]">
                {state.revenueSources.map((s) => (
                  <div key={s.id} className="py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#0c1928]">{s.title}</span>
                      <span className="tabular-nums font-bold text-[#173d4a]">
                        {formatBRL(s.expectedCents)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#52616a]">
                      {s.category} · Todo dia {s.dueDay} · {s.recurrence === "monthly" ? "Mensal" : "Avulsa"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#dce2e6] bg-white p-5 lg:col-span-2">
              <h2 className="text-base font-semibold text-[#0c1928]">Recebíveis em Aberto ({year})</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#dce2e6] text-xs text-[#52616a]">
                      <th className="py-2 pr-3">Descrição</th>
                      <th className="py-2 pr-3">Vencimento</th>
                      <th className="py-2 pr-3 text-right">Valor</th>
                      <th className="py-2 pr-3">Situação</th>
                      <th className="py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f3]">
                    {yearEntries
                      .filter((e) => !e.receivedDate)
                      .map((e) => {
                        const overdue = e.dueDate < today;
                        return (
                          <tr key={e.id} className="hover:bg-[#f7f8fa]">
                            <td className="py-2.5 pr-3">
                              <div className="font-medium text-[#0c1928]">{e.title}</div>
                              <div className="text-xs text-[#52616a]">{e.category}</div>
                            </td>
                            <td className="tabular-nums py-2.5 pr-3 text-xs text-[#52616a]">
                              {formatDateBR(e.dueDate)}
                            </td>
                            <td className="tabular-nums py-2.5 pr-3 text-right font-semibold">
                              {formatBRL(e.expectedCents)}
                            </td>
                            <td className="py-2.5 pr-3 text-xs font-semibold">
                              <span className={overdue ? "text-[#dc2626]" : "text-[#d97706]"}>
                                {overdue ? "Atrasada" : "A receber"}
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => openReceiveModal(e)}
                                className="rounded-md bg-[#173d4a] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0c1928]"
                              >
                                Confirmar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Annual Receivables Grid */}
        {tab === "annual" && (
          <div className="overflow-x-auto rounded-xl border border-[#dce2e6] bg-white p-4">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead>
                <tr className="border-b border-[#dce2e6] text-[#52616a]">
                  <th className="py-2 pr-3">Fonte / Contrato</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-1.5 py-2 text-right">
                      {m}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f3]">
                {annualRows.map((row) => {
                  let rowSum = 0;
                  return (
                    <tr key={row.id} className="hover:bg-[#f7f8fa]">
                      <td className="py-2.5 pr-3 font-semibold text-[#0c1928]">{row.label}</td>
                      {MONTHS.map((_, i) => {
                        const mKey = String(i + 1).padStart(2, "0");
                        const list = row.months[mKey] ?? [];
                        const totalCents = list.reduce((s, e) => s + e.expectedCents, 0);
                        rowSum += totalCents;
                        const allDone = list.length > 0 && list.every((e) => Boolean(e.receivedDate));
                        const firstOpen = list.find((e) => !e.receivedDate);
                        return (
                          <td key={mKey} className="tabular-nums px-1.5 py-2 text-right">
                            {list.length === 0 ? (
                              <span className="text-[#9aa5ad]">—</span>
                            ) : firstOpen ? (
                              <button
                                type="button"
                                onClick={() => openReceiveModal(firstOpen)}
                                className="rounded px-1 py-0.5 font-medium text-[#d97706] hover:bg-[#fef3c7]"
                                title="Clique para confirmar recebimento"
                              >
                                {formatBRL(totalCents)}
                              </button>
                            ) : (
                              <span className={allDone ? "font-semibold text-[#16a34a]" : ""}>
                                {formatBRL(totalCents)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="tabular-nums py-2.5 pl-3 text-right font-bold text-[#0c1928]">
                        {formatBRL(rowSum)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Installment Contracts + PDF/Pix Invoice */}
        {tab === "contracts" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-3">
              {state.revenueContracts.map((c) => {
                const status = derivedContractStatus(c, state.revenueEntries, today);
                const selected = selectedContract?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedContractId(c.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? "border-[#173d4a] bg-[#f2f6f7]"
                        : "border-[#dce2e6] bg-white hover:bg-[#f7f8fa]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-[#0c1928]">{c.title}</div>
                      <span
                        className={`text-xs font-semibold ${
                          status === "Concluído"
                            ? "text-[#16a34a]"
                            : status === "Atrasado"
                              ? "text-[#dc2626]"
                              : "text-[#173d4a]"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#52616a]">{c.buyer}</div>
                    <div className="tabular-nums mt-2 text-sm font-bold text-[#0c1928]">
                      Total: {formatBRL(c.totalCents)} · Índice: {c.correctionIndex}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedContract && (
              <div className="space-y-5 rounded-xl border border-[#dce2e6] bg-white p-5 lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f3] pb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-[#0c1928]">
                      {selectedContract.title}
                    </h2>
                    <p className="mt-0.5 text-xs text-[#52616a]">
                      Pagador: {selectedContract.buyer} · Juros {selectedContract.interestPercent}% a.m. · Multa{" "}
                      {selectedContract.finePercent}% · Correção {selectedContract.correctionIndex}
                    </p>
                  </div>
                  <select
                    value={selectedContract.status}
                    onChange={(e) =>
                      updateContractStatus(
                        selectedContract.id,
                        e.target.value as RevenueContract["status"],
                      )
                    }
                    className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-semibold"
                  >
                    {CONTRACT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#dce2e6] text-[#52616a]">
                        <th className="py-2 pr-2">Fatura</th>
                        <th className="py-2 pr-2">Parcela</th>
                        <th className="py-2 pr-2">Vencimento</th>
                        <th className="py-2 pr-2 text-right">Valor</th>
                        <th className="py-2 pr-2">Status</th>
                        <th className="py-2 text-right">Baixa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1f3]">
                      {contractInstallments.map((inst) => {
                        const paid = Boolean(inst.receivedDate);
                        const overdue = !paid && inst.dueDate < today;
                        const checked = selectedInstallmentIds.includes(inst.id);
                        return (
                          <tr key={inst.id}>
                            <td className="py-2 pr-2">
                              {!paid && (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setSelectedInstallmentIds((prev) =>
                                      e.target.checked
                                        ? [...prev, inst.id]
                                        : prev.filter((x) => x !== inst.id),
                                    )
                                  }
                                  className="size-4 accent-[#173d4a]"
                                />
                              )}
                            </td>
                            <td className="py-2 pr-2 font-semibold">
                              Parcela {inst.installmentNumber}
                            </td>
                            <td className="tabular-nums py-2 pr-2 text-[#52616a]">
                              {formatDateBR(inst.dueDate)}
                            </td>
                            <td className="tabular-nums py-2 pr-2 text-right font-semibold">
                              {formatBRL(inst.receivedCents ?? inst.expectedCents)}
                            </td>
                            <td className="py-2 pr-2 font-semibold">
                              <span
                                className={
                                  paid
                                    ? "text-[#16a34a]"
                                    : overdue
                                      ? "text-[#dc2626]"
                                      : "text-[#d97706]"
                                }
                              >
                                {paid
                                  ? `Pago ${formatDateBR(inst.receivedDate)}`
                                  : overdue
                                    ? "Atrasada"
                                    : "Em aberto"}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              {!paid ? (
                                <button
                                  type="button"
                                  onClick={() => openReceiveModal(inst)}
                                  className="rounded bg-[#173d4a] px-2 py-1 text-[11px] font-semibold text-white"
                                >
                                  Receber
                                </button>
                              ) : (
                                <CheckCircle2 className="ml-auto size-4 text-[#16a34a]" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Invoice PDF + Pix generator */}
                <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#0c1928]">
                        <QrCode className="size-4 text-[#173d4a]" /> Gerar Fatura PDF com Pix
                      </div>
                      <p className="text-xs text-[#52616a]">
                        Calcula encargos proporcionais até a data prevista usando{" "}
                        {selectedContract.correctionIndex} ({sgsSeries.source})
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-[11px] text-[#52616a]">Data pagamento</label>
                        <input
                          type="date"
                          value={invoicePaymentDate}
                          onChange={(e) => setInvoicePaymentDate(e.target.value)}
                          className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={generatingPdf}
                        onClick={handleGenerateInvoice}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-60"
                      >
                        <FileText className="size-3.5" />
                        {generatingPdf ? "Gerando..." : "Gerar Fatura Pix"}
                      </button>
                    </div>
                  </div>

                  {generatedInvoice && (
                    <div className="mt-4 flex flex-col items-start gap-4 border-t border-[#dce2e6] pt-4 sm:flex-row sm:items-center">
                      <img
                        src={generatedInvoice.qr}
                        alt="QR Code Pix da fatura"
                        className="size-28 rounded-lg border border-[#dce2e6] bg-white p-1"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="tabular-nums text-base font-bold text-[#0c1928]">
                          Total atualizado: {formatBRL(generatedInvoice.total)}
                        </div>
                        <div className="truncate rounded-md border border-[#dce2e6] bg-white px-2.5 py-1.5 font-mono text-[11px] text-[#52616a]">
                          {generatedInvoice.payload}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(generatedInvoice.payload);
                              toast.success("Código Pix copia e cola copiado!");
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#f0f3f5]"
                          >
                            <Copy className="size-3.5" /> Copiar Pix
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadBlob(
                                generatedInvoice.blob,
                                `fatura-${selectedContract.id}.pdf`,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#b99555] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                          >
                            <Download className="size-3.5" /> Baixar PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Receipt History */}
        {tab === "history" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
              <h2 className="text-base font-semibold text-[#0c1928]">
                Histórico Imutável de Recebimentos
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#dce2e6] text-xs text-[#52616a]">
                      <th className="py-2 pr-3">Recebido em</th>
                      <th className="py-2 pr-3">Descrição</th>
                      <th className="py-2 pr-3">Conta destino</th>
                      <th className="py-2 pr-3">Categoria</th>
                      <th className="py-2 pr-3 text-right">Previsto</th>
                      <th className="py-2 text-right">Recebido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f3]">
                    {receivedHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-[#f7f8fa]">
                        <td className="tabular-nums py-2.5 pr-3 text-xs text-[#52616a]">
                          {formatDateBR(h.receivedDate)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-[#0c1928]">{h.title}</div>
                          {h.note && <div className="text-xs text-[#52616a]">{h.note}</div>}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-[#52616a]">
                          {h.accountId
                            ? (bankNameById.get(h.accountId) ?? h.accountId)
                            : "Conta não informada"}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-[#52616a]">{h.category}</td>
                        <td className="tabular-nums py-2.5 pr-3 text-right text-xs text-[#52616a]">
                          {formatBRL(h.expectedCents)}
                        </td>
                        <td className="tabular-nums py-2.5 text-right font-semibold text-[#16a34a]">
                          {formatBRL(h.receivedCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {state.revenueEvents.length > 0 && (
              <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
                <h2 className="text-base font-semibold text-[#0c1928]">
                  Auditoria de Eventos de Receita ({state.revenueEvents.length})
                </h2>
                <p className="mt-0.5 text-xs text-[#52616a]">
                  Trilha preservada de recebimentos e correções registrados no histórico.
                </p>
                <div className="mt-3 divide-y divide-[#edf1f3] text-xs">
                  {state.revenueEvents.map((ev) => {
                    const entry = revenueEntryById.get(ev.entryId);
                    return (
                      <div key={ev.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#0c1928]">
                            {entry?.title ?? `Lançamento ${ev.entryId.slice(0, 8)}`} ·{" "}
                            <span className="text-[#173d4a] uppercase">{ev.kind}</span>
                          </div>
                          <div className="text-[#52616a]">
                            {ev.reason}
                            {ev.afterData?.note ? ` · ${ev.afterData.note}` : ""}
                          </div>
                        </div>
                        <div className="tabular-nums text-right">
                          {ev.afterData?.receivedCents !== undefined &&
                            ev.afterData.receivedCents !== null && (
                              <div className="font-semibold text-[#16a34a]">
                                {formatBRL(ev.afterData.receivedCents)}
                              </div>
                            )}
                          <div className="text-[11px] text-[#7a8994]">
                            {ev.afterData?.receivedDate
                              ? formatDateBR(ev.afterData.receivedDate)
                              : ev.eventCreatedAt.slice(0, 10)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Confirm Receipt */}
      {receiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0c1928]">Confirmar Recebimento</h3>
            <p className="mt-1 text-xs text-[#52616a]">{receiveTarget.title}</p>
            <form onSubmit={submitReceive} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Valor (R$)</label>
                  <input
                    value={receiveAmount}
                    onChange={(e) => setReceiveAmount(e.target.value)}
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Data</label>
                  <input
                    type="date"
                    value={receiveDate}
                    onChange={(e) => setReceiveDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">
                  Conta que recebeu o valor
                </label>
                <select
                  value={receiveAccountId}
                  onChange={(e) => setReceiveAccountId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm"
                >
                  <option value="">Conta não informada</option>
                  {state.banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.institution} · {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Observação</label>
                <input
                  value={receiveNote}
                  onChange={(e) => setReceiveNote(e.target.value)}
                  placeholder="Opcional"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReceiveTarget(null)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
                >
                  Confirmar baixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Revenue Source */}
      {sourceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0c1928]">Nova Fonte de Receita</h3>
            <form onSubmit={submitNewSource} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Título</label>
                <input
                  value={srcTitle}
                  onChange={(e) => setSrcTitle(e.target.value)}
                  placeholder="Ex.: Aluguel Apartamento"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Valor (R$)</label>
                  <input
                    value={srcAmount}
                    onChange={(e) => setSrcAmount(e.target.value)}
                    placeholder="2500,00"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Dia vencimento</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={srcDueDay}
                    onChange={(e) => setSrcDueDay(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Categoria</label>
                  <select
                    value={srcCategory}
                    onChange={(e) => setSrcCategory(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                  >
                    {REVENUE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Recorrência</label>
                  <select
                    value={srcRecurrence}
                    onChange={(e) => setSrcRecurrence(e.target.value as "monthly" | "single")}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                  >
                    <option value="monthly">Mensal</option>
                    <option value="single">Única</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSourceOpen(false)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
                >
                  Salvar receita
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Installment Contract */}
      {contractOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0c1928]">Novo Contrato Parcelado</h3>
            <form onSubmit={submitNewContract} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Objeto / Título</label>
                  <input
                    value={ctrTitle}
                    onChange={(e) => setCtrTitle(e.target.value)}
                    placeholder="Ex.: Consultoria ERP"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Pagador</label>
                  <input
                    value={ctrBuyer}
                    onChange={(e) => setCtrBuyer(e.target.value)}
                    placeholder="Nome ou razão social"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Valor total (R$)</label>
                  <input
                    value={ctrTotal}
                    onChange={(e) => setCtrTotal(e.target.value)}
                    placeholder="1000,00"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Entrada (R$)</label>
                  <input
                    value={ctrDown}
                    onChange={(e) => setCtrDown(e.target.value)}
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Parcelas</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={ctrCount}
                    onChange={(e) => setCtrCount(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">1º vencimento</label>
                  <input
                    type="date"
                    value={ctrFirstDue}
                    onChange={(e) => setCtrFirstDue(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Índice correção</label>
                  <select
                    value={ctrIndex}
                    onChange={(e) => setCtrIndex(e.target.value as CorrectionIndex)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2 text-sm"
                  >
                    <option value="Sem correção">Sem correção</option>
                    <option value="IPCA">IPCA (BCB SGS)</option>
                    <option value="IGP-M">IGP-M (BCB SGS)</option>
                    <option value="Personalizado">Personalizado</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">CPF/CNPJ</label>
                  <input
                    value={ctrCpf}
                    onChange={(e) => setCtrCpf(e.target.value)}
                    placeholder="Opcional"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>
              </div>
              {ctrIndex === "Personalizado" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">
                    Taxa personalizada (%)
                  </label>
                  <input
                    value={ctrCustomRate}
                    onChange={(e) => setCtrCustomRate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>
              )}

              {contractPlanPreview && (
                <div className="rounded-lg border border-[#dce2e6] bg-[#f7f8fa] p-3 text-xs text-[#0c1928]">
                  Saldo financiado: <b>{formatBRL(contractPlanPreview.balance)}</b> ·{" "}
                  {contractPlanPreview.count}x de <b>{formatBRL(contractPlanPreview.base)}</b>
                  {contractPlanPreview.remainder > 0 &&
                    ` (última parcela com ajuste de ${formatBRL(contractPlanPreview.remainder)})`}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setContractOpen(false)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
                >
                  Criar contrato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
