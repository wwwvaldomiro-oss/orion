import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileJson,
  Info,
  Layers,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useOrion } from "@/store/orionContext";
import { formatBRL } from "@/lib/domain/money";
import {
  buildImportPreview,
  parseOrionExportJson,
  type ImportConflictStrategy,
  type ImportExecutionReport,
  type ParsedOrionExport,
} from "@/lib/domain/orionImporter";

export function OrionImportPanel() {
  const { user, state, executeOrionImport } = useOrion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [parsedExport, setParsedExport] = useState<ParsedOrionExport | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [conflictStrategy, setConflictStrategy] =
    useState<ImportConflictStrategy>("keep_existing");
  const [showConflicts, setShowConflicts] = useState(false);
  const [showUnlinked, setShowUnlinked] = useState(false);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{
    phase: 1 | 2;
    completed: number;
    total: number;
  } | null>(null);
  const [report, setReport] = useState<ImportExecutionReport | null>(null);

  const previewPlan = useMemo(() => {
    if (!parsedExport) return null;
    return buildImportPreview(parsedExport, state);
  }, [parsedExport, state]);

  const actionableWriteCount = useMemo(() => {
    if (!previewPlan) return 0;
    return previewPlan.writes.filter((w) => {
      if (w.blockedByMissingParent) return false;
      if (w.action === "insert") return true;
      return conflictStrategy === "overwrite_with_json";
    }).length;
  }, [previewPlan, conflictStrategy]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setReport(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = parseOrionExportJson(text);
      setParsedExport(parsed);
      setShowConflicts(false);
      setShowUnlinked(false);
    } catch (err) {
      setParsedExport(null);
      const msg =
        err instanceof Error
          ? err.message
          : "Não foi possível ler o arquivo JSON selecionado.";
      setParseError(msg);
      toast.error(msg);
    }
  }

  function handleReset() {
    setFileName("");
    setParsedExport(null);
    setParseError(null);
    setReport(null);
    setProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleConfirmImport() {
    if (!previewPlan) return;
    if (!user || !user.emailVerified) {
      toast.error("Autentique-se com uma conta Google verificada para confirmar a importação.");
      return;
    }

    setImporting(true);
    setReport(null);
    setProgress({ phase: 1, completed: 0, total: actionableWriteCount });

    try {
      const execReport = await executeOrionImport(
        previewPlan,
        conflictStrategy,
        (info) => setProgress(info),
      );
      setReport(execReport);
      toast.success(
        `Importação confirmada: ${execReport.inserted} inseridos, ${execReport.conflictsUpdated} atualizados em ${execReport.batchesCommitted} lote(s).`,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao persistir os registros no Firestore.";
      toast.error(msg);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-[#dce2e6] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf1f3] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileJson className="size-5 text-[#173d4a]" />
            <h2 className="text-lg font-semibold text-[#0c1928]">
              Importar Dados Financeiros (Órion `orion-personal-data` v1)
            </h2>
          </div>
          <p className="text-xs text-[#52616a]">
            Restaura o histórico completo a partir de um arquivo JSON exportado do Órion, com
            prévia detalhada, preservação de IDs, ordem por dependência e zero duplicação em
            reimportações.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-[#dce2e6] bg-[#f7f8fa] px-3 py-2 text-xs">
          {user?.emailVerified ? (
            <>
              <ShieldCheck className="size-4 text-[#16a34a]" />
              <span className="font-semibold text-[#0c1928]">
                Firestore ativo ({user.email})
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="size-4 text-[#d97706]" />
              <span className="font-semibold text-[#b45309]">
                Conta Google verificada necessária para gravar
              </span>
            </>
          )}
        </div>
      </div>

      {/* File picker bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#cbd3d8] bg-[#f7f8fa] p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-semibold text-[#0c1928]">
            {fileName ? `Arquivo selecionado: ${fileName}` : "Selecione o arquivo JSON exportado"}
          </div>
          <p className="text-xs text-[#52616a]">
            O arquivo é processado localmente no navegador e enviado diretamente para sua conta
            privada no Firestore após sua confirmação. Nenhum dado financeiro é gravado no código.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#173d4a] px-3.5 text-xs font-semibold text-white hover:bg-[#0c1928]">
            <Upload className="size-3.5" />
            {parsedExport ? "Trocar arquivo" : "Selecionar JSON"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleFileSelect(e)}
              disabled={importing}
              className="hidden"
            />
          </label>
          {(parsedExport || parseError || report) && (
            <button
              type="button"
              onClick={handleReset}
              disabled={importing}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#dce2e6] bg-white px-3 text-xs font-semibold text-[#52616a] hover:bg-[#edf1f3]"
            >
              <X className="size-3.5" /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* Validation error */}
      {parseError && (
        <div className="flex items-start gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-xs text-[#b91c1c]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-semibold">Não foi possível validar o arquivo</div>
            <p className="mt-0.5">{parseError}</p>
          </div>
        </div>
      )}

      {/* Post-commit verified execution report */}
      {report && (
        <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-xs text-[#166534]">
          <div className="flex items-center gap-2 text-sm font-bold text-[#15803d]">
            <CheckCircle2 className="size-4" /> Importação confirmada e gravada no Firestore
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-white/80 p-2.5">
              <div className="text-[11px] text-[#52616a]">Inseridos</div>
              <div className="tabular-nums text-base font-bold text-[#0c1928]">
                {report.inserted}
              </div>
            </div>
            <div className="rounded-lg bg-white/80 p-2.5">
              <div className="text-[11px] text-[#52616a]">Já existentes</div>
              <div className="tabular-nums text-base font-bold text-[#0c1928]">
                {report.alreadyExists}
              </div>
            </div>
            <div className="rounded-lg bg-white/80 p-2.5">
              <div className="text-[11px] text-[#52616a]">Conflitos tratados</div>
              <div className="tabular-nums text-base font-bold text-[#0c1928]">
                {report.conflictsUpdated} atualizados · {report.conflictsPreserved} mantidos
              </div>
            </div>
            <div className="rounded-lg bg-white/80 p-2.5">
              <div className="text-[11px] text-[#52616a]">Lotes / Etapas</div>
              <div className="tabular-nums text-base font-bold text-[#0c1928]">
                {report.batchesCommitted} lote(s) · {report.phasesCommitted} etapa(s)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dry-run Preview */}
      {previewPlan && (
        <div className="space-y-5">
          {/* Summary KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3.5">
              <div className="text-[11px] font-semibold text-[#52616a] uppercase">
                Registros no arquivo
              </div>
              <div className="tabular-nums mt-1 text-xl font-bold text-[#0c1928]">
                {previewPlan.totalRecordsInFile}
              </div>
              <div className="mt-0.5 text-[11px] text-[#52616a]">
                Origem: {previewPlan.sourceApp}
                {previewPlan.exportedAt ? ` · ${previewPlan.exportedAt.slice(0, 10)}` : ""}
              </div>
            </div>

            <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3.5">
              <div className="text-[11px] font-semibold text-[#52616a] uppercase">
                Novos a inserir
              </div>
              <div className="tabular-nums mt-1 text-xl font-bold text-[#16a34a]">
                {previewPlan.totals.inserts}
              </div>
              <div className="mt-0.5 text-[11px] text-[#52616a]">
                Etapa 1 (pais) → Etapa 2 (movimentos)
              </div>
            </div>

            <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3.5">
              <div className="text-[11px] font-semibold text-[#52616a] uppercase">
                Já existem (idênticos)
              </div>
              <div className="tabular-nums mt-1 text-xl font-bold text-[#173d4a]">
                {previewPlan.totals.alreadyExists}
              </div>
              <div className="mt-0.5 text-[11px] text-[#52616a]">
                Ignorados sem duplicação
              </div>
            </div>

            <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3.5">
              <div className="text-[11px] font-semibold text-[#52616a] uppercase">
                Conflitos · Sem vínculo
              </div>
              <div className="tabular-nums mt-1 text-xl font-bold text-[#d97706]">
                {previewPlan.totals.conflicts} · {previewPlan.totals.unlinked}
              </div>
              <div className="mt-0.5 text-[11px] text-[#52616a]">
                Revisão detalhada abaixo
              </div>
            </div>
          </div>

          {/* Safety & Isolation Notices */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3 text-xs text-[#52616a]">
              <Info className="mt-0.5 size-4 shrink-0 text-[#173d4a]" />
              <div>
                <span className="font-semibold text-[#0c1928]">
                  Restauração pura de histórico (sem efeitos colaterais):
                </span>{" "}
                a importação grava os registros exatamente como exportados, sem disparar baixas,
                sem alterar saldos bancários e sem gerar novas parcelas duplicadas. Retratos de cartão
                entram somente como histórico pontual de cada mês.
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3 text-xs text-[#52616a]">
              <Layers className="mt-0.5 size-4 shrink-0 text-[#173d4a]" />
              <div>
                <span className="font-semibold text-[#0c1928]">
                  Coleções vazias preservadas ({previewPlan.emptyModulesSkipped.length}):
                </span>{" "}
                {previewPlan.emptyModulesSkipped.length > 0
                  ? `${previewPlan.emptyModulesSkipped.join(", ")} vieram vazias e não apagarão dados do destino.`
                  : "Nenhuma coleção vazia ignorada."}
              </div>
            </div>
          </div>

          {previewPlan.unmappedNonEmptyModules.length > 0 && (
            <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e]">
              Módulos não mapeados ignorados:{" "}
              {previewPlan.unmappedNonEmptyModules
                .map((m) => `${m.module} (${m.count})`)
                .join(", ")}
            </div>
          )}

          {/* Module-by-module preview table */}
          <div className="overflow-x-auto rounded-xl border border-[#dce2e6]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f7f8fa] text-[#52616a]">
                <tr className="border-b border-[#dce2e6]">
                  <th className="px-3 py-2.5">Etapa</th>
                  <th className="px-3 py-2.5">Coleção</th>
                  <th className="px-3 py-2.5 text-right">Arquivo</th>
                  <th className="px-3 py-2.5 text-right">Inserir</th>
                  <th className="px-3 py-2.5 text-right">Existem</th>
                  <th className="px-3 py-2.5 text-right">Conflitos</th>
                  <th className="px-3 py-2.5 text-right">Sem vínculo</th>
                  <th className="px-3 py-2.5 text-right">Total previsto</th>
                  <th className="px-3 py-2.5 text-right">Pago / Recebido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f3]">
                {previewPlan.moduleStats
                  .filter((m) => m.totalInFile > 0)
                  .map((m) => (
                    <tr key={m.module} className="hover:bg-[#f7f8fa]">
                      <td className="px-3 py-2 font-semibold text-[#52616a]">
                        Etapa {m.phase}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-[#0c1928]">{m.label}</div>
                        <div className="font-mono text-[10px] text-[#7a8994]">{m.module}</div>
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right font-semibold">
                        {m.totalInFile}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right font-semibold text-[#16a34a]">
                        {m.inserts}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right text-[#52616a]">
                        {m.alreadyExists}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right font-semibold text-[#d97706]">
                        {m.conflicts}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right font-semibold text-[#dc2626]">
                        {m.unlinked}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right font-medium text-[#0c1928]">
                        {m.totalExpectedCents > 0 ? formatBRL(m.totalExpectedCents) : "—"}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right font-medium text-[#173d4a]">
                        {m.totalSettledCents > 0 ? formatBRL(m.totalSettledCents) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Yearly Summary Breakdown */}
          {previewPlan.yearStats.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-[#dce2e6]">
              <div className="border-b border-[#dce2e6] bg-[#f7f8fa] px-3 py-2 text-xs font-semibold text-[#0c1928]">
                Resumo por Exercício
              </div>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#edf1f3] text-[#52616a]">
                  <tr>
                    <th className="px-3 py-2">Ano</th>
                    <th className="px-3 py-2 text-right">Credores anuais</th>
                    <th className="px-3 py-2 text-right">Previsto anual</th>
                    <th className="px-3 py-2 text-right">Contas mensais</th>
                    <th className="px-3 py-2 text-right">Pago mensal</th>
                    <th className="px-3 py-2 text-right">Recebíveis</th>
                    <th className="px-3 py-2 text-right">Recebido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f3]">
                  {previewPlan.yearStats.map((ys) => (
                    <tr key={ys.year} className="hover:bg-[#f7f8fa]">
                      <td className="tabular-nums px-3 py-2 font-bold text-[#0c1928]">
                        {ys.year}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right">{ys.annualRows}</td>
                      <td className="tabular-nums px-3 py-2 text-right">
                        {formatBRL(ys.annualExpectedCents)}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right">
                        {ys.billsCount} ({formatBRL(ys.billsExpectedCents)})
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right text-[#16a34a]">
                        {formatBRL(ys.billsPaidCents)}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right">
                        {ys.revenuesCount} ({formatBRL(ys.revenuesExpectedCents)})
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right text-[#173d4a]">
                        {formatBRL(ys.revenuesReceivedCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Expandable Conflicts & Unlinked Inspectors */}
          {(previewPlan.conflicts.length > 0 || previewPlan.unlinked.length > 0) && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {previewPlan.conflicts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowConflicts((v) => !v)}
                    className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-1.5 text-xs font-semibold text-[#b45309]"
                  >
                    {showConflicts ? "Ocultar" : "Inspecionar"} conflitos (
                    {previewPlan.conflicts.length})
                  </button>
                )}
                {previewPlan.unlinked.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowUnlinked((v) => !v)}
                    className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-1.5 text-xs font-semibold text-[#b91c1c]"
                  >
                    {showUnlinked ? "Ocultar" : "Inspecionar"} registros sem vínculo (
                    {previewPlan.unlinked.length})
                  </button>
                )}
              </div>

              {showConflicts && previewPlan.conflicts.length > 0 && (
                <div className="max-h-60 overflow-y-auto rounded-xl border border-[#fde68a] bg-[#fffbeb]/60 p-3 text-xs">
                  <div className="mb-2 font-semibold text-[#92400e]">
                    Registros divergentes com o destino
                  </div>
                  <div className="divide-y divide-[#fde68a]">
                    {previewPlan.conflicts.map((c, i) => (
                      <div key={`${c.sourceId}-${i}`} className="py-1.5">
                        <span className="font-semibold text-[#0c1928]">{c.label}</span>{" "}
                        <span className="font-mono text-[10px] text-[#7a8994]">({c.module})</span>{" "}
                        · Campos diferentes: {c.changedFields.join(", ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showUnlinked && previewPlan.unlinked.length > 0 && (
                <div className="max-h-60 overflow-y-auto rounded-xl border border-[#fecaca] bg-[#fef2f2]/60 p-3 text-xs">
                  <div className="mb-2 font-semibold text-[#b91c1c]">
                    Registros com referência ausente no arquivo/destino
                  </div>
                  <div className="divide-y divide-[#fecaca]">
                    {previewPlan.unlinked.map((u, i) => (
                      <div key={`${u.sourceId}-${i}`} className="py-1.5">
                        <span className="font-semibold text-[#0c1928]">{u.label}</span>{" "}
                        <span className="font-mono text-[10px] text-[#7a8994]">({u.module})</span>{" "}
                        · Referência ausente: <code>{u.missingRefField}</code> ={" "}
                        <code>{u.missingRefId}</code> ·{" "}
                        <span className={u.canStillImport ? "text-[#b45309]" : "text-[#dc2626]"}>
                          {u.canStillImport
                            ? "Importado com marcação Sem vínculo"
                            : "Bloqueado sem registro pai"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conflict policy + Confirm Action */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-4">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#0c1928]">
                Política para registros em conflito ({previewPlan.totals.conflicts}):
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="conflictStrategy"
                    checked={conflictStrategy === "keep_existing"}
                    onChange={() => setConflictStrategy("keep_existing")}
                    disabled={importing}
                    className="accent-[#173d4a]"
                  />
                  <span>Manter existentes no destino (Recomendado)</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="conflictStrategy"
                    checked={conflictStrategy === "overwrite_with_json"}
                    onChange={() => setConflictStrategy("overwrite_with_json")}
                    disabled={importing}
                    className="accent-[#173d4a]"
                  />
                  <span>Sobrescrever existentes com o JSON</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {progress && (
                <div className="text-xs font-semibold text-[#173d4a]">
                  Etapa {progress.phase}/2 · {progress.completed}/{progress.total}
                </div>
              )}
              <button
                type="button"
                disabled={importing || !user?.emailVerified || actionableWriteCount === 0}
                onClick={() => void handleConfirmImport()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" /> Gravando no Firestore...
                  </>
                ) : actionableWriteCount === 0 ? (
                  <>
                    <CheckCircle2 className="size-4" /> Tudo já sincronizado (0 alterações)
                  </>
                ) : (
                  <>
                    <Database className="size-4" /> Confirmar importação ({actionableWriteCount}{" "}
                    registro{actionableWriteCount === 1 ? "" : "s"})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
