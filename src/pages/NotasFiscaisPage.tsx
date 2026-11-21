import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ref as storageRef, uploadBytes, getBlob, getDownloadURL } from "firebase/storage";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarPlus,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  FilePlus,
  FileText,
  FolderOpen,
  Link2,
  PackageCheck,
  Pencil,
  ScanLine,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
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
import { storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import {
  FiscalQrScannerModal,
  type QrScanResultPayload,
} from "@/components/FiscalQrScannerModal";
import { useOrion } from "@/store/orionContext";
import { downloadBlob } from "@/lib/domain/invoice";
import { parseFiscalInput, parseNfeXml } from "@/lib/fiscalDocuments";
import { computeSha256Hex, convertReceiptPhotoToPdf } from "@/lib/pdfReceipt";
import {
  buildArchiveFolderPath,
  buildFiscalExportPackage,
  classifyArchiveCategory,
  cleanName,
  computeMarketIntelligence,
  extractAccessKey,
  normalizeProduct,
  suggestReceiptKind,
  suggestTransactionMatches,
  type FiscalDocType,
  type FiscalReceipt,
  type ReceiptItem,
  type ReceiptKind,
} from "@/lib/receiptAnalysis";

const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((c || 0) / 100);
const digits = (v: string) => Math.round(Math.max(0, Number(v.replace(",", ".")) || 0) * 100);
const price = (c: number) => String(((c || 0) / 100).toFixed(2)).replace(".", ",");
const safeName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

const DOC_TYPE_LABELS: Record<FiscalDocType, string> = {
  nfce_65: "NFC-e (Mod. 65)",
  nfe_55: "NF-e (Mod. 55)",
  nfse: "NFS-e (Serviço)",
  recibo: "Cupom / Recibo",
};

function addMonthsIso(dateIso: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !Number.isFinite(months) || months <= 0) {
    return "";
  }
  const parts = dateIso.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

function warrantyStatusBadge(endsAt?: string): { label: string; cls: string } {
  if (!endsAt || !/^\d{4}-\d{2}-\d{2}$/.test(endsAt)) {
    return { label: "Sem prazo definido", cls: "bg-[#edf1f3] text-[#52616a]" };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (endsAt < today) {
    return { label: "Garantia expirada", cls: "bg-[#fef2f2] text-[#b91c1c]" };
  }
  const diffDays = Math.ceil((Date.parse(`${endsAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (diffDays <= 30) {
    return { label: `Vence em ${diffDays}d`, cls: "bg-[#fffbeb] text-[#b45309]" };
  }
  return { label: "Garantia vigente", cls: "bg-[#f0fdf4] text-[#15803d]" };
}

function statusBadge(note: FiscalReceipt): { label: string; cls: string } {
  const st = note.processingStatus ?? (note.items.length > 0 ? "complete" : "partial");
  if (st === "complete") return { label: "Completa", cls: "bg-[#f0fdf4] text-[#15803d]" };
  if (st === "partial")
    return { label: "Parcial (sem itens)", cls: "bg-[#fffbeb] text-[#b45309]" };
  if (st === "error") return { label: "Erro na leitura", cls: "bg-[#fef2f2] text-[#b91c1c]" };
  return { label: "Pendente", cls: "bg-[#edf1f3] text-[#52616a]" };
}

function emptyReceipt(kind: ReceiptKind = "geral"): FiscalReceipt {
  return {
    id: "",
    kind,
    docType: "nfce_65",
    uf: "DF",
    store: "",
    cnpj: "",
    issuedAt: new Date().toISOString().slice(0, 10),
    accessKey: "",
    number: "",
    series: "",
    paymentMethod: "",
    discountCents: 0,
    totalCents: 0,
    items: [],
    processingStatus: "pending",
    sourceOrigin: "manual",
    lowConfidenceFields: [],
  };
}

export function NotasFiscaisPage() {
  const {
    user,
    state,
    saveFiscalReceipt,
    deleteFiscalReceipt,
    createWarrantyAgendaAlert,
  } = useOrion();

  const notes = state.fiscalReceipts;
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<ReceiptKind | "relatorio">(() => {
    const t = searchParams.get("tab");
    return t === "mercado" || t === "aquisicoes" || t === "relatorio" ? t : "geral";
  });
  const [viewMode, setViewMode] = useState<"lista" | "pastas">("lista");
  const [edit, setEdit] = useState<FiscalReceipt | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [consultingUrl, setConsultingUrl] = useState(false);
  const [convertingPdf, setConvertingPdf] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FiscalReceipt | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; mime: string } | null>(
    null,
  );
  const [creatingAgendaId, setCreatingAgendaId] = useState<string | null>(null);

  const [inputKey, setInputKey] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterStore, setFilterStore] = useState("");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "geral" || t === "mercado" || t === "aquisicoes" || t === "relatorio") {
      setTab(t);
    }
    const q = searchParams.get("q");
    if (!q) return;
    setSearch(q);
    const cleaned = cleanName(q);
    const match = notes.find((n) =>
      cleanName(`${n.store} ${n.accessKey} ${n.number}`).includes(cleaned),
    );
    if (match) {
      setTab(match.kind);
    }
  }, [searchParams, notes]);

  const availableYears = useMemo(
    () =>
      [...new Set(notes.map((n) => n.issuedAt.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort(
        (a, b) => b.localeCompare(a),
      ),
    [notes],
  );

  const availableStores = useMemo(
    () => [...new Set(notes.map((n) => n.store.trim()).filter(Boolean))].sort(),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = cleanName(search);
    return notes.filter((n) => {
      if (tab !== "relatorio" && n.kind !== tab) return false;
      if (filterYear && !n.issuedAt.startsWith(filterYear)) return false;
      if (filterMonth && !n.issuedAt.startsWith(filterMonth)) return false;
      if (filterStore && cleanName(n.store) !== cleanName(filterStore)) return false;
      if (!q) return true;
      const haystack = cleanName(
        [
          n.store,
          n.cnpj,
          n.accessKey,
          n.number,
          n.archiveCategory ?? "",
          n.warranty?.productName ?? "",
          n.warranty?.serialNumber ?? "",
          ...n.items.map((i) => `${i.description} ${i.normalizedName ?? ""}`),
        ].join(" "),
      );
      return haystack.includes(q);
    });
  }, [notes, tab, filterYear, filterMonth, filterStore, search]);

  const archiveTree = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, FiscalReceipt[]>>>();
    for (const n of filtered) {
      const year = n.issuedAt.slice(0, 4) || "Sem ano";
      const month = n.issuedAt.slice(5, 7) || "00";
      const cat = n.archiveCategory || classifyArchiveCategory(n.store, n.kind, n.items);
      if (!map.has(year)) map.set(year, new Map());
      const mMap = map.get(year)!;
      if (!mMap.has(month)) mMap.set(month, new Map());
      const cMap = mMap.get(month)!;
      if (!cMap.has(cat)) cMap.set(cat, []);
      cMap.get(cat)!.push(n);
    }
    return map;
  }, [filtered]);

  const marketReport = useMemo(
    () =>
      computeMarketIntelligence(notes, {
        kind: tab === "mercado" ? "mercado" : "all",
        year: filterYear || undefined,
        month: filterMonth || undefined,
        store: filterStore || undefined,
      }),
    [notes, tab, filterYear, filterMonth, filterStore],
  );

  const txSuggestions = useMemo(() => {
    if (!edit) return [];
    return suggestTransactionMatches(edit, state.transactions, state.cards, state.banks);
  }, [edit, state.transactions, state.cards, state.banks]);

  async function applyXmlString(xmlText: string, base?: FiscalReceipt) {
    const parsed = parseNfeXml(xmlText);
    const kind =
      base && base.kind !== "geral"
        ? base.kind
        : suggestReceiptKind(parsed.store, parsed.items);

    const dupe = notes.find(
      (n) => parsed.accessKey && n.accessKey === parsed.accessKey && n.id !== (base?.id ?? ""),
    );
    if (dupe) {
      toast.warning(`Nota já cadastrada anteriormente (${dupe.store} · ${dupe.issuedAt}).`);
    }

    const enrichedItems = parsed.items.map((item) => {
      const norm = normalizeProduct(item.description, item.ean);
      return {
        ...item,
        normalizedName: norm.normalizedName,
        normalizedKey: norm.normalizedKey,
        brand: norm.brand,
        packSize: norm.packSize,
      };
    });

    setEdit({
      ...(base ?? emptyReceipt(kind)),
      kind,
      docType: parsed.docType,
      uf: parsed.uf,
      store: parsed.store,
      cnpj: parsed.cnpj,
      emitterAddress: parsed.emitterAddress,
      issuedAt: parsed.issuedAt,
      issuedTime: parsed.issuedTime,
      accessKey: parsed.accessKey,
      number: parsed.number,
      series: parsed.series,
      paymentMethod: parsed.paymentMethod,
      discountCents: parsed.discountCents,
      totalCents: parsed.totalCents,
      items: enrichedItems,
      processingStatus: enrichedItems.length > 0 ? "complete" : "partial",
      processingError: undefined,
      sourceOrigin: "xml",
      lowConfidenceFields: [],
    });
    toast.success(`XML fiscal interpretado (${enrichedItems.length} itens extraídos).`);
  }

  async function consultOfficialUrl(url: string, base: FiscalReceipt) {
    if (!user) return;
    setConsultingUrl(true);
    try {
      const bearer = await user.getIdToken();
      const response = await fetch("/api/fiscal/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as {
        status?: string;
        xml?: string;
        portalUrl?: string;
        message?: string;
        receipt?: {
          store?: string;
          cnpj?: string;
          issuedAt?: string;
          issuedTime?: string;
          totalCents?: number;
          items?: Partial<ReceiptItem>[];
        };
      };

      if (data.status === "xml" && data.xml) {
        await applyXmlString(data.xml, { ...base, sourceUrl: data.portalUrl || url });
        return;
      }

      if (data.status === "extracted" && data.receipt) {
        const items: ReceiptItem[] = (data.receipt.items ?? []).map((item) => {
          const desc = String(item.description || "").slice(0, 250);
          const norm = normalizeProduct(desc);
          return {
            originalDescription: desc,
            description: desc,
            normalizedName: norm.normalizedName,
            normalizedKey: norm.normalizedKey,
            brand: norm.brand,
            packSize: norm.packSize,
            quantity: Math.max(0, Number(item.quantity) || 1),
            unit: String(item.unit || "un").slice(0, 12),
            unitPriceCents: Math.max(0, Math.round(Number(item.unitPriceCents) || 0)),
            totalCents: Math.max(0, Math.round(Number(item.totalCents) || 0)),
          };
        });
        const store = data.receipt.store || base.store;
        const kind = base.kind === "geral" ? suggestReceiptKind(store, items) : base.kind;
        setEdit({
          ...base,
          kind,
          store,
          cnpj: data.receipt.cnpj || base.cnpj,
          issuedAt: data.receipt.issuedAt || base.issuedAt,
          issuedTime: data.receipt.issuedTime || base.issuedTime,
          totalCents: data.receipt.totalCents || base.totalCents,
          items,
          sourceUrl: data.portalUrl || url,
          processingStatus: items.length > 0 ? "complete" : "partial",
          processingError:
            items.length === 0
              ? "Documento identificado. Os produtos ainda não foram extraídos."
              : undefined,
          sourceOrigin: "url",
        });
        toast.success("Dados públicos da NFC-e carregados. Confira antes de salvar.");
        return;
      }

      // CAPTCHA, login, or layout without public table
      setEdit({
        ...base,
        sourceUrl: data.portalUrl || url,
        processingStatus: "partial",
        processingError:
          data.message ||
          "Documento identificado. Os produtos ainda não foram extraídos.",
        sourceOrigin: "url",
      });
      toast.warning(
        data.message || "Documento identificado. Os produtos ainda não foram extraídos.",
      );
    } catch {
      setEdit({
        ...base,
        sourceUrl: url,
        processingStatus: "partial",
        processingError: "Documento identificado. Os produtos ainda não foram extraídos.",
      });
      toast.warning("Documento identificado. Os produtos ainda não foram extraídos.");
    } finally {
      setConsultingUrl(false);
    }
  }

  async function processKeyOrUrl(rawValue: string, origin: "qr" | "url" = "url") {
    const parsed = parseFiscalInput(rawValue);
    if (!parsed.accessKey && !parsed.sourceUrl) {
      toast.error("Informe uma chave de 44 dígitos ou uma URL válida de consulta fiscal.");
      return;
    }

    if (parsed.accessKey) {
      const dupe = notes.find((n) => n.accessKey === parsed.accessKey);
      if (dupe) {
        toast.warning(`Chave já cadastrada (${dupe.store}). Abrindo registro existente.`);
        setEdit({ ...dupe });
        return;
      }
    }

    const base: FiscalReceipt = {
      ...emptyReceipt(tab === "mercado" ? "mercado" : tab === "aquisicoes" ? "aquisicoes" : "geral"),
      docType: parsed.docType,
      uf: parsed.uf || "DF",
      cnpj: parsed.cnpj,
      accessKey: parsed.accessKey,
      number: parsed.number,
      series: parsed.series,
      sourceUrl: parsed.officialPortalUrl,
      issuedAt: parsed.issuedYearMonth
        ? `${parsed.issuedYearMonth}-01`
        : new Date().toISOString().slice(0, 10),
      processingStatus: "partial",
      processingError:
        parsed.validationMessage ||
        "Documento identificado. Os produtos ainda não foram extraídos.",
      sourceOrigin: origin,
    };

    if (parsed.accessKey && !parsed.keyValid && parsed.validationMessage) {
      toast.warning(parsed.validationMessage);
    }

    setInputKey(parsed.accessKey || parsed.raw);
    setEdit(base);

    if (parsed.canAttemptAutoConsult && parsed.sourceUrl) {
      await consultOfficialUrl(parsed.sourceUrl, base);
    } else {
      toast.message(
        "Documento identificado. Os produtos ainda não foram extraídos — consulte o portal ou anexe XML/PDF/foto.",
      );
    }
  }

  async function handleFileAttached(pickedFile: File, detectedQrText?: string) {
    try {
      const buf = await pickedFile.arrayBuffer();
      const hash = await computeSha256Hex(buf);
      const dupeByHash = notes.find((n) => n.fileHash === hash && n.id !== (edit?.id ?? ""));
      if (dupeByHash) {
        toast.warning(`Este arquivo já foi importado em "${dupeByHash.store}". Abrindo nota.`);
        setEdit({ ...dupeByHash });
        return;
      }

      setFileHash(hash);

      const isXml =
        pickedFile.name.toLowerCase().endsWith(".xml") ||
        pickedFile.type.includes("xml");
      if (isXml) {
        const xmlText = await pickedFile.text();
        const base =
          edit ??
          emptyReceipt(
            tab === "mercado" ? "mercado" : tab === "aquisicoes" ? "aquisicoes" : "geral",
          );
        await applyXmlString(xmlText, {
          ...base,
          fileHash: hash,
          fileName: pickedFile.name,
          fileMimeType: "application/xml",
        });
        setFile(null);
        return;
      }

      setFile(pickedFile);
      const base =
        edit ??
        emptyReceipt(
          tab === "mercado" ? "mercado" : tab === "aquisicoes" ? "aquisicoes" : "geral",
        );

      if (detectedQrText) {
        const parsed = parseFiscalInput(detectedQrText);
        const enriched: FiscalReceipt = {
          ...base,
          docType: parsed.docType,
          uf: parsed.uf || base.uf,
          cnpj: parsed.cnpj || base.cnpj,
          accessKey: parsed.accessKey || base.accessKey,
          number: parsed.number || base.number,
          series: parsed.series || base.series,
          sourceUrl: parsed.officialPortalUrl || base.sourceUrl,
          fileHash: hash,
          fileName: pickedFile.name,
          fileMimeType: pickedFile.type,
          processingStatus: base.items.length > 0 ? "complete" : "partial",
          processingError:
            base.items.length > 0
              ? undefined
              : "Documento identificado. Os produtos ainda não foram extraídos.",
          sourceOrigin: "qr",
        };
        setEdit(enriched);
        if (parsed.canAttemptAutoConsult && parsed.sourceUrl) {
          await consultOfficialUrl(parsed.sourceUrl, enriched);
        }
      } else {
        setEdit({
          ...base,
          fileHash: hash,
          fileName: pickedFile.name,
          fileMimeType: pickedFile.type,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler o arquivo selecionado.");
    }
  }

  async function handleQrDecoded(payload: QrScanResultPayload) {
    setScannerOpen(false);
    await processKeyOrUrl(payload.rawValue, "qr");
  }

  async function handleConvertPhotoToPdf() {
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Selecione ou fotografe uma imagem primeiro.");
      return;
    }
    setConvertingPdf(true);
    try {
      const pdfFile = await convertReceiptPhotoToPdf(file);
      const hash = await computeSha256Hex(await pdfFile.arrayBuffer());
      setFile(pdfFile);
      setFileHash(hash);
      setEdit((prev) =>
        prev
          ? {
              ...prev,
              fileName: pdfFile.name,
              fileMimeType: pdfFile.type,
              fileHash: hash,
            }
          : prev,
      );
      toast.success("PDF fiel gerado a partir da foto original.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF da foto.");
    } finally {
      setConvertingPdf(false);
    }
  }

  async function doOCR() {
    if (!file) {
      toast.error("Selecione PDF ou imagem antes de executar OCR");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("OCR aceita arquivos até 8 MB");
      return;
    }
    if (!user) return;
    setExtracting(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      }
      const bearer = await user.getIdToken();
      const response = await fetch("/api/fiscal/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ mimeType: file.type, base64: btoa(binary) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha OCR");

      const r = data.receipt as Partial<FiscalReceipt> & {
        items?: Partial<ReceiptItem>[];
      };
      setEdit((p) => {
        if (!p) return p;
        const items: ReceiptItem[] = Array.isArray(r.items)
          ? r.items.slice(0, 150).map((item) => {
              const desc = String(item.description || "").slice(0, 250);
              const norm = normalizeProduct(desc, item.ean);
              const qty = Math.max(0, Number(item.quantity) || 1);
              const unitPriceCents = Math.max(0, Math.round(Number(item.unitPriceCents) || 0));
              const discountCents = Math.max(0, Math.round(Number(item.discountCents) || 0));
              const totalCents = Math.max(
                0,
                Math.round(Number(item.totalCents) || qty * unitPriceCents),
              );
              return {
                ...(item.code ? { code: String(item.code).slice(0, 40) } : {}),
                ...(item.ean ? { ean: String(item.ean).slice(0, 20) } : {}),
                originalDescription: desc,
                description: desc,
                normalizedName: norm.normalizedName,
                normalizedKey: norm.normalizedKey,
                brand: norm.brand,
                packSize: norm.packSize,
                quantity: qty,
                unit: String(item.unit || "un").slice(0, 12),
                unitPriceCents,
                ...(discountCents > 0 ? { discountCents } : {}),
                totalCents,
              };
            })
          : p.items;

        const store = String(r.store || p.store);
        const kind = p.kind === "geral" ? suggestReceiptKind(store, items) : p.kind;
        const lowConfidenceFields = Array.isArray(r.lowConfidenceFields)
          ? r.lowConfidenceFields.map(String)
          : [];

        return {
          ...p,
          kind,
          docType:
            r.docType === "nfe_55" || r.docType === "nfse" || r.docType === "recibo"
              ? r.docType
              : p.docType,
          store,
          cnpj: String(r.cnpj || p.cnpj),
          emitterAddress: String(r.emitterAddress || p.emitterAddress || ""),
          issuedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(r.issuedAt || ""))
            ? String(r.issuedAt)
            : p.issuedAt,
          issuedTime: String(r.issuedTime || p.issuedTime || ""),
          accessKey: extractAccessKey(String(r.accessKey || p.accessKey)),
          number: String(r.number || p.number),
          series: String(r.series || p.series),
          paymentMethod: String(r.paymentMethod || p.paymentMethod),
          discountCents:
            typeof r.discountCents === "number" ? Math.round(r.discountCents) : p.discountCents,
          totalCents: Math.round(Number(r.totalCents) || p.totalCents),
          items,
          processingStatus: items.length > 0 ? "complete" : "partial",
          processingError:
            items.length === 0
              ? "Documento identificado. Os produtos ainda não foram extraídos."
              : undefined,
          sourceOrigin: "ocr",
          lowConfidenceFields,
        };
      });
      toast.success("OCR concluído: confira os campos destacados antes de salvar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha OCR");
    } finally {
      setExtracting(false);
    }
  }

  async function uploadPrivateAttachment(noteId: string) {
    if (!file || !user) return undefined;
    if (file.size > 15 * 1024 * 1024) throw new Error("Arquivo acima de 15 MB");
    if (
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      throw new Error("Anexo suportado apenas para PDF ou imagem (JPEG/PNG/WebP).");
    }
    const path = `users/${user.uid}/fiscalReceipts/${noteId}/${Date.now()}-${safeName(file.name)}`;
    const place = storageRef(storage, path);
    await uploadBytes(place, file, { contentType: file.type });
    const documentUrl = await getDownloadURL(place);
    return {
      storagePath: path,
      documentUrl,
      fileName: file.name,
      fileMimeType: file.type,
    };
  }

  async function openPrivateAttachment(note: FiscalReceipt) {
    try {
      if (note.storagePath) {
        const blob = await getBlob(storageRef(storage, note.storagePath));
        const blobUrl = URL.createObjectURL(blob);
        setPreviewDoc({
          title: note.fileName || `${note.store} · ${note.issuedAt}`,
          url: blobUrl,
          mime: note.fileMimeType || blob.type || "application/pdf",
        });
        return;
      }
      if (note.documentUrl) {
        setPreviewDoc({
          title: note.fileName || `${note.store} · ${note.issuedAt}`,
          url: note.documentUrl,
          mime: note.fileMimeType || "application/pdf",
        });
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Não foi possível abrir o arquivo privado: ${err.message}`
          : "Não foi possível abrir o arquivo anexado.",
      );
    }
  }

  async function save() {
    if (!edit || !user) return;
    if (!edit.store.trim() || !edit.issuedAt) {
      toast.error("Informe o estabelecimento e a data de emissão.");
      return;
    }
    setBusy(true);
    try {
      const id = edit.id || `nf-${crypto.randomUUID()}`;
      const uploaded = await uploadPrivateAttachment(id);
      const nextKind =
        edit.kind === "geral" ? suggestReceiptKind(edit.store, edit.items) : edit.kind;
      const category =
        edit.archiveCategory || classifyArchiveCategory(edit.store, nextKind, edit.items);

      await saveFiscalReceipt({
        ...edit,
        id,
        kind: nextKind,
        archiveCategory: category,
        folderPath: buildArchiveFolderPath(edit.issuedAt, category),
        fileHash: fileHash || edit.fileHash,
        ...(uploaded
          ? {
              storagePath: uploaded.storagePath,
              documentUrl: uploaded.documentUrl,
              fileName: uploaded.fileName,
              fileMimeType: uploaded.fileMimeType,
            }
          : {}),
        totalCents:
          edit.items.length > 0 && edit.totalCents <= 0
            ? edit.items.reduce((a, i) => a + i.totalCents, 0)
            : edit.totalCents,
        processingStatus:
          edit.items.length > 0 ? "complete" : edit.processingStatus ?? "partial",
      });
      setEdit(null);
      setFile(null);
      setFileHash("");
      toast.success("Nota fiscal salva com segurança.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar nota fiscal.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteFiscalReceipt(deleteTarget);
      if (edit?.id === deleteTarget.id) setEdit(null);
      setDeleteTarget(null);
      toast.success("Nota fiscal excluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  async function handleCreateWarrantyAlert(note: FiscalReceipt) {
    setCreatingAgendaId(note.id);
    try {
      await createWarrantyAgendaAlert(note);
      toast.success("Alerta de garantia criado na Agenda com lembretes antecipados.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar alerta na Agenda.");
    } finally {
      setCreatingAgendaId(null);
    }
  }

  function handleExportFiscalPackage() {
    if (notes.length === 0) {
      toast.warning("Nenhuma nota fiscal cadastrada para exportar em JSON.");
      return;
    }
    const pkg = buildFiscalExportPackage(notes);
    downloadBlob(
      new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" }),
      `orion-notas-fiscais-${new Date().toISOString().slice(0, 10)}.json`,
    );
    toast.success(
      `Backup JSON exportado (${pkg.manifest.count} nota(s) e ${pkg.manifest.itemCount} produto(s)).`,
    );
  }

  const addItem = () =>
    setEdit((p) =>
      p
        ? {
            ...p,
            items: [
              ...p.items,
              {
                description: "",
                normalizedName: "",
                quantity: 1,
                unit: "un",
                unitPriceCents: 0,
                totalCents: 0,
              },
            ],
          }
        : p,
    );

  const patchItem = (index: number, patch: Partial<ReceiptItem>) =>
    setEdit((p) => {
      if (!p) return p;
      const items = p.items.map((item, k) => {
        if (k !== index) return item;
        const next = { ...item, ...patch };
        if (patch.description !== undefined && !patch.normalizedName) {
          const norm = normalizeProduct(patch.description, next.ean);
          next.normalizedName = norm.normalizedName;
          next.normalizedKey = norm.normalizedKey;
        }
        const computedTotal = Math.max(
          0,
          Math.round(next.quantity * next.unitPriceCents) - (next.discountCents ?? 0),
        );
        return {
          ...next,
          totalCents: patch.totalCents !== undefined ? patch.totalCents : computedTotal,
        };
      });
      return { ...p, items };
    });

  const isLowConf = (field: string) =>
    Boolean(edit?.lowConfidenceFields?.some((f) => f.toLowerCase().includes(field.toLowerCase())));

  return (
    <AppShell
      title="Notas Fiscais"
      subtitle="NFC-e, NF-e, compras de mercado, garantias e conciliação sem duplicidade"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportFiscalPackage}
            title="Exportar todas as notas fiscais e produtos cadastrados em arquivo JSON"
            className="hidden items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] sm:inline-flex"
          >
            <Download className="size-3.5" /> Exportar JSON
          </button>
          <button
            type="button"
            onClick={() =>
              setEdit(
                emptyReceipt(
                  tab === "mercado" ? "mercado" : tab === "aquisicoes" ? "aquisicoes" : "geral",
                ),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c1928]"
          >
            <FilePlus className="size-4" /> Nova nota
          </button>
        </div>
      }
    >
      {/* Navigation Tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["geral", "Notas gerais"],
            ["mercado", "Mercado"],
            ["aquisicoes", "Aquisições / garantias"],
            ["relatorio", "Relatórios"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold sm:text-sm ${
              tab === k
                ? "bg-[#173d4a] text-white"
                : "border border-[#dce2e6] bg-white text-[#0c1928] hover:bg-[#f0f3f5]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Responsive Capture & Lookup Bar */}
      <section className="mb-5 space-y-3 rounded-xl border border-[#dce2e6] bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#173d4a] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#0c1928] sm:flex-none"
          >
            <Camera className="size-4" /> Ler QR Code / Foto
          </button>

          <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#dce2e6] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] sm:flex-none">
            <Upload className="size-4 text-[#173d4a]" />
            <span>Importar XML / PDF / Foto</span>
            <input
              type="file"
              accept=".xml,text/xml,application/xml,application/pdf,image/*"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = "";
                if (picked) void handleFileAttached(picked);
              }}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleExportFiscalPackage}
            title="Exportar notas fiscais e produtos em JSON"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2.5 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] sm:hidden"
          >
            <Download className="size-4" /> Exportar JSON
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Chave de acesso ou URL fiscal"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="Cole a URL da NFC-e ou digite a chave de acesso de 44 dígitos"
            className="min-w-0 flex-1 rounded-lg border border-[#cbd3d8] bg-[#f7f8fa] px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            disabled={consultingUrl}
            onClick={() => void processKeyOrUrl(inputKey, "url")}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#173d4a] bg-[#f2f6f7] px-4 py-2.5 text-xs font-semibold text-[#173d4a] hover:bg-[#e5eef0] disabled:opacity-50"
          >
            <ScanLine className="size-4" />
            {consultingUrl ? "Consultando..." : "Consultar / Usar chave"}
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-[#52616a]">
          O Órion valida a chave de 44 dígitos (Mod-11 + UF/DF), interpreta XMLs completos e tenta
          consultar portais estaduais públicos. Quando houver CAPTCHA, o portal oficial é indicado
          sem simular sucesso — use foto, PDF ou XML para concluir os itens.
        </p>
      </section>

      {/* Filters Row (shared across tabs) */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          placeholder="Buscar loja, produto, CNPJ ou chave"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm lg:col-span-2"
        />
        <select
          aria-label="Filtrar por ano"
          value={filterYear}
          onChange={(e) => {
            setFilterYear(e.target.value);
            if (filterMonth && e.target.value && !filterMonth.startsWith(filterYear)) {
              setFilterMonth("");
            }
          }}
          className="rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm"
        >
          <option value="">Todos os anos</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <input
          type="month"
          aria-label="Filtrar por mês"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm"
        />
        <select
          aria-label="Filtrar por estabelecimento"
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className="rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm"
        >
          <option value="">Todos os estabelecimentos</option>
          {availableStores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* TAB: RELATÓRIOS / INTELIGÊNCIA DE MERCADO */}
      {tab === "relatorio" ? (
        <div className="space-y-6">
          {/* 10 Market Intelligence KPIs Overview */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
              <div className="text-[11px] font-semibold uppercase text-[#52616a]">
                Total gasto no período
              </div>
              <div className="tabular-nums mt-1 text-2xl font-bold text-[#0c1928]">
                {money(marketReport.totalSpentCents)}
              </div>
              <div className="mt-1 text-xs text-[#52616a]">
                {marketReport.receiptCount} nota(s) · {money(marketReport.totalDiscountCents)} em
                descontos
              </div>
            </div>

            <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
              <div className="text-[11px] font-semibold uppercase text-[#52616a]">
                Maior preço unitário
              </div>
              <div className="mt-1 truncate text-base font-bold text-[#0c1928]">
                {marketReport.highestUnitPrice[0]?.name ?? "Sem itens"}
              </div>
              <div className="tabular-nums mt-1 text-sm font-semibold text-[#173d4a]">
                {marketReport.highestUnitPrice[0]
                  ? money(marketReport.highestUnitPrice[0].maxCents)
                  : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
              <div className="text-[11px] font-semibold uppercase text-[#52616a]">
                Maior gasto acumulado
              </div>
              <div className="mt-1 truncate text-base font-bold text-[#0c1928]">
                {marketReport.highestPeriodTotal[0]?.name ?? "Sem itens"}
              </div>
              <div className="tabular-nums mt-1 text-sm font-semibold text-[#173d4a]">
                {marketReport.highestPeriodTotal[0]
                  ? money(marketReport.highestPeriodTotal[0].spentCents)
                  : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-[#dce2e6] bg-white p-4">
              <div className="text-[11px] font-semibold uppercase text-[#52616a]">
                Maior oscilação de preço
              </div>
              <div className="mt-1 truncate text-base font-bold text-[#0c1928]">
                {marketReport.highestVariation[0]?.name ?? "Requer >= 2 compras"}
              </div>
              <div className="tabular-nums mt-1 text-sm font-semibold text-[#b45309]">
                {marketReport.highestVariation[0]
                  ? `+${marketReport.highestVariation[0].variationPercent}% entre menor e maior`
                  : "—"}
              </div>
            </div>
          </div>

          {/* Monthly Spending Chart + Store Comparison */}
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0c1928]">
                <BarChart3 className="size-4 text-[#173d4a]" /> Gasto por mês
              </h2>
              {marketReport.monthlySeries.length > 0 ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={marketReport.monthlySeries.map((m) => ({
                        month: m.month,
                        total: Number((m.totalCents / 100).toFixed(2)),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#edf1f3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: unknown) =>
                          money(Math.round(Number(value || 0) * 100))
                        }
                      />
                      <Bar dataKey="total" fill="#173d4a" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-xs text-[#52616a]">
                  Cadastre notas com data e valores para visualizar o histórico mensal.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0c1928]">
                <ShoppingBasket className="size-4 text-[#173d4a]" /> Comparativo por
                estabelecimento
              </h2>
              <div className="divide-y divide-[#edf1f3]">
                {marketReport.storeComparison.map((s) => (
                  <div
                    key={s.name}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[#0c1928]">{s.name}</div>
                      <div className="text-[#52616a]">
                        {s.visits} visita(s) · ticket médio {money(s.avgTicketCents)}
                      </div>
                    </div>
                    <div className="tabular-nums text-right">
                      <div className="font-bold text-[#0c1928]">{money(s.totalCents)}</div>
                      {s.discountCents > 0 && (
                        <div className="text-[11px] text-[#15803d]">
                          -{money(s.discountCents)} desc.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {marketReport.storeComparison.length === 0 && (
                  <p className="py-8 text-center text-xs text-[#52616a]">
                    Nenhum estabelecimento registrado no filtro atual.
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Price Increases vs Drops + Purchase Frequency */}
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#b91c1c]">
                <TrendingUp className="size-4" /> Ficaram mais caros
              </h2>
              <div className="divide-y divide-[#edf1f3] text-xs">
                {marketReport.priceIncreases.slice(0, 8).map((p) => (
                  <div key={p.key} className="flex items-center justify-between py-2">
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-semibold text-[#0c1928]">{p.name}</div>
                      <div className="text-[#52616a]">
                        {money(p.firstPriceCents)} → {money(p.lastPriceCents)}
                      </div>
                    </div>
                    <span className="tabular-nums shrink-0 rounded bg-[#fef2f2] px-2 py-0.5 font-bold text-[#b91c1c]">
                      +{p.changePercent}%
                    </span>
                  </div>
                ))}
                {marketReport.priceIncreases.length === 0 && (
                  <p className="py-4 text-[#52616a]">Sem altas registradas no histórico.</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#15803d]">
                <TrendingDown className="size-4" /> Ficaram mais baratos
              </h2>
              <div className="divide-y divide-[#edf1f3] text-xs">
                {marketReport.priceDrops.slice(0, 8).map((p) => (
                  <div key={p.key} className="flex items-center justify-between py-2">
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-semibold text-[#0c1928]">{p.name}</div>
                      <div className="text-[#52616a]">
                        {money(p.firstPriceCents)} → {money(p.lastPriceCents)}
                      </div>
                    </div>
                    <span className="tabular-nums shrink-0 rounded bg-[#f0fdf4] px-2 py-0.5 font-bold text-[#15803d]">
                      {p.changePercent}%
                    </span>
                  </div>
                ))}
                {marketReport.priceDrops.length === 0 && (
                  <p className="py-4 text-[#52616a]">Sem quedas registradas no histórico.</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0c1928]">
                <PackageCheck className="size-4 text-[#173d4a]" /> Frequência de compra
              </h2>
              <div className="divide-y divide-[#edf1f3] text-xs">
                {marketReport.frequencyByProduct.slice(0, 8).map((p) => (
                  <div key={p.key} className="flex items-center justify-between py-2">
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-semibold text-[#0c1928]">{p.name}</div>
                      <div className="text-[#52616a]">{p.count} compras</div>
                    </div>
                    <span className="tabular-nums shrink-0 font-semibold text-[#173d4a]">
                      {p.avgIntervalDays !== null ? `a cada ${p.avgIntervalDays}d` : `${p.count}x`}
                    </span>
                  </div>
                ))}
                {marketReport.frequencyByProduct.length === 0 && (
                  <p className="py-4 text-[#52616a]">
                    Compre o mesmo item 2+ vezes para medir a recorrência.
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Most Bought & Full Normalized Catalog */}
          <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0c1928]">
              <BarChart3 className="size-4 text-[#173d4a]" /> Produtos mais comprados & evolução de
              preço
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="border-b border-[#dce2e6] bg-[#f7f8fa] text-[#52616a]">
                  <tr>
                    <th className="p-2.5">Produto normalizado</th>
                    <th className="p-2.5 text-right">Compras</th>
                    <th className="p-2.5 text-right">Qtd. total</th>
                    <th className="p-2.5 text-right">Médio/un.</th>
                    <th className="p-2.5 text-right">Menor</th>
                    <th className="p-2.5 text-right">Maior</th>
                    <th className="p-2.5 text-right">Gasto total</th>
                    <th className="p-2.5 text-right">Evolução</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f3]">
                  {marketReport.mostBoughtProducts.slice(0, 50).map((p) => (
                    <tr key={p.key} className="hover:bg-[#f7f8fa]">
                      <td className="p-2.5 font-semibold text-[#0c1928]">
                        {p.name}
                        {p.stores.length > 0 && (
                          <div className="text-[11px] font-normal text-[#52616a]">
                            {p.stores.slice(0, 2).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="tabular-nums p-2.5 text-right">{p.count}</td>
                      <td className="tabular-nums p-2.5 text-right">
                        {p.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {p.unit}
                      </td>
                      <td className="tabular-nums p-2.5 text-right">{money(p.averageCents)}</td>
                      <td className="tabular-nums p-2.5 text-right text-[#15803d]">
                        {money(p.minCents)}
                      </td>
                      <td className="tabular-nums p-2.5 text-right text-[#b91c1c]">
                        {money(p.maxCents)}
                      </td>
                      <td className="tabular-nums p-2.5 text-right font-bold">
                        {money(p.spentCents)}
                      </td>
                      <td className="tabular-nums p-2.5 text-right font-semibold">
                        {p.changePercent > 0 ? (
                          <span className="text-[#b91c1c]">+{p.changePercent}%</span>
                        ) : p.changePercent < 0 ? (
                          <span className="text-[#15803d]">{p.changePercent}%</span>
                        ) : (
                          <span className="text-[#52616a]">0%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {marketReport.mostBoughtProducts.length === 0 && (
                <p className="py-8 text-center text-xs text-[#52616a]">
                  Nenhum produto extraído até o momento.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tab Header Tools: View toggle + Market quick summary */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[#52616a]">
              Exibindo <b className="text-[#0c1928]">{filtered.length}</b> documento(s) · Total{" "}
              <b className="tabular-nums text-[#0c1928]">
                {money(filtered.reduce((a, n) => a + (n.totalCents || 0), 0))}
              </b>
            </div>

            {tab === "geral" && (
              <div className="inline-flex rounded-lg border border-[#dce2e6] bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("lista")}
                  className={`rounded-md px-3 py-1.5 font-semibold ${
                    viewMode === "lista" ? "bg-[#173d4a] text-white" : "text-[#52616a]"
                  }`}
                >
                  Lista
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pastas")}
                  className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold ${
                    viewMode === "pastas" ? "bg-[#173d4a] text-white" : "text-[#52616a]"
                  }`}
                >
                  <FolderOpen className="size-3.5" /> Pastas (Ano/Mês)
                </button>
              </div>
            )}
          </div>

          {/* ARCHIVE FOLDER VIEW */}
          {tab === "geral" && viewMode === "pastas" ? (
            <div className="space-y-4">
              {[...archiveTree.entries()].map(([year, monthsMap]) => (
                <section
                  key={year}
                  className="rounded-xl border border-[#dce2e6] bg-white p-4"
                >
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0c1928]">
                    <Archive className="size-4 text-[#173d4a]" /> Exercício {year}
                  </h3>
                  <div className="space-y-3 pl-2">
                    {[...monthsMap.entries()]
                      .sort((a, b) => b[0].localeCompare(a[0]))
                      .map(([month, catMap]) => (
                        <div key={month} className="rounded-lg border border-[#edf1f3] bg-[#f7f8fa] p-3">
                          <div className="mb-2 text-xs font-bold text-[#173d4a]">
                            Mês {month}/{year}
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {[...catMap.entries()].map(([cat, list]) => (
                              <div
                                key={cat}
                                className="rounded-lg border border-[#dce2e6] bg-white p-3"
                              >
                                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#0c1928]">
                                  <span className="flex items-center gap-1.5">
                                    <FolderOpen className="size-3.5 text-[#b99555]" />
                                    {cat}
                                  </span>
                                  <span className="tabular-nums text-[#52616a]">
                                    {list.length} ·{" "}
                                    {money(list.reduce((a, x) => a + x.totalCents, 0))}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {list.map((n) => (
                                    <button
                                      key={n.id}
                                      type="button"
                                      onClick={() => setEdit({ ...n })}
                                      className="flex w-full items-center justify-between rounded border border-[#edf1f3] px-2.5 py-1.5 text-left text-xs hover:bg-[#f7f8fa]"
                                    >
                                      <span className="truncate pr-2 font-medium text-[#0c1928]">
                                        {n.issuedAt.split("-").reverse().join("/")} · {n.store}
                                      </span>
                                      <span className="tabular-nums shrink-0 font-semibold text-[#173d4a]">
                                        {money(n.totalCents)}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
              {filtered.length === 0 && (
                <div className="rounded-xl border border-[#dce2e6] bg-white p-8 text-center text-sm text-[#52616a]">
                  Nenhuma nota cadastrada para organizar em pastas.
                </div>
              )}
            </div>
          ) : (
            <>
              {/* MOBILE STACKED CARDS (zero horizontal overflow) */}
              <div className="space-y-3 md:hidden">
                {filtered.map((n) => {
                  const badge = statusBadge(n);
                  const wBadge =
                    n.kind === "aquisicoes"
                      ? warrantyStatusBadge(n.warranty?.warrantyEndsAt)
                      : null;
                  return (
                    <article
                      key={n.id}
                      onClick={() => setEdit({ ...n })}
                      className="cursor-pointer rounded-xl border border-[#dce2e6] bg-white p-4 shadow-xs active:bg-[#f7f8fa]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[#0c1928]">
                            {n.store || "Estabelecimento"}
                          </div>
                          <div className="mt-0.5 text-xs text-[#52616a]">
                            {n.issuedAt.split("-").reverse().join("/")} ·{" "}
                            {DOC_TYPE_LABELS[n.docType ?? "nfce_65"]}
                          </div>
                        </div>
                        <div className="tabular-nums shrink-0 text-right text-sm font-bold text-[#0c1928]">
                          {money(n.totalCents)}
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className={`rounded px-2 py-0.5 font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {wBadge && (
                          <span className={`rounded px-2 py-0.5 font-semibold ${wBadge.cls}`}>
                            {wBadge.label}
                          </span>
                        )}
                        {n.linkedTransactionId && (
                          <span className="inline-flex items-center gap-1 rounded bg-[#eef4f6] px-2 py-0.5 font-semibold text-[#173d4a]">
                            <Link2 className="size-3" /> Conciliada
                          </span>
                        )}
                        {(n.storagePath || n.documentUrl) && (
                          <span className="inline-flex items-center gap-1 rounded bg-[#f7f8fa] px-2 py-0.5 text-[#52616a]">
                            <FileText className="size-3" /> Anexo
                          </span>
                        )}
                      </div>

                      <p className="mt-2 line-clamp-2 text-xs text-[#52616a]">
                        {n.warranty?.productName
                          ? `Bem: ${n.warranty.productName}`
                          : n.items.length > 0
                            ? `${n.items.length} item(ns): ${n.items.map((i) => i.description).join("; ")}`
                            : n.processingError || "Sem itens extraídos"}
                      </p>

                      <div
                        className="mt-3 flex items-center justify-end gap-2 border-t border-[#edf1f3] pt-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(n.storagePath || n.documentUrl) && (
                          <button
                            type="button"
                            onClick={() => void openPrivateAttachment(n)}
                            className="rounded-lg border border-[#dce2e6] px-2.5 py-1.5 text-xs font-semibold text-[#0c1928]"
                          >
                            Ver anexo
                          </button>
                        )}
                        {n.kind === "aquisicoes" && n.warranty?.warrantyEndsAt && (
                          <button
                            type="button"
                            disabled={creatingAgendaId === n.id}
                            onClick={() => void handleCreateWarrantyAlert(n)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#173d4a]/30 bg-[#f2f6f7] px-2.5 py-1.5 text-xs font-semibold text-[#173d4a]"
                          >
                            <CalendarPlus className="size-3.5" /> Agenda
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEdit({ ...n })}
                          className="rounded-lg bg-[#173d4a] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Abrir
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!filtered.length && (
                  <p className="rounded-xl border border-[#dce2e6] bg-white p-6 text-center text-sm text-[#52616a]">
                    Nenhuma nota cadastrada nessa aba.
                  </p>
                )}
              </div>

              {/* DESKTOP TABLE */}
              <div className="hidden overflow-x-auto rounded-xl border border-[#dce2e6] bg-white md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#dce2e6] bg-[#f7f8fa] text-xs text-[#52616a]">
                    <tr>
                      <th className="p-3">Loja / Emissor</th>
                      <th className="p-3">Emissão</th>
                      <th className="p-3">Modelo / Pasta</th>
                      <th className="p-3">Itens / Bem</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f3]">
                    {filtered.map((n) => {
                      const badge = statusBadge(n);
                      const wBadge =
                        n.kind === "aquisicoes"
                          ? warrantyStatusBadge(n.warranty?.warrantyEndsAt)
                          : null;
                      return (
                        <tr
                          key={n.id}
                          onClick={() => setEdit({ ...n })}
                          className="cursor-pointer hover:bg-[#f7f8fa]"
                        >
                          <td className="p-3">
                            <div className="font-semibold text-[#0c1928]">{n.store}</div>
                            {n.cnpj && <div className="text-xs text-[#52616a]">{n.cnpj}</div>}
                          </td>
                          <td className="p-3 text-xs text-[#52616a]">
                            <div>{n.issuedAt.split("-").reverse().join("/")}</div>
                            {n.issuedTime && <div>{n.issuedTime}</div>}
                          </td>
                          <td className="p-3 text-xs">
                            <div className="font-medium text-[#0c1928]">
                              {DOC_TYPE_LABELS[n.docType ?? "nfce_65"]}
                            </div>
                            <div className="text-[#52616a]">
                              {n.archiveCategory || classifyArchiveCategory(n.store, n.kind, n.items)}
                            </div>
                          </td>
                          <td className="max-w-xs p-3 text-xs text-[#52616a]">
                            {n.warranty?.productName ? (
                              <span className="font-medium text-[#0c1928]">
                                {n.warranty.productName}
                              </span>
                            ) : n.items.length > 0 ? (
                              <span className="line-clamp-2">
                                {n.items.length} item(ns):{" "}
                                {n.items.map((i) => i.description).join("; ").slice(0, 140)}
                              </span>
                            ) : (
                              <span>{n.processingError || "Sem itens extraídos"}</span>
                            )}
                          </td>
                          <td className="p-3 text-xs">
                            <div className="flex flex-wrap gap-1">
                              <span className={`rounded px-2 py-0.5 font-semibold ${badge.cls}`}>
                                {badge.label}
                              </span>
                              {wBadge && (
                                <span
                                  className={`rounded px-2 py-0.5 font-semibold ${wBadge.cls}`}
                                >
                                  {wBadge.label}
                                </span>
                              )}
                              {n.linkedTransactionId && (
                                <span className="inline-flex items-center gap-1 rounded bg-[#eef4f6] px-2 py-0.5 font-semibold text-[#173d4a]">
                                  <Link2 className="size-3" /> Vinculada
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="tabular-nums p-3 text-right font-semibold text-[#0c1928]">
                            {money(n.totalCents)}
                          </td>
                          <td
                            className="p-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              {(n.storagePath || n.documentUrl) && (
                                <button
                                  type="button"
                                  onClick={() => void openPrivateAttachment(n)}
                                  title="Abrir anexo privado"
                                  className="rounded-lg border border-[#dce2e6] p-1.5 text-[#173d4a] hover:bg-[#edf1f3]"
                                >
                                  <FileText className="size-4" />
                                </button>
                              )}
                              {n.kind === "aquisicoes" && n.warranty?.warrantyEndsAt && (
                                <button
                                  type="button"
                                  disabled={creatingAgendaId === n.id}
                                  onClick={() => void handleCreateWarrantyAlert(n)}
                                  title="Criar alerta de garantia na Agenda"
                                  className="rounded-lg border border-[#dce2e6] p-1.5 text-[#173d4a] hover:bg-[#edf1f3]"
                                >
                                  <CalendarPlus className="size-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(n)}
                                title="Excluir nota"
                                className="rounded-lg border border-[#fecaca] p-1.5 text-[#dc2626] hover:bg-[#fef2f2]"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!filtered.length && (
                  <p className="p-6 text-center text-sm text-[#52616a]">
                    Nenhuma nota cadastrada nessa aba.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* QR Code Scanner & Fallback Modal */}
      <FiscalQrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onQrDecoded={(payload) => void handleQrDecoded(payload)}
        onFileSelected={(picked, qrText) => {
          setScannerOpen(false);
          void handleFileAttached(picked, qrText);
        }}
        onManualKeyOrUrl={(val) => {
          setScannerOpen(false);
          void processKeyOrUrl(val, "url");
        }}
      />

      {/* Receipt Editor / Review Modal */}
      {edit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={edit.id ? "Editar nota fiscal" : "Cadastrar nota fiscal"}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0c1928]/65 p-3 pb-20 md:p-4"
        >
          <section className="max-h-[88dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#dce2e6] bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-[#edf1f3] pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-[#0c1928] sm:text-lg">
                  <Pencil className="size-4 text-[#173d4a]" />
                  {edit.id ? "Revisar & editar nota fiscal" : "Nova nota fiscal"}
                </h2>
                <p className="text-xs text-[#52616a]">
                  Origem: {edit.sourceOrigin ?? "manual"} ·{" "}
                  {DOC_TYPE_LABELS[edit.docType ?? "nfce_65"]}
                  {edit.uf ? ` · UF ${edit.uf}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEdit(null);
                  setFile(null);
                  setFileHash("");
                }}
                aria-label="Fechar editor"
                className="grid size-8 place-items-center rounded-lg border border-[#dce2e6] text-[#52616a] hover:bg-[#f0f3f5]"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Honest Extraction Status Notice */}
            {edit.processingStatus === "partial" && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#d97706]" />
                <div className="space-y-1">
                  <div className="font-bold">
                    {edit.processingError ||
                      "Documento identificado. Os produtos ainda não foram extraídos."}
                  </div>
                  <p>
                    Você pode anexar o XML fiscal, enviar PDF/foto para OCR ou preencher os itens
                    manualmente abaixo antes de salvar.
                  </p>
                  {edit.sourceUrl && (
                    <a
                      href={edit.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold underline"
                    >
                      <ExternalLink className="size-3.5" /> Abrir consulta oficial SEFAZ
                    </a>
                  )}
                </div>
              </div>
            )}

            {edit.lowConfidenceFields && edit.lowConfidenceFields.length > 0 && (
              <div className="mt-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs text-[#92400e]">
                Campos com baixa confiança no OCR (revise com atenção):{" "}
                <b>{edit.lowConfidenceFields.join(", ")}</b>
              </div>
            )}

            {/* Core Metadata Form */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[#0c1928]">
                Loja / estabelecimento *
                <input
                  value={edit.store}
                  onChange={(e) => setEdit((p) => (p ? { ...p, store: e.target.value } : p))}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                    isLowConf("store") ? "border-[#f59e0b] bg-[#fffbeb]" : "border-[#cbd3d8]"
                  }`}
                />
              </label>
              <label className="text-xs font-semibold text-[#0c1928]">
                CNPJ
                <input
                  value={edit.cnpj}
                  onChange={(e) => setEdit((p) => (p ? { ...p, cnpj: e.target.value } : p))}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                    isLowConf("cnpj") ? "border-[#f59e0b] bg-[#fffbeb]" : "border-[#cbd3d8]"
                  }`}
                />
              </label>
              <label className="text-xs font-semibold text-[#0c1928]">
                Data de emissão *
                <input
                  type="date"
                  value={edit.issuedAt}
                  onChange={(e) => setEdit((p) => (p ? { ...p, issuedAt: e.target.value } : p))}
                  className="mt-1 w-full rounded-lg border border-[#cbd3d8] px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-[#0c1928]">
                  Categoria
                  <select
                    value={edit.kind}
                    onChange={(e) =>
                      setEdit((p) => (p ? { ...p, kind: e.target.value as ReceiptKind } : p))
                    }
                    className="mt-1 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 py-2 text-sm"
                  >
                    <option value="geral">Nota geral</option>
                    <option value="mercado">Mercado</option>
                    <option value="aquisicoes">Aquisições / garantia</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-[#0c1928]">
                  Modelo fiscal
                  <select
                    value={edit.docType ?? "nfce_65"}
                    onChange={(e) =>
                      setEdit((p) =>
                        p ? { ...p, docType: e.target.value as FiscalDocType } : p,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 py-2 text-sm"
                  >
                    <option value="nfce_65">NFC-e (65)</option>
                    <option value="nfe_55">NF-e (55)</option>
                    <option value="nfse">NFS-e</option>
                    <option value="recibo">Recibo</option>
                  </select>
                </label>
              </div>

              <label className="text-xs font-semibold text-[#0c1928] sm:col-span-2">
                Chave de acesso (44 dígitos)
                <input
                  value={edit.accessKey}
                  onChange={(e) => setEdit((p) => (p ? { ...p, accessKey: e.target.value } : p))}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs ${
                    isLowConf("accessKey") ? "border-[#f59e0b] bg-[#fffbeb]" : "border-[#cbd3d8]"
                  }`}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-[#0c1928]">
                  Número
                  <input
                    value={edit.number}
                    onChange={(e) => setEdit((p) => (p ? { ...p, number: e.target.value } : p))}
                    className="mt-1 w-full rounded-lg border border-[#cbd3d8] px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-[#0c1928]">
                  Série
                  <input
                    value={edit.series}
                    onChange={(e) => setEdit((p) => (p ? { ...p, series: e.target.value } : p))}
                    className="mt-1 w-full rounded-lg border border-[#cbd3d8] px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="text-xs font-semibold text-[#0c1928]">
                Forma de pagamento
                <input
                  value={edit.paymentMethod}
                  onChange={(e) =>
                    setEdit((p) => (p ? { ...p, paymentMethod: e.target.value } : p))
                  }
                  placeholder="Pix, Cartão de Crédito, Débito..."
                  className="mt-1 w-full rounded-lg border border-[#cbd3d8] px-3 py-2 text-sm"
                />
              </label>
            </div>

            {/* Attachment, PDF generation & OCR tools */}
            <div className="mt-5 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3.5">
              <div className="text-xs font-bold text-[#0c1928]">
                Documento anexo (XML fiscal, PDF ou foto)
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#edf1f3]">
                  <Upload className="size-3.5 text-[#173d4a]" />
                  <span>{file ? file.name : "Anexar XML / PDF / Foto"}</span>
                  <input
                    type="file"
                    accept=".xml,text/xml,application/xml,application/pdf,image/*"
                    onChange={(e) => {
                      const picked = e.target.files?.[0];
                      e.target.value = "";
                      if (picked) void handleFileAttached(picked);
                    }}
                    className="hidden"
                  />
                </label>

                {file && file.type.startsWith("image/") && (
                  <button
                    type="button"
                    disabled={convertingPdf}
                    onClick={() => void handleConvertPhotoToPdf()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-xs font-semibold text-[#173d4a] hover:bg-[#edf1f3] disabled:opacity-50"
                  >
                    <FileCode2 className="size-3.5" />
                    {convertingPdf ? "Gerando PDF..." : "Converter foto em PDF fiel"}
                  </button>
                )}

                {file && file.type !== "application/xml" && (
                  <button
                    type="button"
                    disabled={extracting}
                    onClick={() => void doOCR()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-50"
                  >
                    <Sparkles className="size-3.5" />
                    {extracting ? "Extraindo com OCR..." : "Ler produtos com OCR"}
                  </button>
                )}
              </div>
              {(edit.storagePath || edit.documentUrl) && (
                <button
                  type="button"
                  onClick={() => void openPrivateAttachment(edit)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#173d4a] underline"
                >
                  <FileText className="size-3.5" /> Visualizar anexo salvo na conta
                </button>
              )}
            </div>

            {/* Items Editor */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0c1928]">
                  Produtos / serviços ({edit.items.length})
                </h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="rounded-lg border border-[#dce2e6] bg-white px-2.5 py-1 text-xs font-semibold text-[#173d4a] hover:bg-[#f0f3f5]"
                >
                  + Adicionar item
                </button>
              </div>
              <div className="space-y-2">
                {edit.items.map((item, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 rounded-lg border border-[#edf1f3] bg-[#f7f8fa] p-2"
                  >
                    <input
                      aria-label="Descrição original"
                      placeholder="Descrição na nota"
                      value={item.description}
                      onChange={(e) => patchItem(i, { description: e.target.value })}
                      className="col-span-12 rounded border border-[#cbd3d8] bg-white px-2 py-1.5 text-xs sm:col-span-5"
                    />
                    <input
                      aria-label="Nome normalizado"
                      placeholder="Nome normalizado (Mercado)"
                      value={item.normalizedName ?? ""}
                      onChange={(e) =>
                        patchItem(i, {
                          normalizedName: e.target.value,
                          normalizedKey: cleanName(e.target.value).replace(/\s+/g, "-"),
                        })
                      }
                      className="col-span-12 rounded border border-[#cbd3d8] bg-white px-2 py-1.5 text-xs sm:col-span-4"
                    />
                    <input
                      aria-label="Quantidade"
                      type="number"
                      min="0"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => patchItem(i, { quantity: Number(e.target.value) })}
                      className="col-span-4 rounded border border-[#cbd3d8] bg-white px-2 py-1.5 text-xs sm:col-span-2"
                    />
                    <input
                      aria-label="Unidade"
                      value={item.unit}
                      onChange={(e) => patchItem(i, { unit: e.target.value })}
                      className="col-span-3 rounded border border-[#cbd3d8] bg-white px-2 py-1.5 text-xs sm:col-span-1"
                    />
                    <input
                      aria-label="Preço unitário"
                      value={price(item.unitPriceCents)}
                      onChange={(e) => patchItem(i, { unitPriceCents: digits(e.target.value) })}
                      className="col-span-5 rounded border border-[#cbd3d8] bg-white px-2 py-1.5 text-xs sm:col-span-3"
                    />
                    <div className="col-span-9 flex items-center justify-between px-1 text-xs font-semibold text-[#0c1928] sm:col-span-8">
                      <span>Subtotal: {money(item.totalCents)}</span>
                    </div>
                    <button
                      type="button"
                      aria-label="Remover produto"
                      onClick={() =>
                        setEdit((p) =>
                          p ? { ...p, items: p.items.filter((_, j) => j !== i) } : p,
                        )
                      }
                      className="col-span-3 flex items-center justify-end text-xs font-semibold text-[#dc2626] sm:col-span-1"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-bold text-[#0c1928]">
                  Total da nota:{" "}
                  {money(
                    edit.totalCents > 0
                      ? edit.totalCents
                      : edit.items.reduce((a, i) => a + i.totalCents, 0),
                  )}
                </div>
                <label className="text-xs font-semibold text-[#52616a]">
                  Ajustar total manual (R$)
                  <input
                    value={price(edit.totalCents)}
                    onChange={(e) =>
                      setEdit((p) => (p ? { ...p, totalCents: digits(e.target.value) } : p))
                    }
                    className="ml-2 w-28 rounded border border-[#cbd3d8] px-2 py-1 text-sm text-[#0c1928]"
                  />
                </label>
              </div>
            </div>

            {/* Acquisition / Warranty Details */}
            {edit.kind === "aquisicoes" && (
              <div className="mt-5 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-[#0c1928]">
                  <ShieldCheck className="size-4 text-[#173d4a]" /> Garantia & bem durável
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">
                    Nome do produto / bem
                    <input
                      value={edit.warranty?.productName ?? ""}
                      onChange={(e) =>
                        setEdit((p) =>
                          p
                            ? {
                                ...p,
                                warranty: { ...p.warranty, productName: e.target.value },
                              }
                            : p,
                        )
                      }
                      placeholder={edit.items[0]?.description || "Ex.: Notebook, Geladeira..."}
                      className="mt-1 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Número de série / patrimônio
                    <input
                      value={edit.warranty?.serialNumber ?? ""}
                      onChange={(e) =>
                        setEdit((p) =>
                          p
                            ? {
                                ...p,
                                warranty: { ...p.warranty, serialNumber: e.target.value },
                              }
                            : p,
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Garantia (meses)
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={edit.warranty?.warrantyMonths ?? ""}
                      onChange={(e) => {
                        const months = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                        setEdit((p) =>
                          p
                            ? {
                                ...p,
                                warranty: {
                                  ...p.warranty,
                                  warrantyMonths: months,
                                  warrantyEndsAt:
                                    months > 0
                                      ? addMonthsIso(p.issuedAt, months)
                                      : p.warranty?.warrantyEndsAt,
                                },
                              }
                            : p,
                        );
                      }}
                      className="mt-1 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Fim da garantia
                    <input
                      type="date"
                      value={edit.warranty?.warrantyEndsAt ?? ""}
                      onChange={(e) =>
                        setEdit((p) =>
                          p
                            ? {
                                ...p,
                                warranty: { ...p.warranty, warrantyEndsAt: e.target.value },
                              }
                            : p,
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                {edit.id && edit.warranty?.warrantyEndsAt && (
                  <button
                    type="button"
                    disabled={creatingAgendaId === edit.id}
                    onClick={() => void handleCreateWarrantyAlert(edit)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#173d4a] bg-white px-3 py-1.5 text-xs font-semibold text-[#173d4a] hover:bg-[#edf1f3]"
                  >
                    <CalendarPlus className="size-3.5" />
                    {edit.warranty.agendaRecordId
                      ? "Atualizar alerta na Agenda"
                      : "Criar alerta na Agenda"}
                  </button>
                )}
              </div>
            )}

            {/* Non-Duplicating Transaction Matcher */}
            <div className="mt-5 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-4">
              <label className="block text-xs font-bold text-[#0c1928]">
                Conciliar com movimentação existente (Pix, Débito, Crédito ou Pluggy)
                <select
                  value={edit.linkedTransactionId || ""}
                  onChange={(e) =>
                    setEdit((p) => (p ? { ...p, linkedTransactionId: e.target.value } : p))
                  }
                  className="mt-1.5 w-full rounded-lg border border-[#cbd3d8] bg-white p-2 text-xs"
                >
                  <option value="">Sem vínculo financeiro</option>
                  {txSuggestions.map((s) => (
                    <option key={s.transaction.id} value={s.transaction.id}>
                      {s.transaction.date} · {s.transaction.description} ·{" "}
                      {money(Math.abs(s.transaction.amountCents))} · {s.paymentChannel} (
                      {s.reason})
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#52616a]">
                <CheckCircle2 className="size-3.5 text-[#15803d]" />
                O vínculo apenas relaciona o cupom ao lançamento já existente — nunca cria nova
                despesa duplicada nem altera faturas fechadas.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[#edf1f3] pt-4">
              {edit.id && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(edit)}
                  className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-xs font-semibold text-[#dc2626]"
                >
                  Excluir
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEdit(null);
                  setFile(null);
                  setFileHash("");
                }}
                className="rounded-lg border border-[#dce2e6] bg-white px-4 py-2 text-xs font-semibold text-[#0c1928]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-lg bg-[#173d4a] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-50"
              >
                {busy ? "Salvando..." : "Salvar nota fiscal"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* In-app Private Attachment Viewer Modal */}
      {previewDoc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0c1928]/80 p-4"
        >
          <section className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#edf1f3] px-4 py-3">
              <div className="truncate text-sm font-bold text-[#0c1928]">{previewDoc.title}</div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.url}
                  download={previewDoc.title}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#dce2e6] px-3 py-1.5 text-xs font-semibold text-[#0c1928]"
                >
                  <Download className="size-3.5" /> Baixar
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (previewDoc.url.startsWith("blob:")) URL.revokeObjectURL(previewDoc.url);
                    setPreviewDoc(null);
                  }}
                  aria-label="Fechar visualização"
                  className="grid size-8 place-items-center rounded-lg border border-[#dce2e6] text-[#52616a]"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[#f7f8fa] p-3">
              {previewDoc.mime.startsWith("image/") ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.title}
                  className="mx-auto max-h-[75dvh] rounded-lg object-contain"
                />
              ) : (
                <iframe
                  title={previewDoc.title}
                  src={previewDoc.url}
                  className="h-[75dvh] w-full rounded-lg border border-[#dce2e6] bg-white"
                />
              )}
            </div>
          </section>
        </div>
      )}

      {/* In-app Delete Confirmation Modal (replaces window.confirm) */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0c1928]/70 p-4"
        >
          <section className="w-full max-w-sm rounded-2xl border border-[#dce2e6] bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-[#0c1928]">Excluir nota fiscal?</h3>
            <p className="mt-1.5 text-xs text-[#52616a]">
              Confirma a exclusão permanente de <b>{deleteTarget.store}</b> ({deleteTarget.issuedAt})
              e eventual arquivo anexado? Lançamentos da Carteira não serão removidos.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-[#dce2e6] px-3.5 py-2 text-xs font-semibold text-[#0c1928]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-[#dc2626] px-3.5 py-2 text-xs font-semibold text-white"
              >
                Excluir definitivamente
              </button>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
