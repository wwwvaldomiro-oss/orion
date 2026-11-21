import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Download, Layers, Loader2, Paperclip, Plus, Printer, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { FinancialHistorySection } from "@/components/finance/FinancialHistorySection";
import { HistoryCorrectionModal } from "@/components/finance/HistoryCorrectionModal";
import { useOrion } from "@/store/orionContext";
import {
  autoNote,
  expensePaymentAdjustment,
  formatBRL,
  formatDateBR,
  parseBRL,
  todayBR,
} from "@/lib/domain/money";
import { EXPENSE_CATEGORIES } from "@/lib/domain/contracts";
import { downloadBlob } from "@/lib/domain/invoice";
import {
  buildPaymentHistoryRows,
  suggestOpenFinanceMatches,
  type UnifiedHistoryRow,
} from "@/lib/domain/ledgerHistory";
import type {
  AnnualExpenseRow,
  MonthlyBill,
  PayableInstallment,
  PaymentAttachmentRef,
} from "@/types/orion";

type Tab = "monthly" | "annual" | "contracts" | "history";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatContractDetailValue(key: string, val: number | string | boolean | null): string {
  if (val === null) return "—";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (typeof val === "number") {
    if (key.endsWith("_cents")) return formatBRL(val);
    return val.toLocaleString("pt-BR");
  }
  return String(val);
}

