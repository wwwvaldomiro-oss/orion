import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { suggestOpenFinanceMatches, type UnifiedHistoryRow } from "@/lib/domain/ledgerHistory";
import { formatBRL, formatDateBR, parseBRL, todayBR } from "@/lib/domain/money";
import { useOrion } from "@/store/orionContext";
import type { PaymentAttachmentRef } from "@/types/orion";

interface HistoryCorrectionModalProps {
  row: UnifiedHistoryRow | null;
  onClose: () => void;
}

export function HistoryCorrectionModal({ row, onClose }: HistoryCorrectionModalProps) {
  const {
    state,
    correctPaymentEvent,
    reversePaymentEvent,
    correctRevenueEvent,
    reverseRevenueEvent,
    uploadHistoryAttachment,
  } = useOrion();

  const [effectiveDate, setEffectiveDate] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0,00");
  const [surchargeAmount, setSurchargeAmount] = useState("0,00");
  const [isSettled, setIsSettled] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [bankTransactionId, setBankTransactionId] = useState("");
  const [observation, setObservation] = useState("");
  const [reason, setReason] = useState("Conferência e ajuste manual");
  const [newAttachments, setNewAttachments] = useState<PaymentAttachmentRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  useEffect(() => {
    if (!row) return;
    setEffectiveDate(row.effectiveDate ?? "");
    setActualAmount((row.actualCents / 100).toFixed(2).replace(".", ","));
    setDiscountAmount((row.discountCents / 100).toFixed(2).replace(".", ","));
    setSurchargeAmount((row.surchargeCents / 100).toFixed(2).replace(".", ","));
    setIsSettled(row.isSettled);
    setAccountId(row.accountId ?? "");
    setBankTransactionId(row.bankTransactionId ?? "");
    setObservation(row.observation);
    setReason("Conferência e ajuste manual");
    setNewAttachments([]);
    setConfirmReverse(false);
    setAuditOpen(false);
  }, [row]);

  const parsedActualCents = parseBRL(actualAmount) ?? row?.actualCents ?? 0;

  const openFinanceCandidates = useMemo(() => {
    if (!row) return [];
    return suggestOpenFinanceMatches(
      state.transactions,
      row.direction,
      accountId || null,
      parsedActualCents,
      effectiveDate || row.dueDate || todayBR(),
    );
  }, [state.transactions, row, accountId, parsedActualCents, effectiveDate]);

  const auditTrail = useMemo(() => {
    if (!row) return [];
    if (row.direction === "payment") {
      return state.paymentEvents
        .filter((ev) => {
          if (row.rawRefs.paymentEventId && ev.id === row.rawRefs.paymentEventId) return true;
          if (row.rawRefs.paymentEventId && ev.targetEventId === row.rawRefs.paymentEventId) return true;
          if (row.rawRefs.billId && ev.billId === row.rawRefs.billId) return true;
          if (row.rawRefs.installmentId && ev.installmentId === row.rawRefs.installmentId) return true;
          if (
            row.rawRefs.annualRowId &&
            row.rawRefs.period &&
            ev.annualRowId === row.rawRefs.annualRowId &&
            ev.period === row.rawRefs.period
          ) {
            return true;
          }
          return false;
        })
        .sort((a, b) => b.eventCreatedAt.localeCompare(a.eventCreatedAt));
    }
    return state.revenueEvents
      .filter((ev) => ev.entryId === row.rawRefs.entryId)
      .sort((a, b) => b.eventCreatedAt.localeCompare(a.eventCreatedAt));
  }, [row, state.paymentEvents, state.revenueEvents]);

  if (!row) return null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !row) return;
    setUploading(true);
    try {
      const added: PaymentAttachmentRef[] = [];
      for (const file of files) {
        added.push(await uploadHistoryAttachment(file, row.primaryTargetId || row.id));
      }
      setNewAttachments((prev) => [...prev, ...added]);
      toast.success("Comprovante pronto para salvar com o ajuste.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar comprovante.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!row || saving) return;

    const cents = parseBRL(actualAmount);
    if (cents === null || cents < 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    const discountCents = Math.max(0, parseBRL(discountAmount) ?? 0);
    const surchargeCents = Math.max(0, parseBRL(surchargeAmount) ?? 0);

    setSaving(true);
    const idempotencyKey = `cor-${row.id}-${Date.now()}`;
    try {
      if (row.direction === "payment") {
        await correctPaymentEvent({
          paymentEventId: row.rawRefs.paymentEventId,
          billId: row.rawRefs.billId,
          installmentId: row.rawRefs.installmentId,
          annualRowId: row.rawRefs.annualRowId,
          period: row.rawRefs.period,
          paidCents: cents,
          paidDate: effectiveDate.trim() || null,
          isSettled,
          discountCents,
          surchargeCents,
          accountId: accountId.trim() || null,
          bankTransactionId: bankTransactionId.trim() || null,
          note: observation.trim(),
          reason: reason.trim() || "Correção de pagamento",
          attachments: newAttachments,
          idempotencyKey,
        });
        toast.success("Pagamento corrigido e auditado no histórico.");
      } else {
        await correctRevenueEvent({
          revenueEventId: row.rawRefs.revenueEventId,
          entryId: row.rawRefs.entryId ?? row.primaryTargetId,
          receivedCents: cents,
          receivedDate: effectiveDate.trim() || null,
          isSettled,
          discountCents,
          surchargeCents,
          accountId: accountId.trim() || null,
          bankTransactionId: bankTransactionId.trim() || null,
          note: observation.trim(),
          reason: reason.trim() || "Correção de recebimento",
          attachments: newAttachments,
          idempotencyKey,
        });
        toast.success("Recebimento corrigido e auditado no histórico.");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar ajuste.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReverse() {
    if (!row || saving) return;
    setSaving(true);
    const idempotencyKey = `rev-${row.id}-${Date.now()}`;
    try {
      if (row.direction === "payment") {
        await reversePaymentEvent({
          paymentEventId: row.rawRefs.paymentEventId,
          billId: row.rawRefs.billId,
          installmentId: row.rawRefs.installmentId,
          annualRowId: row.rawRefs.annualRowId,
          period: row.rawRefs.period,
          reason: reason.trim() || "Estorno manual de pagamento",
          idempotencyKey,
        });
        toast.success("Pagamento estornado e obrigação reaberta.");
      } else {
        await reverseRevenueEvent({
          revenueEventId: row.rawRefs.revenueEventId,
          entryId: row.rawRefs.entryId ?? row.primaryTargetId,
          reason: reason.trim() || "Estorno manual de recebimento",
          idempotencyKey,
        });
        toast.success("Recebimento estornado e lançamento reaberto.");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao estornar registro.");
    } finally {
      setSaving(false);
    }
  }

  const isPayment = row.direction === "payment";

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar lançamento financeiro"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#edf1f3] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-[#0c1928]">
              Ajustar {isPayment ? "Pagamento" : "Recebimento"}
            </h3>
            <p className="mt-0.5 truncate text-xs text-[#52616a]">
              {row.party} · Previsto: <span className="tabular-nums">{formatBRL(row.expectedCents)}</span>{" "}
              · Vencimento: <span className="tabular-nums">{formatDateBR(row.dueDate)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-[#52616a] hover:bg-[#f0f3f5] hover:text-[#0c1928]"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 space-y-3.5 overflow-y-auto p-5 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#52616a]">
                {isPayment ? "Valor pago (R$)" : "Valor recebido (R$)"}
              </label>
              <input
                value={actualAmount}
                onChange={(e) => setActualAmount(e.target.value)}
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#52616a]">
                {isPayment ? "Data do pagamento" : "Data do recebimento"}
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#52616a]">Desconto (R$)</label>
              <input
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#52616a]">
                Acréscimo / juros (R$)
              </label>
              <input
                value={surchargeAmount}
                onChange={(e) => setSurchargeAmount(e.target.value)}
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#0c1928]">
            <input
              type="checkbox"
              checked={isSettled}
              onChange={(e) => setIsSettled(e.target.checked)}
              className="size-4 accent-[#173d4a]"
            />
            <span>
              {isPayment
                ? "Considerar obrigação quitada integralmente"
                : "Considerar recebimento quitado integralmente"}
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#52616a]">
                {isPayment ? "Conta de origem" : "Conta de destino"}
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
              >
                <option value="">Sem vínculo bancário</option>
                {state.banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.institution} · {b.name} ({formatBRL(b.balanceCents)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#52616a]">
                Conciliar com Open Finance
              </label>
              <select
                value={bankTransactionId}
                onChange={(e) => setBankTransactionId(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
              >
                <option value="">Lançamento manual (ajusta saldo)</option>
                {openFinanceCandidates.map((tx) => (
                  <option key={tx.id} value={tx.id}>
                    {formatDateBR(tx.date)} · {formatBRL(Math.abs(tx.amountCents))} ·{" "}
                    {tx.description.slice(0, 28)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {bankTransactionId ? (
            <div className="rounded-lg border border-[#dce2e6] bg-[#f2f6f7] px-3 py-2 text-[11px] text-[#173d4a]">
              Conciliado ao extrato Open Finance: o saldo bancário já reflete esta movimentação e não será
              alterado novamente.
            </div>
          ) : accountId ? (
            <div className="rounded-lg border border-[#dce2e6] bg-[#f7f8fa] px-3 py-2 text-[11px] text-[#52616a]">
              Ao salvar, o saldo da conta selecionada será recalculado automaticamente pela diferença em
              relação ao valor anterior.
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-[#52616a]">Observação</label>
            <input
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Detalhes do pagamento ou recebimento"
              className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#52616a]">
              Motivo do ajuste / auditoria
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
              required
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-[#cbd3d8] bg-[#f7f8fa] px-3 py-2.5 text-xs">
            <span className="text-[#52616a]">
              {newAttachments.length > 0
                ? `${newAttachments.length} novo(s) comprovante(s) pronto(s) para vincular`
                : "Deseja anexar comprovante junto a este ajuste?"}
            </span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#dce2e6] bg-white px-2.5 py-1.5 font-semibold text-[#173d4a] hover:bg-[#edf1f3]">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {uploading ? "Enviando..." : "Anexar arquivo"}
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={handleUpload}
                disabled={uploading}
                className="sr-only"
              />
            </label>
          </div>

          {auditTrail.length > 0 && (
            <div className="rounded-xl border border-[#dce2e6]">
              <button
                type="button"
                onClick={() => setAuditOpen((o) => !o)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa]"
              >
                <span>Trilha de auditoria ({auditTrail.length} evento(s))</span>
                {auditOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              {auditOpen && (
                <div className="max-h-44 divide-y divide-[#edf1f3] overflow-y-auto border-t border-[#edf1f3] px-3.5 py-2 text-[11px]">
                  {auditTrail.map((ev) => {
                    const isPayEv = "paidCents" in ev;
                    const amount = isPayEv
                      ? ev.paidCents
                      : (ev.afterData?.receivedCents ?? 0);
                    const evDate = isPayEv
                      ? ev.paidDate
                      : (ev.afterData?.receivedDate ?? null);
                    return (
                      <div key={ev.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#0c1928]">
                            <span className="uppercase text-[#173d4a]">{ev.kind}</span> · {ev.reason}
                          </div>
                          <div className="text-[#7a8994]">
                            Registrado em {ev.eventCreatedAt.slice(0, 16).replace("T", " ")}
                          </div>
                        </div>
                        <div className="tabular-nums shrink-0 text-right">
                          <div className="font-semibold text-[#0c1928]">{formatBRL(amount)}</div>
                          <div className="text-[#7a8994]">{formatDateBR(evDate)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {confirmReverse && (
            <div className="rounded-xl border border-[#dc2626]/30 bg-[#fef2f2] p-3 text-xs text-[#991b1b]">
              <p className="font-semibold">
                Confirmar estorno deste registro? A obrigação voltará a ficar em aberto e qualquer saldo
                manual movimentado na conta será revertido.
              </p>
              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmReverse(false)}
                  className="rounded-md border border-[#dce2e6] bg-white px-3 py-1 font-semibold text-[#0c1928]"
                >
                  Manter registro
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleReverse()}
                  className="rounded-md bg-[#dc2626] px-3 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Estornando..." : "Confirmar estorno"}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf1f3] pt-3">
            <button
              type="button"
              disabled={saving || confirmReverse}
              onClick={() => setConfirmReverse(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dc2626]/40 bg-white px-3 text-xs font-semibold text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" /> Estornar registro
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold text-[#0c1928]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-60"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                {saving ? "Salvando..." : "Salvar alteração"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
