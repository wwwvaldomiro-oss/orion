import { useEffect, useState } from "react";
import { Download, Eye, FileText, Image as ImageIcon, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { getBlob, ref as storageRef } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { downloadBlob } from "@/lib/domain/invoice";
import { resolveRowAttachments, type ResolvedAttachmentItem, type UnifiedHistoryRow } from "@/lib/domain/ledgerHistory";
import { formatBRL, formatDateBR } from "@/lib/domain/money";
import { useOrion } from "@/store/orionContext";

interface AttachmentsModalProps {
  row: UnifiedHistoryRow | null;
  onClose: () => void;
}

export function AttachmentsModal({ row, onClose }: AttachmentsModalProps) {
  const { state, uploadHistoryAttachment, attachToHistoryRow, removeAttachmentFromHistoryRow } = useOrion();
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    fileName: string;
    mimeType: string;
    url: string;
    isObjectUrl: boolean;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (preview?.isObjectUrl) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    setPreview((prev) => {
      if (prev?.isObjectUrl) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, [row?.id]);

  if (!row) return null;

  const attachments = resolveRowAttachments(row, state.fiscalReceipts);
  const emptyMessage =
    row.direction === "payment"
      ? "Nenhum comprovante salvo para este compromisso."
      : "Nenhum comprovante salvo para este recebimento.";

  async function resolveAttachmentBlob(item: ResolvedAttachmentItem): Promise<Blob> {
    if (item.storagePath) {
      return await getBlob(storageRef(storage, item.storagePath));
    }
    if (item.documentUrl) {
      const resp = await fetch(item.documentUrl);
      if (!resp.ok) throw new Error("Não foi possível baixar o arquivo.");
      return await resp.blob();
    }
    throw new Error("Arquivo sem caminho armazenado.");
  }

  async function handleView(item: ResolvedAttachmentItem) {
    setBusyId(item.id);
    try {
      const blob = await resolveAttachmentBlob(item);
      const url = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev?.isObjectUrl) URL.revokeObjectURL(prev.url);
        return {
          fileName: item.fileName,
          mimeType: item.mimeType || blob.type || "application/pdf",
          url,
          isObjectUrl: true,
        };
      });
    } catch {
      if (item.documentUrl) {
        setPreview({
          fileName: item.fileName,
          mimeType: item.mimeType,
          url: item.documentUrl,
          isObjectUrl: false,
        });
      } else {
        toast.error("Não foi possível carregar a visualização deste comprovante.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(item: ResolvedAttachmentItem) {
    setBusyId(item.id);
    try {
      const blob = await resolveAttachmentBlob(item);
      downloadBlob(blob, item.fileName || "comprovante");
    } catch {
      toast.error("Não foi possível baixar este comprovante.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !row) return;
    setUploading(true);
    try {
      for (const file of files) {
        const uploaded = await uploadHistoryAttachment(file, row.primaryTargetId || row.id);
        await attachToHistoryRow(row, uploaded);
      }
      toast.success(
        files.length === 1
          ? "Comprovante anexado com sucesso."
          : `${files.length} comprovantes anexados com sucesso.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar comprovante.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item: ResolvedAttachmentItem) {
    if (!row) return;
    setBusyId(item.id);
    try {
      await removeAttachmentFromHistoryRow(row, item.id);
      if (preview?.fileName === item.fileName) {
        if (preview.isObjectUrl) URL.revokeObjectURL(preview.url);
        setPreview(null);
      }
      toast.success(
        item.source === "fiscal_receipt"
          ? "Nota fiscal desvinculada deste registro."
          : "Comprovante removido.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover comprovante.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Comprovantes do registro"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#edf1f3] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-[#0c1928]">
              Comprovantes · {row.party}
            </h3>
            <p className="mt-0.5 text-xs text-[#52616a]">
              {row.direction === "payment" ? "Valor pago" : "Valor recebido"}:{" "}
              <strong className="tabular-nums text-[#16a34a]">{formatBRL(row.actualCents)}</strong>{" "}
              · Previsto: <span className="tabular-nums">{formatBRL(row.expectedCents)}</span> ·{" "}
              {row.isPendingDate
                ? "Pendente de conferência"
                : `${row.direction === "payment" ? "Pago" : "Recebido"} em ${formatDateBR(row.effectiveDate)}`}
            </p>
            {(row.accountLabel || row.observation) && (
              <p className="mt-1 truncate text-[11px] text-[#7a8994]">
                {[row.accountLabel ? `Conta: ${row.accountLabel}` : null, row.observation || null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de comprovantes"
            className="rounded-lg p-1.5 text-[#52616a] hover:bg-[#f0f3f5] hover:text-[#0c1928]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[#cbd3d8] bg-[#f7f8fa] px-4 py-3">
            <div className="text-xs text-[#52616a]">
              Anexe um ou mais comprovantes em <strong>PDF, JPG, PNG ou WEBP</strong> (até 15 MB).
            </div>
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0c1928] ${
                uploading ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {uploading ? "Enviando..." : "Anexar comprovante(s)"}
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                disabled={uploading}
                className="sr-only"
              />
            </label>
          </div>

          {attachments.length === 0 ? (
            <div className="rounded-xl border border-[#edf1f3] bg-[#f7f8fa] p-6 text-center text-sm text-[#52616a]">
              {emptyMessage}
            </div>
          ) : (
            <div className="divide-y divide-[#edf1f3] rounded-xl border border-[#dce2e6]">
              {attachments.map((item) => {
                const isImg = item.mimeType.startsWith("image/");
                const isBusy = busyId === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#edf1f3] text-[#173d4a]">
                        {isImg ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[#0c1928]">{item.fileName}</div>
                        <div className="text-[11px] text-[#7a8994]">
                          {item.source === "fiscal_receipt" ? "Nota fiscal vinculada" : "Comprovante anexado"}
                          {item.uploadedAt ? ` · ${formatDateBR(item.uploadedAt.slice(0, 10))}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleView(item)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#dce2e6] bg-white px-2.5 py-1.5 font-semibold text-[#0c1928] hover:bg-[#f0f3f5] disabled:opacity-50"
                      >
                        <Eye className="size-3.5" /> Visualizar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDownload(item)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#dce2e6] bg-white px-2.5 py-1.5 font-semibold text-[#173d4a] hover:bg-[#f0f3f5] disabled:opacity-50"
                      >
                        <Download className="size-3.5" /> Baixar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDelete(item)}
                        aria-label={`Remover ${item.fileName}`}
                        className="inline-flex items-center rounded-md border border-[#dce2e6] bg-white p-1.5 text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {preview && (
            <div className="space-y-2 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-semibold text-[#0c1928]">
                  Pré-visualização: {preview.fileName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (preview.isObjectUrl) URL.revokeObjectURL(preview.url);
                    setPreview(null);
                  }}
                  className="text-[#52616a] hover:text-[#0c1928]"
                >
                  Fechar visualização
                </button>
              </div>
              {preview.mimeType.startsWith("image/") ? (
                <img
                  src={preview.url}
                  alt={preview.fileName}
                  className="max-h-96 w-full rounded-lg border border-[#dce2e6] bg-white object-contain"
                />
              ) : (
                <iframe
                  src={preview.url}
                  title={preview.fileName}
                  className="h-96 w-full rounded-lg border border-[#dce2e6] bg-white"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-[#edf1f3] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-[#dce2e6] bg-white px-4 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