export function DespesasPage() {
  const {
    state,
    payMonthlyBill,
    payPayableInstallment,
    addMonthlyBill,
    updateAnnualCell,
    addAnnualCreditor,
    uploadHistoryAttachment,
  } = useOrion();
  const today = todayBR();
  const [tab, setTab] = useState<Tab>("annual");
  const [period, setPeriod] = useState("2026-11");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid">("all");
  const [year, setYear] = useState(2026);
  const [selectedPayableContractId, setSelectedPayableContractId] = useState<string>(
    state.payableContracts[0]?.id ?? "",
  );

  // Settled item correction modal shortcut
  const [settledEditRow, setSettledEditRow] = useState<UnifiedHistoryRow | null>(null);

  // Pay monthly bill / installment modal
  const [payTarget, setPayTarget] = useState<MonthlyBill | null>(null);
  const [payInstallmentTarget, setPayInstallmentTarget] = useState<PayableInstallment | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today);
  const [payQuits, setPayQuits] = useState(true);
  const [payDiscount, setPayDiscount] = useState("0,00");
  const [paySurcharge, setPaySurcharge] = useState("0,00");
  const [payEarlyPayoff, setPayEarlyPayoff] = useState(false);
  const [payNote, setPayNote] = useState("");
  const [payAccountId, setPayAccountId] = useState<string>("");
  const [payBankTxId, setPayBankTxId] = useState<string>("");
  const [payAttachments, setPayAttachments] = useState<PaymentAttachmentRef[]>([]);
  const [uploadingPayAtt, setUploadingPayAtt] = useState(false);
  const [submittingPay, setSubmittingPay] = useState(false);

  // Add monthly bill modal
  const [billOpen, setBillOpen] = useState(false);
  const [billCreditor, setBillCreditor] = useState("");
  const [billDescription, setBillDescription] = useState("");
  const [billCategory, setBillCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [billDueDate, setBillDueDate] = useState(today);
  const [billAmount, setBillAmount] = useState("");
  const [billIsCardInvoice, setBillIsCardInvoice] = useState(false);
  const [billCardId, setBillCardId] = useState("");

  // Add annual creditor modal
  const [creditorOpen, setCreditorOpen] = useState(false);
  const [credName, setCredName] = useState("");
  const [credCat, setCredCat] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [credDay, setCredDay] = useState("10");
  const [credAmount, setCredAmount] = useState("");

  // Edit annual cell modal
  const [cellEdit, setCellEdit] = useState<{ row: AnnualExpenseRow; monthKey: string } | null>(
    null,
  );
  const [cellExpected, setCellExpected] = useState("");
  const [cellPaid, setCellPaid] = useState("");
  const [cellDate, setCellDate] = useState(today);
  const [cellSettled, setCellSettled] = useState(true);
  const [cellAccountId, setCellAccountId] = useState("");
  const [cellBankTxId, setCellBankTxId] = useState("");
  const [cellNote, setCellNote] = useState("");
  const [savingCell, setSavingCell] = useState(false);

  const availableYears = useMemo(() => {
    const set = new Set<number>([2025, 2026, 2027]);
    for (const y of state.annualYears) set.add(y.year);
    for (const r of state.annualExpenses) set.add(r.year);
    return [...set].sort((a, b) => a - b);
  }, [state.annualYears, state.annualExpenses]);

  const bankNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of state.banks) map.set(b.id, `${b.institution} · ${b.name}`);
    return map;
  }, [state.banks]);

  const billsByAnnualAndPeriod = useMemo(() => {
    const map = new Map<string, MonthlyBill[]>();
    for (const b of state.monthlyBills) {
      if (!b.sourceAnnualId) continue;
      const key = `${b.sourceAnnualId}:${b.period}`;
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return map;
  }, [state.monthlyBills]);

  const activePayableContract = useMemo(
    () =>
      state.payableContracts.find((c) => c.id === selectedPayableContractId) ??
      state.payableContracts[0],
    [state.payableContracts, selectedPayableContractId],
  );

  const activeContractInstallments = useMemo(() => {
    if (!activePayableContract) return [];
    return state.payableInstallments
      .filter((i) => i.contractId === activePayableContract.id)
      .sort((a, b) => a.number - b.number);
  }, [state.payableInstallments, activePayableContract]);

  const monthBills = useMemo(() => {
    return state.monthlyBills
      .filter((b) => b.period === period)
      .filter((b) => {
        if (statusFilter === "open") return !b.isSettled;
        if (statusFilter === "paid") return b.isSettled;
        return true;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [state.monthlyBills, period, statusFilter]);

  const monthTotals = useMemo(() => {
    const all = state.monthlyBills.filter((b) => b.period === period);
    return all.reduce(
      (acc, b) => ({
        expected: acc.expected + b.expectedCents,
        paid: acc.paid + (b.paidCents ?? 0),
        open: acc.open + (b.isSettled ? 0 : Math.max(0, b.expectedCents - (b.paidCents ?? 0))),
      }),
      { expected: 0, paid: 0, open: 0 },
    );
  }, [state.monthlyBills, period]);

  const annualRows = useMemo(
    () => state.annualExpenses.filter((r) => r.year === year),
    [state.annualExpenses, year],
  );

  const annualMonthTotals = useMemo(() => {
    return MONTHS.map((_, idx) => {
      const key = String(idx + 1).padStart(2, "0");
      return annualRows.reduce((s, r) => s + (r.months[key]?.expectedCents ?? 0), 0);
    });
  }, [annualRows]);

  const paymentHistoryRows = useMemo(() => buildPaymentHistoryRows(state), [state]);

  const parsedPayCents = parseBRL(payAmount) ?? 0;
  const openFinancePayMatches = useMemo(
    () =>
      suggestOpenFinanceMatches(
        state.transactions,
        "payment",
        payAccountId || null,
        parsedPayCents,
        payDate,
      ),
    [state.transactions, payAccountId, parsedPayCents, payDate],
  );

  const parsedCellPaidCents = parseBRL(cellPaid) ?? parseBRL(cellExpected) ?? 0;
  const openFinanceCellMatches = useMemo(
    () =>
      suggestOpenFinanceMatches(
        state.transactions,
        "payment",
        cellAccountId || null,
        parsedCellPaidCents,
        cellDate,
      ),
    [state.transactions, cellAccountId, parsedCellPaidCents, cellDate],
  );

  function openPayDialog(bill: MonthlyBill) {
    if (bill.isSettled) {
      const existingRow = paymentHistoryRows.find((r) => r.rawRefs.billId === bill.id);
      if (existingRow) {
        setSettledEditRow(existingRow);
        return;
      }
    }
    const alreadyPaid = bill.paidCents ?? 0;
    const remaining = Math.max(0, bill.expectedCents - alreadyPaid);
    setPayInstallmentTarget(null);
    setPayTarget(bill);
    setPayAmount((remaining / 100).toFixed(2).replace(".", ","));
    setPayDate(today);
    setPayQuits(true);
    setPayDiscount("0,00");
    setPaySurcharge("0,00");
    setPayEarlyPayoff(false);
    setPayNote(alreadyPaid > 0 ? "" : (bill.note ?? ""));
    setPayAccountId(bill.accountId ?? "");
    setPayBankTxId("");
    setPayAttachments([]);
  }

  function openPayInstallmentDialog(inst: PayableInstallment) {
    if (inst.isSettled) {
      const existingRow = paymentHistoryRows.find((r) => r.rawRefs.installmentId === inst.id);
      if (existingRow) {
        setSettledEditRow(existingRow);
        return;
      }
    }
    const alreadyPaid = inst.paidCents ?? 0;
    const remaining = Math.max(0, inst.expectedCents - alreadyPaid);
    setPayTarget(null);
    setPayInstallmentTarget(inst);
    setPayAmount((remaining / 100).toFixed(2).replace(".", ","));
    setPayDate(today);
    setPayQuits(true);
    setPayDiscount("0,00");
    setPaySurcharge("0,00");
    setPayEarlyPayoff(false);
    setPayNote(alreadyPaid > 0 ? "" : (inst.note ?? ""));
    setPayAccountId(inst.accountId ?? "");
    setPayBankTxId("");
    setPayAttachments([]);
  }

  async function handlePayAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const targetId = payTarget?.id ?? payInstallmentTarget?.id;
    if (!files.length || !targetId) return;
    setUploadingPayAtt(true);
    try {
      const uploaded: PaymentAttachmentRef[] = [];
      for (const f of files) {
        uploaded.push(await uploadHistoryAttachment(f, targetId));
      }
      setPayAttachments((prev) => [...prev, ...uploaded]);
      toast.success("Comprovante anexado ao pagamento.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar comprovante.");
    } finally {
      setUploadingPayAtt(false);
    }
  }

  async function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingPay) return;
    const target = payTarget ?? payInstallmentTarget;
    if (!target) return;
    const cents = parseBRL(payAmount);
    if (cents === null || cents < 0) {
      toast.error("Informe um valor pago válido.");
      return;
    }
    const discountCents = Math.max(0, parseBRL(payDiscount) ?? 0);
    const surchargeCents = Math.max(0, parseBRL(paySurcharge) ?? 0);
    const prevPaid = !target.isSettled ? (target.paidCents ?? 0) : 0;
    const totalAfter = prevPaid + cents;
    const finalNote =
      payNote.trim() ||
      autoNote(target.dueDate, payDate, target.expectedCents, totalAfter, payQuits);
    const chosenAccount = payAccountId.trim() ? payAccountId.trim() : null;
    const chosenBankTx = payBankTxId.trim() ? payBankTxId.trim() : null;
    const idempotencyKey = `pay-${target.id}-${Date.now()}`;

    setSubmittingPay(true);
    try {
      const opts = {
        discountCents,
        surchargeCents,
        bankTransactionId: chosenBankTx,
        attachments: payAttachments,
        isEarlyPayoff: payEarlyPayoff,
        idempotencyKey,
      };
      if (payTarget) {
        await payMonthlyBill(payTarget.id, cents, payDate, payQuits, finalNote, chosenAccount, opts);
        setPayTarget(null);
      } else if (payInstallmentTarget) {
        await payPayableInstallment(
          payInstallmentTarget.id,
          cents,
          payDate,
          payQuits,
          finalNote,
          chosenAccount,
          opts,
        );
        setPayInstallmentTarget(null);
      }
      toast.success("Pagamento registrado no histórico.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar pagamento.");
    } finally {
      setSubmittingPay(false);
    }
  }

  async function handleAddBill(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBRL(billAmount);
    if (!billCreditor.trim() || !cents || cents <= 0) {
      toast.error("Informe credor e valor.");
      return;
    }
    try {
      await addMonthlyBill({
        period: billDueDate.slice(0, 7),
        creditor: billCreditor.trim(),
        description: billDescription.trim() || undefined,
        category: billCategory,
        dueDate: billDueDate,
        expectedCents: cents,
        isCardInvoice: billIsCardInvoice || undefined,
        cardId: billIsCardInvoice && billCardId ? billCardId : undefined,
      });
      setBillOpen(false);
      setBillCreditor("");
      setBillDescription("");
      setBillAmount("");
      setBillIsCardInvoice(false);
      setBillCardId("");
      toast.success("Obrigação adicionada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar obrigação.");
    }
  }

  function handleAddCreditor(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBRL(credAmount);
    const day = Math.min(31, Math.max(1, Number(credDay) || 10));
    if (!credName.trim() || !cents || cents <= 0) {
      toast.error("Informe o nome do credor e o valor mensal.");
      return;
    }
    void addAnnualCreditor({
      year,
      creditor: credName.trim(),
      category: credCat,
      dueDay: day,
      expectedCents: cents,
    });
    setCreditorOpen(false);
    setCredName("");
    setCredAmount("");
    toast.success("Credor adicionado à grade anual.");
  }

  function openCellModal(row: AnnualExpenseRow, monthKey: string) {
    const cell = row.months[monthKey] ?? {
      expectedCents: 0,
      paidCents: null,
      paidDate: null,
      isSettled: false,
    };
    const linked = billsByAnnualAndPeriod.get(`${row.id}:${row.year}-${monthKey}`) ?? [];
    const primaryBill = linked[0];
    const safeExpected = cell.expectedCents ?? 0;
    setCellEdit({ row, monthKey });
    setCellExpected((safeExpected / 100).toFixed(2).replace(".", ","));
    setCellPaid(((cell.paidCents ?? safeExpected) / 100).toFixed(2).replace(".", ","));
    setCellDate(cell.paidDate ?? today);
    setCellSettled(cell.isSettled);
    setCellAccountId(primaryBill?.accountId ?? "");
    setCellBankTxId(primaryBill?.bankTransactionId ?? "");
    setCellNote(cell.note ?? primaryBill?.note ?? "");
    setSavingCell(false);
  }

  async function saveCellEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!cellEdit || savingCell) return;
    const exp = parseBRL(cellExpected);
    const paid = parseBRL(cellPaid);
    if (exp === null) {
      toast.error("Valor previsto inválido.");
      return;
    }
    setSavingCell(true);
    try {
      await updateAnnualCell(
        cellEdit.row.id,
        cellEdit.monthKey,
        {
          expectedCents: exp,
          paidCents: cellSettled ? (paid ?? exp) : null,
          paidDate: cellSettled ? cellDate : null,
          isSettled: cellSettled,
          ...(cellNote.trim() ? { note: cellNote.trim() } : {}),
        },
        {
          accountId: cellAccountId.trim() || null,
          bankTransactionId: cellBankTxId.trim() || null,
          idempotencyKey: `cell-${cellEdit.row.id}-${cellEdit.monthKey}-${Date.now()}`,
        },
      );
      setCellEdit(null);
      toast.success("Célula da grade anual atualizada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar célula.");
    } finally {
      setSavingCell(false);
    }
  }

  function exportCsv() {
    const lines = [
      "Credor;Categoria;Vencimento;Previsto;Pago;Status;Observacao",
      ...monthBills.map((b) =>
        [
          b.creditor,
          b.category,
          formatDateBR(b.dueDate),
          (b.expectedCents / 100).toFixed(2).replace(".", ","),
          b.paidCents !== null ? (b.paidCents / 100).toFixed(2).replace(".", ",") : "",
          b.isSettled ? "Quitado" : "Em aberto",
          b.note ?? "",
        ].join(";"),
      ),
    ];
    downloadBlob(
      new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
      `despesas-${period}.csv`,
    );
    toast.success("Arquivo CSV exportado.");
  }

  return (
    <AppShell
      title="Despesas"
      subtitle="Grade anual editável, controle mensal com quitação parcial e histórico de pagamentos"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/perfil"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] whitespace-nowrap"
          >
            <Upload className="size-3.5" /> Importar JSON
          </Link>
          {tab === "annual" ? (
            <>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#f0f3f5] whitespace-nowrap"
              >
                <Printer className="size-3.5" /> Imprimir A4
              </button>
              <button
                type="button"
                onClick={() => setCreditorOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] whitespace-nowrap"
              >
                <Plus className="size-3.5" /> Novo credor
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#f0f3f5] whitespace-nowrap"
              >
                <Download className="size-3.5" /> CSV
              </button>
              <button
                type="button"
                onClick={() => setBillOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] whitespace-nowrap"
              >
                <Plus className="size-3.5" /> Conta avulsa
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Sub-tabs */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-[#edf1f3] p-1">
            {(
              [
                ["annual", "Grade Anual"],
                ["monthly", "Despesas do Mês"],
                ["contracts", `Contratos Parcelados (${state.payableContracts.length})`],
                ["history", "Histórico de Pagamentos"],
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

          {tab === "monthly" ? (
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs font-semibold"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "open" | "paid")}
                className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs font-semibold"
              >
                <option value="all">Todas</option>
                <option value="open">Em aberto</option>
                <option value="paid">Quitadas</option>
              </select>
            </div>
          ) : tab === "annual" ? (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs font-semibold"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Exercício {y}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Tab: Annual Grid */}
        {tab === "annual" && (
          <div className="annual-print-sheet overflow-x-auto rounded-xl border border-[#dce2e6] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#0c1928]">
                  Despesas Anuais · Exercício {year}
                </h2>
                <p className="no-print text-xs text-[#52616a]">
                  Clique em qualquer célula para editar valor previsto ou confirmar quitação
                </p>
              </div>
              <div className="tabular-nums text-sm font-bold text-[#0c1928]">
                Total anual: {formatBRL(annualMonthTotals.reduce((a, b) => a + b, 0))}
              </div>
            </div>

            <table className="annual-print-table w-full min-w-[1040px] text-left text-xs">
              <thead>
                <tr className="border-b border-[#dce2e6] text-[#52616a]">
                  <th className="py-2 pr-3">Credor</th>
                  <th className="py-2 pr-2 text-center">Dia</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-1 py-2 text-right">
                      {m}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right">Anual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f3]">
                {annualRows.map((row) => {
                  const rowTotal = MONTHS.reduce(
                    (s, _, i) => s + (row.months[String(i + 1).padStart(2, "0")]?.expectedCents ?? 0),
                    0,
                  );
                  return (
                    <tr key={row.id} className="hover:bg-[#f7f8fa]">
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-[#0c1928]">{row.creditor}</div>
                        <div className="text-[11px] text-[#52616a]">
                          {row.category}
                          {row.expenseKind === "debt" ? " · Dívida" : row.expenseKind === "consumption" ? " · Consumo" : ""}
                          {row.sourceContractId ? " · Vinculado a contrato" : ""}
                        </div>
                      </td>
                      <td className="tabular-nums py-2 pr-2 text-center text-[#52616a]">
                        {String(row.dueDay).padStart(2, "0")}
                      </td>
                      {MONTHS.map((_, i) => {
                        const mKey = String(i + 1).padStart(2, "0");
                        const cell = row.months[mKey];
                        const linkedBills =
                          billsByAnnualAndPeriod.get(`${row.id}:${row.year}-${mKey}`) ?? [];
                        const paid =
                          Boolean(cell?.isSettled) || linkedBills.some((b) => b.isSettled);
                        const hasAmount = cell && cell.expectedCents !== null;
                        return (
                          <td key={mKey} className="tabular-nums px-1 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => openCellModal(row, mKey)}
                              className={`w-full rounded px-1 py-1 text-right transition-colors ${
                                paid
                                  ? "font-semibold text-[#16a34a] hover:bg-[#dcfce7]"
                                  : hasAmount
                                    ? "text-[#0c1928] hover:bg-[#edf1f3]"
                                    : "text-[#9aa5ad] hover:bg-[#edf1f3]"
                              }`}
                            >
                              {hasAmount ? formatBRL(cell.expectedCents) : "—"}
                            </button>
                          </td>
                        );
                      })}
                      <td className="tabular-nums py-2 pl-3 text-right font-bold text-[#0c1928]">
                        {formatBRL(rowTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#0c1928]/20 bg-[#f7f8fa] font-bold text-[#0c1928]">
                  <td className="py-2.5 pr-3" colSpan={2}>
                    Total Mensal
                  </td>
                  {annualMonthTotals.map((t, idx) => (
                    <td key={idx} className="tabular-nums px-1 py-2.5 text-right">
                      {formatBRL(t)}
                    </td>
                  ))}
                  <td className="tabular-nums py-2.5 pl-3 text-right text-[#173d4a]">
                    {formatBRL(annualMonthTotals.reduce((a, b) => a + b, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Tab: Monthly Expenses */}
        {tab === "monthly" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
                <div className="text-xs font-semibold text-[#52616a] uppercase">Previsto no Mês</div>
                <div className="tabular-nums mt-1 text-xl font-bold text-[#0c1928]">
                  {formatBRL(monthTotals.expected)}
                </div>
              </div>
              <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
                <div className="text-xs font-semibold text-[#52616a] uppercase">Total Pago</div>
                <div className="tabular-nums mt-1 text-xl font-bold text-[#16a34a]">
                  {formatBRL(monthTotals.paid)}
                </div>
              </div>
              <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
                <div className="text-xs font-semibold text-[#52616a] uppercase">Saldo em Aberto</div>
                <div className="tabular-nums mt-1 text-xl font-bold text-[#dc2626]">
                  {formatBRL(monthTotals.open)}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#dce2e6] bg-white p-4">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#dce2e6] text-xs text-[#52616a]">
                    <th className="py-2 pr-3">Credor</th>
                    <th className="py-2 pr-3">Vencimento</th>
                    <th className="py-2 pr-3 text-right">Previsto</th>
                    <th className="py-2 pr-3 text-right">Pago</th>
                    <th className="py-2 pr-3">Situação</th>
                    <th className="py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f3]">
                  {monthBills.map((b) => {
                    const adj = expensePaymentAdjustment(b.expectedCents, b.paidCents, b.isSettled);
                    const hasPartial = !b.isSettled && (b.paidCents ?? 0) > 0;
                    return (
                      <tr key={b.id} className="hover:bg-[#f7f8fa]">
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-[#0c1928]">
                            <span>{b.creditor}</span>
                            {b.isCardInvoice && (
                              <span className="inline-flex items-center gap-1 rounded bg-[#edf1f3] px-1.5 py-0.5 text-[10px] font-semibold text-[#173d4a]">
                                <CreditCard className="size-2.5" /> Fatura de cartão
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#52616a]">
                            {b.category}
                            {b.description && b.description !== b.creditor ? ` · ${b.description}` : ""}
                            {b.note ? ` · ${b.note}` : ""}
                          </div>
                          {b.accountId && (b.isSettled || hasPartial) && (
                            <div className="text-[11px] text-[#7a8994]">
                              Origem: {bankNameById.get(b.accountId) ?? b.accountId}
                            </div>
                          )}
                        </td>
                        <td className="tabular-nums py-2.5 pr-3 text-xs text-[#52616a]">
                          {formatDateBR(b.dueDate)}
                        </td>
                        <td className="tabular-nums py-2.5 pr-3 text-right font-medium">
                          {formatBRL(b.expectedCents)}
                        </td>
                        <td className="tabular-nums py-2.5 pr-3 text-right font-semibold text-[#173d4a]">
                          {b.paidCents !== null ? formatBRL(b.paidCents) : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-xs font-semibold">
                          {b.isSettled ? (
                            <span className="text-[#16a34a]">
                              {adj.kind === "discount"
                                ? "Quitado c/ desconto"
                                : adj.kind === "surcharge"
                                  ? "Quitado c/ acréscimo"
                                  : "Quitado"}
                            </span>
                          ) : hasPartial ? (
                            <span className="text-[#173d4a]">
                              Parcial · Restam{" "}
                              {formatBRL(Math.max(0, b.expectedCents - (b.paidCents ?? 0)))}
                            </span>
                          ) : b.dueDate < today ? (
                            <span className="text-[#dc2626]">Vencido</span>
                          ) : (
                            <span className="text-[#d97706]">Em aberto</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openPayDialog(b)}
                            className="rounded-md bg-[#173d4a] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0c1928]"
                          >
                            {b.isSettled ? "Ajustar" : hasPartial ? "Complementar" : "Pagar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: Payable Installment Contracts */}
        {tab === "contracts" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3.5 text-xs text-[#52616a]">
              <Layers className="mt-0.5 size-4 shrink-0 text-[#173d4a]" />
              <span>
                Os contratos parcelados a pagar acompanham cada acordo e suas parcelas individuais
                sem somar em duplicidade com as faturas da Grade Anual ou com as Contas Mensais.
              </span>
            </div>

            {state.payableContracts.length === 0 ? (
              <div className="rounded-xl border border-[#dce2e6] bg-white p-8 text-center text-sm text-[#52616a]">
                Nenhum contrato parcelado a pagar cadastrado ou importado ainda.
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-3">
                  {state.payableContracts.map((contract) => {
                    const entries = state.payableInstallments.filter(
                      (i) => i.contractId === contract.id,
                    );
                    const settledCount = entries.filter((i) => i.isSettled).length;
                    const expectedTotal = entries.reduce((s, i) => s + i.expectedCents, 0);
                    const paidTotal = entries.reduce((s, i) => s + (i.paidCents ?? 0), 0);
                    const selected = activePayableContract?.id === contract.id;
                    return (
                      <button
                        key={contract.id}
                        type="button"
                        onClick={() => setSelectedPayableContractId(contract.id)}
                        className={`w-full rounded-xl border p-4 text-left transition-colors ${
                          selected
                            ? "border-[#173d4a] bg-[#f2f6f7]"
                            : "border-[#dce2e6] bg-white hover:bg-[#f7f8fa]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-[#0c1928]">{contract.name}</div>
                          <span className="tabular-nums text-xs font-semibold text-[#173d4a]">
                            {settledCount}/{entries.length} pagas
                          </span>
                        </div>
                        {contract.description && (
                          <div className="mt-1 line-clamp-2 text-xs text-[#52616a]">
                            {contract.description}
                          </div>
                        )}
                        <div className="tabular-nums mt-2 flex items-center justify-between text-xs font-semibold">
                          <span className="text-[#16a34a]">Pago: {formatBRL(paidTotal)}</span>
                          <span className="text-[#0c1928]">Total: {formatBRL(expectedTotal)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {activePayableContract && (
                  <div className="space-y-4 rounded-xl border border-[#dce2e6] bg-white p-5 lg:col-span-2">
                    <div className="border-b border-[#edf1f3] pb-3">
                      <h2 className="text-lg font-semibold text-[#0c1928]">
                        {activePayableContract.name}
                      </h2>
                      {activePayableContract.description && (
                        <p className="mt-0.5 text-xs text-[#52616a]">
                          {activePayableContract.description}
                        </p>
                      )}
                      {activePayableContract.detailsJson && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {Object.entries(activePayableContract.detailsJson).map(([k, v]) => (
                            <div
                              key={k}
                              className="rounded-lg border border-[#edf1f3] bg-[#f7f8fa] px-2.5 py-2 text-xs"
                            >
                              <div className="text-[10px] font-semibold text-[#7a8994] uppercase">
                                {k.replace(/_/g, " ")}
                              </div>
                              <div className="tabular-nums mt-0.5 font-semibold text-[#0c1928]">
                                {formatContractDetailValue(k, v)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="max-h-[520px] overflow-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#dce2e6] text-[#52616a]">
                            <th className="py-2 pr-2">Parcela</th>
                            <th className="py-2 pr-2">Vencimento</th>
                            <th className="py-2 pr-2 text-right">Previsto</th>
                            <th className="py-2 pr-2 text-right">Pago</th>
                            <th className="py-2 pr-2">Conta / Situação</th>
                            <th className="py-2 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#edf1f3]">
                          {activeContractInstallments.map((inst) => {
                            const hasPartial = !inst.isSettled && (inst.paidCents ?? 0) > 0;
                            const overdue = !inst.isSettled && inst.dueDate < today;
                            return (
                              <tr key={inst.id} className="hover:bg-[#f7f8fa]">
                                <td className="tabular-nums py-2 pr-2 font-semibold text-[#0c1928]">
                                  #{inst.number}
                                </td>
                                <td className="tabular-nums py-2 pr-2 text-[#52616a]">
                                  {formatDateBR(inst.dueDate)}
                                </td>
                                <td className="tabular-nums py-2 pr-2 text-right font-medium">
                                  {formatBRL(inst.expectedCents)}
                                </td>
                                <td className="tabular-nums py-2 pr-2 text-right font-semibold text-[#173d4a]">
                                  {inst.paidCents !== null ? formatBRL(inst.paidCents) : "—"}
                                </td>
                                <td className="py-2 pr-2">
                                  <div
                                    className={`font-semibold ${
                                      inst.isSettled
                                        ? "text-[#16a34a]"
                                        : hasPartial
                                          ? "text-[#173d4a]"
                                          : overdue
                                            ? "text-[#dc2626]"
                                            : "text-[#d97706]"
                                    }`}
                                  >
                                    {inst.isSettled
                                      ? `Quitada (${formatDateBR(inst.paidDate)})`
                                      : hasPartial
                                        ? `Parcial · Restam ${formatBRL(
                                            Math.max(0, inst.expectedCents - (inst.paidCents ?? 0)),
                                          )}`
                                        : overdue
                                          ? "Vencida"
                                          : "Em aberto"}
                                  </div>
                                  {inst.accountId && (inst.isSettled || hasPartial) && (
                                    <div className="text-[11px] text-[#7a8994]">
                                      {bankNameById.get(inst.accountId) ?? inst.accountId}
                                    </div>
                                  )}
                                  {inst.note && (
                                    <div className="text-[11px] text-[#52616a]">{inst.note}</div>
                                  )}
                                </td>
                                <td className="py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => openPayInstallmentDialog(inst)}
                                    className="rounded bg-[#173d4a] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#0c1928]"
                                  >
                                    {inst.isSettled ? "Ajustar" : hasPartial ? "Complementar" : "Pagar"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab: Payment History */}
        {tab === "history" && (
          <FinancialHistorySection direction="payment" rows={paymentHistoryRows} />
        )}
      </div>

      {/* Modal: Correction / Reversal for already settled obligations */}
      <HistoryCorrectionModal row={settledEditRow} onClose={() => setSettledEditRow(null)} />

      {/* Modal: Pay Monthly Bill or Payable Installment */}
      {(payTarget || payInstallmentTarget) && (() => {
        const activeTarget = payTarget ?? payInstallmentTarget!;
        const alreadyPaid = !activeTarget.isSettled ? (activeTarget.paidCents ?? 0) : 0;
        const remaining = Math.max(0, activeTarget.expectedCents - alreadyPaid);
        return (
          <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
            <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="border-b border-[#edf1f3] px-6 py-4">
                <h3 className="text-lg font-semibold text-[#0c1928]">Registrar Pagamento</h3>
                <p className="mt-0.5 text-xs text-[#52616a]">
                  {payTarget
                    ? `${payTarget.creditor} · Previsto: ${formatBRL(payTarget.expectedCents)}`
                    : `Parcela #${payInstallmentTarget!.number} · Previsto: ${formatBRL(
                        payInstallmentTarget!.expectedCents,
                      )}`}
                  {alreadyPaid > 0 && (
                    <>
                      {" "}
                      · Já pago: <strong className="text-[#16a34a]">{formatBRL(alreadyPaid)}</strong> ·
                      Restante: <strong className="text-[#0c1928]">{formatBRL(remaining)}</strong>
                    </>
                  )}
                </p>
              </div>
              <form onSubmit={handlePaySubmit} className="flex-1 space-y-3 overflow-y-auto p-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">
                      Valor pago agora (R$)
                    </label>
                    <input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">Data pagamento</label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">Desconto (R$)</label>
                    <input
                      value={payDiscount}
                      onChange={(e) => setPayDiscount(e.target.value)}
                      className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">
                      Acréscimo / juros (R$)
                    </label>
                    <input
                      value={paySurcharge}
                      onChange={(e) => setPaySurcharge(e.target.value)}
                      className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">
                      Conta de origem do pagamento
                    </label>
                    <select
                      value={payAccountId}
                      onChange={(e) => setPayAccountId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                    >
                      <option value="">Não vincular / Pagamento avulso</option>
                      {state.banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.institution} · {b.name} (Saldo: {formatBRL(b.balanceCents)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">
                      Conciliar com Open Finance
                    </label>
                    <select
                      value={payBankTxId}
                      onChange={(e) => setPayBankTxId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                    >
                      <option value="">Lançamento manual (debita saldo da conta)</option>
                      {openFinancePayMatches.map((tx) => (
                        <option key={tx.id} value={tx.id}>
                          {formatDateBR(tx.date)} · {formatBRL(Math.abs(tx.amountCents))} ·{" "}
                          {tx.description.slice(0, 26)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {payBankTxId && (
                  <div className="rounded-lg border border-[#dce2e6] bg-[#f2f6f7] px-3 py-2 text-[11px] text-[#173d4a]">
                    Conciliado ao extrato Open Finance: o saldo bancário já contempla esta saída e não será
                    debitado em duplicidade.
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-[#0c1928]">
                  <input
                    type="checkbox"
                    checked={payQuits}
                    onChange={(e) => setPayQuits(e.target.checked)}
                    className="size-4 accent-[#173d4a]"
                  />
                  <span>Quitar integralmente esta obrigação (desmarque para pagamento parcial)</span>
                </label>

                {payInstallmentTarget && (
                  <label className="flex items-center gap-2 text-xs text-[#0c1928]">
                    <input
                      type="checkbox"
                      checked={payEarlyPayoff}
                      onChange={(e) => setPayEarlyPayoff(e.target.checked)}
                      className="size-4 accent-[#173d4a]"
                    />
                    <span>Registrar como quitação antecipada</span>
                  </label>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Observação</label>
                  <input
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="Gerada automaticamente se vazio"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-[#cbd3d8] bg-[#f7f8fa] px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-[#52616a]">
                    <Paperclip className="size-3.5 text-[#173d4a]" />
                    {payAttachments.length > 0
                      ? `${payAttachments.length} comprovante(s) anexado(s)`
                      : "Anexar comprovante (opcional)"}
                  </span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#dce2e6] bg-white px-2.5 py-1 font-semibold text-[#173d4a] hover:bg-[#edf1f3]">
                    {uploadingPayAtt ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                    {uploadingPayAtt ? "Enviando..." : "Selecionar arquivo"}
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={handlePayAttachmentUpload}
                      disabled={uploadingPayAtt}
                      className="sr-only"
                    />
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={submittingPay}
                    onClick={() => {
                      setPayTarget(null);
                      setPayInstallmentTarget(null);
                    }}
                    className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submittingPay || uploadingPayAtt}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {submittingPay && <Loader2 className="size-3.5 animate-spin" />}
                    {submittingPay ? "Salvando..." : "Confirmar pagamento"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal: Edit Annual Cell */}
      {cellEdit && (() => {
        const linkedBills =
          billsByAnnualAndPeriod.get(
            `${cellEdit.row.id}:${cellEdit.row.year}-${cellEdit.monthKey}`,
          ) ?? [];
        const existingHistoryRow = paymentHistoryRows.find(
          (r) =>
            (r.rawRefs.annualRowId === cellEdit.row.id &&
              r.rawRefs.period === `${cellEdit.row.year}-${cellEdit.monthKey}`) ||
            (linkedBills[0] && r.rawRefs.billId === linkedBills[0].id),
        );
        return (
          <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
            <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="border-b border-[#edf1f3] px-6 py-4">
                <h3 className="text-lg font-semibold text-[#0c1928]">
                  {cellEdit.row.creditor} — {MONTHS[Number(cellEdit.monthKey) - 1]}/{cellEdit.row.year}
                </h3>
              </div>
              <form onSubmit={saveCellEdit} className="flex-1 space-y-3 overflow-y-auto p-6">
                {linkedBills.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-[#dce2e6] bg-[#f7f8fa] p-3 text-xs">
                    <div className="font-semibold text-[#0c1928]">
                      Fatura / Conta Mensal Vinculada ({linkedBills.length})
                    </div>
                    {linkedBills.map((lb) => (
                      <div key={lb.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[#52616a]">
                          {lb.description || lb.creditor} ·{" "}
                          {lb.isSettled
                            ? `Pago ${formatBRL(lb.paidCents)} em ${formatDateBR(lb.paidDate)}${
                                lb.accountId
                                  ? ` (${bankNameById.get(lb.accountId) ?? lb.accountId})`
                                  : ""
                              }`
                            : `Em aberto · Vence ${formatDateBR(lb.dueDate)}`}
                        </span>
                        <span className="tabular-nums font-semibold text-[#0c1928]">
                          {formatBRL(lb.expectedCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">Valor previsto (R$)</label>
                    <input
                      value={cellExpected}
                      onChange={(e) => setCellExpected(e.target.value)}
                      className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">Valor pago (R$)</label>
                    <input
                      value={cellPaid}
                      onChange={(e) => setCellPaid(e.target.value)}
                      className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">Data pagamento</label>
                    <input
                      type="date"
                      value={cellDate}
                      onChange={(e) => setCellDate(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">Conta de origem</label>
                    <select
                      value={cellAccountId}
                      onChange={(e) => setCellAccountId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs"
                    >
                      <option value="">Sem vínculo bancário</option>
                      {state.banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.institution} · {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {cellSettled && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#52616a]">
                      Conciliar com Open Finance
                    </label>
                    <select
                      value={cellBankTxId}
                      onChange={(e) => setCellBankTxId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                    >
                      <option value="">Lançamento manual</option>
                      {openFinanceCellMatches.map((tx) => (
                        <option key={tx.id} value={tx.id}>
                          {formatDateBR(tx.date)} · {formatBRL(Math.abs(tx.amountCents))} ·{" "}
                          {tx.description.slice(0, 26)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Observação</label>
                  <input
                    value={cellNote}
                    onChange={(e) => setCellNote(e.target.value)}
                    placeholder="Detalhes do pagamento ou competência"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[#0c1928]">
                  <input
                    type="checkbox"
                    checked={cellSettled}
                    onChange={(e) => setCellSettled(e.target.checked)}
                    className="size-4 accent-[#173d4a]"
                  />
                  <span>Marcar mês como pago / quitado</span>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  {existingHistoryRow ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCellEdit(null);
                        setSettledEditRow(existingHistoryRow);
                      }}
                      className="h-9 rounded-lg border border-[#173d4a]/40 px-3 text-xs font-semibold text-[#173d4a] hover:bg-[#edf1f3]"
                    >
                      Auditar / Estornar
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={savingCell}
                      onClick={() => setCellEdit(null)}
                      className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingCell}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {savingCell && <Loader2 className="size-3.5 animate-spin" />}
                      {savingCell ? "Salvando..." : "Salvar célula"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal: Add Monthly Ad-hoc Bill */}
      {billOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0c1928]">Nova Conta Avulsa</h3>
            <form onSubmit={handleAddBill} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Credor</label>
                <input
                  value={billCreditor}
                  onChange={(e) => setBillCreditor(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">
                  Descrição / Competência (opcional)
                </label>
                <input
                  value={billDescription}
                  onChange={(e) => setBillDescription(e.target.value)}
                  placeholder="Ex.: Fatura Nov/2026 ou Manutenção"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Valor (R$)</label>
                  <input
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    placeholder="0,00"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Vencimento</label>
                  <input
                    type="date"
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Categoria</label>
                <select
                  value={billCategory}
                  onChange={(e) => setBillCategory(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#0c1928]">
                <input
                  type="checkbox"
                  checked={billIsCardInvoice}
                  onChange={(e) => setBillIsCardInvoice(e.target.checked)}
                  className="size-4 accent-[#173d4a]"
                />
                <span>Esta conta é fatura consolidada de cartão de crédito</span>
              </label>
              {billIsCardInvoice && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">
                    Cartão vinculado (opcional)
                  </label>
                  <select
                    value={billCardId}
                    onChange={(e) => setBillCardId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  >
                    <option value="">Selecionar cartão</option>
                    {state.cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.institution} · {c.name} (final {c.number})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-[#52616a]">
                    Lançar a fatura cria a obrigação consolidada; o saldo bancário só é debitado ao registrar o pagamento da fatura.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBillOpen(false)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
                >
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Annual Creditor */}
      {creditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0c1928]">Novo Credor Anual ({year})</h3>
            <form onSubmit={handleAddCreditor} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Credor</label>
                <input
                  value={credName}
                  onChange={(e) => setCredName(e.target.value)}
                  placeholder="Ex.: Seguro Residencial"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#52616a]">Valor mensal (R$)</label>
                  <input
                    value={credAmount}
                    onChange={(e) => setCredAmount(e.target.value)}
                    placeholder="250,00"
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
                    value={credDay}
                    onChange={(e) => setCredDay(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Categoria</label>
                <select
                  value={credCat}
                  onChange={(e) => setCredCat(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreditorOpen(false)}
                  className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white"
                >
                  Salvar na grade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
