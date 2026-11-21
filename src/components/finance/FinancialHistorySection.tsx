import { useMemo, useRef, useState, useEffect } from "react";
import { AlertTriangle, ChevronDown, Copy, MoreVertical, Paperclip, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  buildHistoryCopyReport,
  extractAvailableHistoryYears,
  extractDistinctParties,
  filterHistoryRows,
  groupHistoryByMonth,
  resolveRowAttachments,
  type HistoryDirection,
  type HistoryFilters,
  type UnifiedHistoryRow,
} from "@/lib/domain/ledgerHistory";
import { formatBRL, formatDateBR } from "@/lib/domain/money";
import { useOrion } from "@/store/orionContext";
import { AttachmentsModal } from "@/components/finance/AttachmentsModal";
import { HistoryCorrectionModal } from "@/components/finance/HistoryCorrectionModal";

interface FinancialHistorySectionProps {
  direction: HistoryDirection;
  rows: UnifiedHistoryRow[];
}

const MONTH_OPTIONS = [
  { value: "all", label: "Todos os meses" },
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const EMPTY_FILTERS: HistoryFilters = {
  year: "all",
  month: "all",
  party: "",
};

export function FinancialHistorySection({ direction, rows }: FinancialHistorySectionProps) {
  const { state } = useOrion();

  const [draftFilters, setDraftFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedAttachmentRowId, setSelectedAttachmentRowId] = useState<string | null>(null);
  const [selectedEditRowId, setSelectedEditRowId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const availableYears = useMemo(() => extractAvailableHistoryYears(rows), [rows]);
  const distinctParties = useMemo(() => extractDistinctParties(rows), [rows]);

  const filteredRows = useMemo(
    () => filterHistoryRows(rows, appliedFilters),
    [rows, appliedFilters],
  );
  const groups = useMemo(
    () => groupHistoryByMonth(filteredRows, direction),
    [filteredRows, direction],
  );

  const selectedAttachmentRow = useMemo(
    () => (selectedAttachmentRowId ? rows.find((r) => r.id === selectedAttachmentRowId) ?? null : null),
    [rows, selectedAttachmentRowId],
  );
  const selectedEditRow = useMemo(
    () => (selectedEditRowId ? rows.find((r) => r.id === selectedEditRowId) ?? null : null),
    [rows, selectedEditRowId],
  );

  const attachmentCountsByRowId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      map.set(r.id, resolveRowAttachments(r, state.fiscalReceipts).length);
    }
    return map;
  }, [filteredRows, state.fiscalReceipts]);

  const totals = useMemo(() => {
    return groups.reduce(
      (acc, g) => ({
        distinct: acc.distinct + g.distinctCount,
        actualCents: acc.actualCents + g.totalActualCents,
      }),
      { distinct: 0, actualCents: 0 },
    );
  }, [groups]);

  function applyFilters(e?: React.FormEvent) {
    e?.preventDefault();
    setAppliedFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  }

  async function handleCopyReport() {
    setMenuOpen(false);
    const reportText = buildHistoryCopyReport(direction, groups, appliedFilters);
    try {
      await navigator.clipboard.writeText(reportText);
      toast.success("Relatório copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar o relatório.");
    }
  }

  function handlePrintReport() {
    setMenuOpen(false);
    window.print();
  }

  const isPayment = direction === "payment";
  const sectionTitle = isPayment ? "Histórico de Pagamentos" : "Histórico de Recebimentos";
  const partyColumnLabel = isPayment ? "Credor" : "Fonte pagadora";
  const effectiveDateColumnLabel = isPayment ? "Pagamento" : "Recebimento";
  const actualAmountColumnLabel = isPayment ? "Valor pago" : "Valor recebido";
  const partyDatalistId = `orion-history-parties-${direction}`;

  return (
    <div className="history-print-sheet space-y-5">
      {/* Header + Filter Bar + Options Menu */}
      <div className="no-print rounded-xl border border-[#dce2e6] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f3] pb-3">
          <div>
            <h2 className="text-base font-semibold text-[#0c1928]">{sectionTitle}</h2>
            <p className="mt-0.5 text-xs text-[#52616a]">
              {totals.distinct}{" "}
              {isPayment
                ? totals.distinct === 1
                  ? "compromisso pago"
                  : "compromissos pagos"
                : totals.distinct === 1
                  ? "recebimento confirmado"
                  : "recebimentos confirmados"}{" "}
              · Total no período filtrado:{" "}
              <strong className="tabular-nums text-[#16a34a]">{formatBRL(totals.actualCents)}</strong>{" "}
              <span className="text-[#7a8994]">· Clique em uma linha para abrir os comprovantes</span>
            </p>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5]"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="size-3.5 text-[#52616a]" />
              Opções
              <ChevronDown className="size-3.5 text-[#52616a]" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-xl border border-[#dce2e6] bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleCopyReport()}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-[#0c1928] hover:bg-[#f7f8fa]"
                >
                  <Copy className="size-3.5 text-[#173d4a]" /> Copiar relatório
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handlePrintReport}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-[#0c1928] hover:bg-[#f7f8fa]"
                >
                  <Printer className="size-3.5 text-[#173d4a]" /> Imprimir / Gerar PDF
                </button>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={applyFilters} className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-[11px] font-medium text-[#52616a]">Ano</label>
            <select
              value={draftFilters.year}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, year: e.target.value }))}
              aria-label="Filtrar por ano"
              className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-medium text-[#0c1928]"
            >
              <option value="all">Todos os anos</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="mb-1 block text-[11px] font-medium text-[#52616a]">Mês</label>
            <select
              value={draftFilters.month}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, month: e.target.value }))}
              aria-label="Filtrar por mês"
              className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-medium text-[#0c1928]"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4">
            <label className="mb-1 block text-[11px] font-medium text-[#52616a]">
              {partyColumnLabel}
            </label>
            <input
              list={partyDatalistId}
              value={draftFilters.party}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, party: e.target.value }))}
              placeholder={`Buscar ${partyColumnLabel.toLowerCase()} ou observação...`}
              className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs text-[#0c1928]"
            />
            <datalist id={partyDatalistId}>
              {distinctParties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="flex items-end gap-2 lg:col-span-3">
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 flex-1 rounded-lg border border-[#dce2e6] bg-white px-3 text-xs font-semibold text-[#52616a] hover:bg-[#f0f3f5] hover:text-[#0c1928]"
            >
              Limpar
            </button>
            <button
              type="submit"
              className="h-9 flex-1 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              Aplicar
            </button>
          </div>
        </form>
      </div>

      {/* Print-only summary banner */}
      <div className="only-print mb-3 border-b border-[#0c1928]/20 pb-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-[#0c1928]">Órion — {sectionTitle}</h2>
          <span className="tabular-nums text-sm font-bold text-[#0c1928]">
            Total ({totals.distinct}): {formatBRL(totals.actualCents)}
          </span>
        </div>
        <p className="text-[11px] text-[#52616a]">
          Filtros: Ano {appliedFilters.year === "all" ? "Todos" : appliedFilters.year} · Mês{" "}
          {appliedFilters.month === "all"
            ? "Todos"
            : (MONTH_OPTIONS.find((m) => m.value === appliedFilters.month)?.label ?? appliedFilters.month)}
          {appliedFilters.party.trim() ? ` · ${partyColumnLabel}: ${appliedFilters.party.trim()}` : ""}
        </p>
      </div>

      {/* Monthly Groups */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-[#dce2e6] bg-white p-8 text-center text-sm text-[#52616a]">
          {isPayment
            ? "Nenhum pagamento encontrado para os filtros selecionados."
            : "Nenhum recebimento encontrado para os filtros selecionados."}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section
              key={group.key}
              className={`history-print-group overflow-hidden rounded-xl border bg-white ${
                group.isPendingGroup ? "border-[#d97706]/40" : "border-[#dce2e6]"
              }`}
            >
              <div
                className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5 ${
                  group.isPendingGroup
                    ? "border-[#d97706]/30 bg-[#fffbeb]"
                    : "border-[#edf1f3] bg-[#f7f8fa]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {group.isPendingGroup && (
                    <AlertTriangle className="size-4 shrink-0 text-[#d97706]" />
                  )}
                  <h3 className="text-base font-semibold text-[#0c1928]">{group.label}</h3>
                </div>
                <div className="tabular-nums text-xs font-semibold text-[#173d4a]">
                  {group.subtitle}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="history-print-table w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#dce2e6] bg-white text-[11px] font-semibold text-[#52616a]">
                      <th className="py-2.5 pl-5 pr-3">{partyColumnLabel}</th>
                      <th className="py-2.5 px-3 text-right">Valor previsto</th>
                      <th className="py-2.5 px-3">{isPayment ? "Vencimento" : "Vencimento"}</th>
                      <th className="py-2.5 px-3">{effectiveDateColumnLabel}</th>
                      <th className="py-2.5 px-3 text-right">{actualAmountColumnLabel}</th>
                      <th className="py-2.5 px-3 text-right">Diferença</th>
                      <th className="py-2.5 px-3">Observação</th>
                      <th className="no-print py-2.5 pl-3 pr-5 text-right">Ajuste</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f3]">
                    {group.rows.map((row) => {
                      const attCount = attachmentCountsByRowId.get(row.id) ?? 0;
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedAttachmentRowId(row.id)}
                          title="Clique para visualizar ou anexar comprovantes"
                          className="cursor-pointer transition-colors hover:bg-[#f7f8fa]"
                        >
                          <td className="py-3 pl-5 pr-3">
                            <div className="flex items-center gap-1.5 font-semibold text-[#0c1928]">
                              <span>{row.party}</span>
                              {attCount > 0 && (
                                <span
                                  className="no-print inline-flex items-center gap-0.5 rounded bg-[#edf1f3] px-1.5 py-0.5 text-[10px] font-semibold text-[#173d4a]"
                                  title={`${attCount} comprovante(s) salvo(s)`}
                                >
                                  <Paperclip className="size-2.5" />
                                  {attCount}
                                </span>
                              )}
                            </div>
                            {(row.description || row.accountLabel) && (
                              <div className="mt-0.5 text-[11px] text-[#7a8994]">
                                {[row.description || null, row.accountLabel || null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                          </td>

                          <td className="tabular-nums py-3 px-3 text-right font-medium text-[#52616a]">
                            {formatBRL(row.expectedCents)}
                          </td>

                          <td className="tabular-nums py-3 px-3 text-[#52616a]">
                            {formatDateBR(row.dueDate)}
                          </td>

                          <td className="tabular-nums py-3 px-3">
                            {row.isPendingDate ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-[#d97706]">
                                Pendente de conferência
                              </span>
                            ) : (
                              <span className="text-[#0c1928]">{formatDateBR(row.effectiveDate)}</span>
                            )}
                          </td>

                          <td className="tabular-nums py-3 px-3 text-right font-bold text-[#16a34a]">
                            {formatBRL(row.actualCents)}
                          </td>

                          <td
                            className={`tabular-nums py-3 px-3 text-right font-medium ${
                              row.differenceTone === "discount"
                                ? "text-[#16a34a]"
                                : row.differenceTone === "surcharge"
                                  ? "text-[#dc2626]"
                                  : row.differenceTone === "open"
                                    ? "text-[#d97706]"
                                    : "text-[#7a8994]"
                            }`}
                          >
                            {row.differenceLabel}
                          </td>

                          <td className="max-w-[260px] py-3 px-3 text-[#52616a]">
                            <div className="line-clamp-2">
                              {row.observation || <span className="text-[#9aa5ad]">—</span>}
                            </div>
                          </td>

                          <td className="no-print py-3 pl-3 pr-5 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEditRowId(row.id);
                              }}
                              aria-label={`Ajustar ${row.party}`}
                              title="Ajustar lançamento ou estornar"
                              className="inline-flex size-7 items-center justify-center rounded-md border border-[#dce2e6] bg-white text-[#173d4a] transition-colors hover:border-[#173d4a] hover:bg-[#edf1f3]"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Comprovantes modal on row click */}
      <AttachmentsModal
        row={selectedAttachmentRow}
        onClose={() => setSelectedAttachmentRowId(null)}
      />

      {/* Adjustment & Audit modal on pencil click */}
      <HistoryCorrectionModal
        row={selectedEditRow}
        onClose={() => setSelectedEditRowId(null)}
      />
    </div>
  );
}
