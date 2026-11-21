import type { BankAccount, CreditCardAccount, WalletTransaction } from "@/types/orion";

export type ReceiptKind = "geral" | "mercado" | "aquisicoes";

export type FiscalDocType = "nfce_65" | "nfe_55" | "nfse" | "recibo";

export type ReceiptProcessingStatus = "complete" | "partial" | "pending" | "error";

export type ReceiptSourceOrigin = "manual" | "qr" | "url" | "xml" | "ocr" | "import";

export type ReceiptWarrantyInfo = {
  productName?: string;
  serialNumber?: string;
  warrantyMonths?: number;
  warrantyEndsAt?: string; // YYYY-MM-DD
  agendaRecordId?: string;
  notes?: string;
};

export type ReceiptItem = {
  code?: string;
  ean?: string;
  originalDescription?: string;
  description: string;
  normalizedName?: string;
  normalizedKey?: string;
  brand?: string;
  packSize?: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountCents?: number;
  totalCents: number;
};

export type FiscalReceipt = {
  id: string;
  ownerId?: string;
  kind: ReceiptKind;
  docType?: FiscalDocType;
  uf?: string;
  store: string;
  cnpj: string;
  emitterAddress?: string;
  issuedAt: string; // YYYY-MM-DD
  issuedTime?: string; // HH:MM
  accessKey: string;
  number: string;
  series: string;
  paymentMethod: string;
  discountCents?: number;
  totalCents: number;
  items: ReceiptItem[];
  archiveCategory?: string;
  folderPath?: string; // e.g. "2026/11/Mercado"
  storagePath?: string;
  fileName?: string;
  fileMimeType?: string;
  fileHash?: string;
  documentUrl?: string;
  sourceUrl?: string;
  linkedTransactionId?: string;
  processingStatus?: ReceiptProcessingStatus;
  processingError?: string;
  sourceOrigin?: ReceiptSourceOrigin;
  lowConfidenceFields?: string[];
  warranty?: ReceiptWarrantyInfo;
  sourceRecordId?: string;
};

export type ReceiptProductSummary = {
  key: string;
  name: string;
  unit: string;
  packSize: string;
  count: number;
  quantity: number;
  spentCents: number;
  averageCents: number;
  minCents: number;
  maxCents: number;
  firstPriceCents: number;
  lastPriceCents: number;
  changePercent: number;
  variationPercent: number;
  avgIntervalDays: number | null;
  stores: string[];
};

export type ReceiptStoreSummary = {
  name: string;
  visits: number;
  totalCents: number;
  avgTicketCents: number;
  discountCents: number;
};

export function cleanName(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractAccessKey(raw: string): string {
  const input = String(raw ?? "").trim();
  if (!input) return "";

  const paramMatch = input.match(/[?&](?:p|chNFe)=([0-9]{44})/i);
  if (paramMatch?.[1]) {
    return paramMatch[1];
  }

  const contiguous = input.match(/\b(\d{44})\b/);
  if (contiguous?.[1]) {
    return contiguous[1];
  }

  const onlyDigits = input.replace(/\D/g, "");
  if (onlyDigits.length === 44) {
    return onlyDigits;
  }
  const embedded = onlyDigits.match(/(\d{44})/);
  return embedded?.[1] ?? "";
}

const MARKET_KEYWORDS = [
  "mercado",
  "supermercado",
  "hipermercado",
  "atacad",
  "hortifruti",
  "sacolao",
  "padaria",
  "panificadora",
  "acougue",
  "mercearia",
  "armazem",
  "carrefour",
  "assai",
  "extra",
  "pao de acucar",
  "big box",
  "oba",
  "superbom",
  "super maia",
  "dona de casa",
  "atacadao",
  "sams club",
  "costco",
  "mateus",
  "comper",
  "fort atacadista",
  "super ade",
  "ultrabox",
];

const ACQUISITION_KEYWORDS = [
  "magazine",
  "magalu",
  "casas bahia",
  "fast shop",
  "kabum",
  "pichau",
  "terabyte",
  "apple",
  "samsung",
  "dell",
  "lenovo",
  "leroy",
  "telhanorte",
  "concessionaria",
  "autopecas",
  "pneu",
  "eletro",
  "moveis",
  "informatica",
  "notebook",
  "smartphone",
  "bicicletaria",
  "ferramentas",
  "kalunga",
  "decathlon",
];

const FUEL_KEYWORDS = ["posto", "combustivel", "auto posto", "shell", "ipiranga", "petrobras", "br mania", "gasolina"];
const PHARMACY_KEYWORDS = ["farmacia", "drogaria", "droga ", "drogasil", "pague menos", "raia", "ultrafarma"];

export function suggestReceiptKind(storeName: string, items: ReceiptItem[] = []): ReceiptKind {
  const normalized = cleanName([storeName, ...items.map((i) => i.description)].join(" "));
  if (!normalized) return "geral";
  if (MARKET_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "mercado";
  }
  if (ACQUISITION_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "aquisicoes";
  }
  return "geral";
}

export function classifyArchiveCategory(
  storeName: string,
  kind: ReceiptKind,
  items: ReceiptItem[] = [],
): string {
  if (kind === "mercado") return "Mercado";
  if (kind === "aquisicoes") return "Aquisições & Garantias";
  const normalized = cleanName([storeName, ...items.map((i) => i.description)].join(" "));
  if (FUEL_KEYWORDS.some((kw) => normalized.includes(kw))) return "Combustível";
  if (PHARMACY_KEYWORDS.some((kw) => normalized.includes(kw))) return "Farmácia";
  if (MARKET_KEYWORDS.some((kw) => normalized.includes(kw))) return "Mercado";
  if (ACQUISITION_KEYWORDS.some((kw) => normalized.includes(kw))) return "Aquisições & Garantias";
  return "Geral";
}

export function buildArchiveFolderPath(issuedAt: string, category: string): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}/.test(issuedAt) ? issuedAt : "2026-01-01";
  const year = safeDate.slice(0, 4);
  const month = safeDate.slice(5, 7);
  return `${year}/${month}/${category || "Geral"}`;
}

const KNOWN_BRANDS = [
  "tio joao",
  "camil",
  "nestle",
  "italac",
  "piracanjuba",
  "sadia",
  "perdigao",
  "seara",
  "friboi",
  "qualy",
  "doriana",
  "heinz",
  "hellmanns",
  "coca cola",
  "pepsi",
  "guarana antarctica",
  "omo",
  "ype",
  "colgate",
  "oral b",
  "pilao",
  "melitta",
  "tres coracoes",
  "barilla",
  "renata",
  "liza",
  "soya",
];

const PRODUCT_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(?:tp|t)\s*1\b|\btipo\s*1\b/gi, "tipo 1"],
  [/\b(?:tp|t)\s*2\b|\btipo\s*2\b/gi, "tipo 2"],
  [/\bpac(?:ote)?\b|\bpct\b/gi, " "],
  [/\bcx\b|\bcaixa\b/gi, " "],
  [/\blt\b|\blata\b/gi, " "],
  [/\bgf\b|\bgarrafa\b/gi, " "],
  [/\bfr\b|\bfrasco\b/gi, " "],
  [/\bbandeja\b|\bbdj\b/gi, " "],
  [/\barroz\s+branco\b/gi, "arroz"],
  [/\bfeijao\s+carioca\b/gi, "feijao carioca"],
  [/\bfeijao\s+preto\b/gi, "feijao preto"],
  [/\bleite\s+(?:uht\s+)?int(?:egral)?\b/gi, "leite integral"],
  [/\bleite\s+(?:uht\s+)?desn(?:atado)?\b/gi, "leite desnatado"],
  [/\bole[o]?\s+de?\s*soja\b/gi, "oleo soja"],
  [/\bacucar\s+cristal\b/gi, "acucar cristal"],
  [/\bacucar\s+refinado\b/gi, "acucar refinado"],
  [/\bcafe\s+(?:torrado\s+e\s+)?moido\b/gi, "cafe"],
];

function titleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 2 && /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export type NormalizedProduct = {
  normalizedName: string;
  normalizedKey: string;
  brand: string;
  packSize: string;
};

export function normalizeProduct(description: string, ean?: string): NormalizedProduct {
  const cleanedRaw = cleanName(description);
  if (!cleanedRaw) {
    return { normalizedName: "Produto", normalizedKey: "produto", brand: "", packSize: "" };
  }

  // Extract standardized pack size (e.g., 5kg, 500g, 1l, 350ml, 12un)
  let packSize = "";
  const packMatch = cleanedRaw.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l|lt|un|und)\b/i);
  if (packMatch?.[1] && packMatch[2]) {
    const num = packMatch[1].replace(",", ".");
    let unit = packMatch[2].toLowerCase();
    if (unit === "gr") unit = "g";
    if (unit === "lt") unit = "l";
    if (unit === "und") unit = "un";
    packSize = `${num}${unit}`;
  }

  let working = cleanedRaw;
  if (packMatch) {
    working = working.replace(packMatch[0], " ");
  }

  for (const [pattern, replacement] of PRODUCT_SYNONYMS) {
    working = working.replace(pattern, replacement);
  }

  let brand = "";
  for (const known of KNOWN_BRANDS) {
    if (working.includes(known)) {
      brand = titleCase(known);
      break;
    }
  }

  working = working.replace(/\s+/g, " ").trim();
  const displayParts = [titleCase(working || cleanedRaw), packSize].filter(Boolean);
  const normalizedName = displayParts.join(" ").trim();
  const keyBase = cleanName(normalizedName).replace(/\s+/g, "-");
  const normalizedKey =
    ean && /^\d{8,14}$/.test(ean) && ean !== "00000000"
      ? `${keyBase || "item"}__ean_${ean}`
      : keyBase || "item";

  return {
    normalizedName,
    normalizedKey,
    brand,
    packSize,
  };
}

export type MarketFilter = {
  year?: string;
  month?: string; // YYYY-MM
  store?: string;
  kind?: ReceiptKind | "all";
};

export type MarketMonthlyPoint = {
  month: string; // YYYY-MM
  totalCents: number;
  visits: number;
};

export type MarketIntelligenceReport = {
  totalSpentCents: number;
  receiptCount: number;
  totalDiscountCents: number;
  monthlySeries: MarketMonthlyPoint[];
  storeComparison: ReceiptStoreSummary[];
  mostBoughtProducts: ReceiptProductSummary[];
  highestUnitPrice: ReceiptProductSummary[];
  highestPeriodTotal: ReceiptProductSummary[];
  priceIncreases: ReceiptProductSummary[];
  priceDrops: ReceiptProductSummary[];
  frequencyByProduct: ReceiptProductSummary[];
  highestVariation: ReceiptProductSummary[];
  // Legacy summary fields for backward compatibility
  products: ReceiptProductSummary[];
  stores: ReceiptStoreSummary[];
};

export function computeMarketIntelligence(
  notes: FiscalReceipt[],
  filter?: MarketFilter,
): MarketIntelligenceReport {
  const filteredNotes = notes.filter((n) => {
    if (filter?.kind && filter.kind !== "all" && n.kind !== filter.kind) return false;
    if (filter?.year && !n.issuedAt.startsWith(filter.year)) return false;
    if (filter?.month && !n.issuedAt.startsWith(filter.month)) return false;
    if (filter?.store && cleanName(n.store) !== cleanName(filter.store)) return false;
    return true;
  });

  const sortedByDate = [...filteredNotes].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));

  let totalSpentCents = 0;
  let totalDiscountCents = 0;

  const monthlyMap = new Map<string, { totalCents: number; visits: number }>();
  const storeMap = new Map<
    string,
    { name: string; visits: number; totalCents: number; discountCents: number }
  >();

  type AccProd = {
    key: string;
    name: string;
    unit: string;
    packSize: string;
    count: number;
    quantity: number;
    spentCents: number;
    observations: Array<{ date: string; unitPriceCents: number; store: string }>;
    stores: Set<string>;
  };
  const productMap = new Map<string, AccProd>();

  for (const note of sortedByDate) {
    const noteTotal = Math.max(0, Math.round(note.totalCents || 0));
    const noteDiscount = Math.max(0, Math.round(note.discountCents || 0));
    totalSpentCents += noteTotal;
    totalDiscountCents += noteDiscount;

    const ym = note.issuedAt.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      const mPrev = monthlyMap.get(ym) ?? { totalCents: 0, visits: 0 };
      mPrev.totalCents += noteTotal;
      mPrev.visits += 1;
      monthlyMap.set(ym, mPrev);
    }

    const storeDisplay = note.store.trim() || "Estabelecimento";
    const storeKey = cleanName(storeDisplay) || storeDisplay.toLowerCase();
    const sPrev = storeMap.get(storeKey);
    if (sPrev) {
      sPrev.visits += 1;
      sPrev.totalCents += noteTotal;
      sPrev.discountCents += noteDiscount;
    } else {
      storeMap.set(storeKey, {
        name: storeDisplay,
        visits: 1,
        totalCents: noteTotal,
        discountCents: noteDiscount,
      });
    }

    for (const item of note.items ?? []) {
      const rawDesc = item.description.trim();
      if (!rawDesc) continue;

      const norm = normalizeProduct(item.normalizedName || rawDesc, item.ean);
      const groupKey =
        item.normalizedKey ||
        (item.normalizedName ? cleanName(item.normalizedName).replace(/\s+/g, "-") : norm.normalizedKey);
      const displayName = item.normalizedName?.trim() || norm.normalizedName || rawDesc;

      const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      const rawItemTotal = Math.max(0, Math.round(item.totalCents || qty * (item.unitPriceCents || 0)));
      const effectiveTotal = rawItemTotal;
      const effectiveUnitPrice =
        item.unitPriceCents > 0
          ? Math.round(item.unitPriceCents)
          : qty > 0
            ? Math.round(effectiveTotal / qty)
            : 0;

      const prev = productMap.get(groupKey);
      if (prev) {
        prev.count += 1;
        prev.quantity += qty;
        prev.spentCents += effectiveTotal;
        prev.stores.add(storeDisplay);
        if (effectiveUnitPrice > 0) {
          prev.observations.push({
            date: note.issuedAt,
            unitPriceCents: effectiveUnitPrice,
            store: storeDisplay,
          });
        }
      } else {
        productMap.set(groupKey, {
          key: groupKey,
          name: displayName,
          unit: item.unit || "un",
          packSize: item.packSize || norm.packSize,
          count: 1,
          quantity: qty,
          spentCents: effectiveTotal,
          observations:
            effectiveUnitPrice > 0
              ? [{ date: note.issuedAt, unitPriceCents: effectiveUnitPrice, store: storeDisplay }]
              : [],
          stores: new Set([storeDisplay]),
        });
      }
    }
  }

  const products: ReceiptProductSummary[] = [...productMap.values()]
    .map((p) => {
      const obs = [...p.observations].sort((a, b) => a.date.localeCompare(b.date));
      const prices = obs.map((o) => o.unitPriceCents);
      const avg =
        p.quantity > 0 && p.spentCents > 0
          ? Math.round(p.spentCents / p.quantity)
          : prices.length > 0
            ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
            : 0;
      const min = prices.length > 0 ? Math.min(...prices) : avg;
      const max = prices.length > 0 ? Math.max(...prices) : avg;
      const firstPrice = prices[0] ?? avg;
      const lastPrice = prices[prices.length - 1] ?? avg;

      const changePercent =
        obs.length >= 2 && firstPrice > 0
          ? Number((((lastPrice - firstPrice) / firstPrice) * 100).toFixed(1))
          : 0;
      const variationPercent =
        obs.length >= 2 && min > 0 ? Number((((max - min) / min) * 100).toFixed(1)) : 0;

      let avgIntervalDays: number | null = null;
      const uniqueDates = [...new Set(obs.map((o) => o.date))].sort();
      if (uniqueDates.length >= 2) {
        const firstMs = Date.parse(`${uniqueDates[0]}T00:00:00Z`);
        const lastMs = Date.parse(`${uniqueDates[uniqueDates.length - 1]}T00:00:00Z`);
        const diffDays = (lastMs - firstMs) / 86400000;
        if (diffDays > 0) {
          avgIntervalDays = Math.round(diffDays / (uniqueDates.length - 1));
        }
      }

      return {
        key: p.key,
        name: p.name,
        unit: p.unit,
        packSize: p.packSize,
        count: p.count,
        quantity: p.quantity,
        spentCents: p.spentCents,
        averageCents: avg,
        minCents: min,
        maxCents: max,
        firstPriceCents: firstPrice,
        lastPriceCents: lastPrice,
        changePercent,
        variationPercent,
        avgIntervalDays,
        stores: [...p.stores],
      };
    })
    .sort((a, b) => b.count - a.count || b.spentCents - a.spentCents || a.name.localeCompare(b.name));

  const stores: ReceiptStoreSummary[] = [...storeMap.values()]
    .map((s) => ({
      ...s,
      avgTicketCents: s.visits > 0 ? Math.round(s.totalCents / s.visits) : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents || b.visits - a.visits || a.name.localeCompare(b.name));

  const monthlySeries: MarketMonthlyPoint[] = [...monthlyMap.entries()]
    .map(([month, v]) => ({ month, totalCents: v.totalCents, visits: v.visits }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalSpentCents,
    receiptCount: filteredNotes.length,
    totalDiscountCents,
    monthlySeries,
    storeComparison: stores,
    mostBoughtProducts: [...products].sort(
      (a, b) => b.count - a.count || b.quantity - a.quantity,
    ),
    highestUnitPrice: [...products].sort((a, b) => b.maxCents - a.maxCents),
    highestPeriodTotal: [...products].sort((a, b) => b.spentCents - a.spentCents),
    priceIncreases: products
      .filter((p) => p.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent),
    priceDrops: products
      .filter((p) => p.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent),
    frequencyByProduct: products
      .filter((p) => p.count >= 2)
      .sort((a, b) => (a.avgIntervalDays ?? 999) - (b.avgIntervalDays ?? 999) || b.count - a.count),
    highestVariation: products
      .filter((p) => p.variationPercent > 0)
      .sort((a, b) => b.variationPercent - a.variationPercent),
    products,
    stores,
  };
}

export function receiptReport(notes: FiscalReceipt[]): {
  products: ReceiptProductSummary[];
  stores: ReceiptStoreSummary[];
} {
  const report = computeMarketIntelligence(notes);
  return { products: report.products, stores: report.stores };
}

export type TransactionMatchSuggestion = {
  transaction: WalletTransaction;
  score: number;
  amountDiffCents: number;
  daysDiff: number;
  paymentChannel: string;
  reason: string;
};

export function suggestTransactionMatches(
  receipt: Pick<FiscalReceipt, "store" | "issuedAt" | "totalCents" | "paymentMethod">,
  transactions: WalletTransaction[],
  cards: CreditCardAccount[],
  banks: BankAccount[],
): TransactionMatchSuggestion[] {
  const targetAmount = Math.max(0, Math.round(receipt.totalCents || 0));
  const storeTokens = cleanName(receipt.store)
    .split(" ")
    .filter((t) => t.length >= 3);
  const receiptDateMs = Date.parse(`${receipt.issuedAt}T00:00:00Z`);

  const bankIds = new Set(banks.map((b) => b.id));
  const cardIds = new Set(cards.map((c) => c.id));

  const candidates: TransactionMatchSuggestion[] = [];

  for (const tx of transactions) {
    if (tx.amountCents >= 0) continue; // Only outgoing expenses
    const absAmount = Math.abs(tx.amountCents);
    const amountDiffCents = Math.abs(absAmount - targetAmount);
    if (targetAmount > 0 && amountDiffCents > Math.max(5000, Math.round(targetAmount * 0.15))) {
      continue;
    }

    const txMs = Date.parse(`${tx.date}T00:00:00Z`);
    const daysDiff =
      Number.isFinite(receiptDateMs) && Number.isFinite(txMs)
        ? Math.abs(Math.round((txMs - receiptDateMs) / 86400000))
        : 99;
    if (daysDiff > 35) continue;

    let score = 0;
    const reasons: string[] = [];

    if (amountDiffCents === 0) {
      score += 55;
      reasons.push("Valor exato");
    } else if (amountDiffCents <= 100) {
      score += 40;
      reasons.push("Valor aproximado");
    } else if (amountDiffCents <= 1000) {
      score += 20;
    }

    if (daysDiff === 0) {
      score += 30;
      reasons.push("Mesma data");
    } else if (daysDiff <= 2) {
      score += 22;
      reasons.push(`Data próxima (${daysDiff}d)`);
    } else if (daysDiff <= 7) {
      score += 10;
    }

    const txClean = cleanName(`${tx.description} ${tx.institution} ${tx.accountName}`);
    const matchedTokens = storeTokens.filter((t) => txClean.includes(t));
    if (matchedTokens.length > 0) {
      score += 20;
      reasons.push("Estabelecimento compatível");
    }

    const isPluggy = tx.id.startsWith("pluggy_");
    const paymentChannel =
      tx.accountType === "CREDIT" || cardIds.has(tx.accountId)
        ? `${isPluggy ? "Pluggy · " : ""}Cartão de Crédito (${tx.accountName})`
        : bankIds.has(tx.accountId) || tx.accountType === "BANK"
          ? `${isPluggy ? "Pluggy · " : ""}Conta / Pix / Débito (${tx.accountName})`
          : tx.accountName || "Conta";

    candidates.push({
      transaction: tx,
      score,
      amountDiffCents,
      daysDiff,
      paymentChannel,
      reason: reasons.join(" · ") || "Lançamento no período",
    });
  }

  return candidates.sort((a, b) => b.score - a.score || a.amountDiffCents - b.amountDiffCents).slice(0, 40);
}

export function buildFiscalExportPackage(receipts: FiscalReceipt[]): {
  format: "orion-personal-data";
  version: 1;
  sourceApp: "Órion";
  exportedAt: string;
  manifest: {
    module: "fiscal_receipts";
    count: number;
    itemCount: number;
    totalCents: number;
    byYear: Record<string, number>;
    byCategory: Record<string, number>;
  };
  productsIndex: Array<{
    receiptId: string;
    issuedAt: string;
    store: string;
    description: string;
    normalizedName: string;
    quantity: number;
    unit: string;
    unitPriceCents: number;
    totalCents: number;
  }>;
  collections: Array<{
    module: "fiscal_receipts";
    records: Array<{ id: string; data: Record<string, unknown> }>;
  }>;
} {
  const byYear: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const productsIndex: Array<{
    receiptId: string;
    issuedAt: string;
    store: string;
    description: string;
    normalizedName: string;
    quantity: number;
    unit: string;
    unitPriceCents: number;
    totalCents: number;
  }> = [];
  let totalCents = 0;

  const records = receipts.map((r) => {
    const year = r.issuedAt.slice(0, 4) || "Sem ano";
    const category = r.archiveCategory || classifyArchiveCategory(r.store, r.kind, r.items);
    byYear[year] = (byYear[year] ?? 0) + 1;
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    totalCents += Math.max(0, Math.round(r.totalCents || 0));

    for (const item of r.items ?? []) {
      productsIndex.push({
        receiptId: r.id,
        issuedAt: r.issuedAt,
        store: r.store,
        description: item.description,
        normalizedName: item.normalizedName || item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.totalCents,
      });
    }

    return {
      id: r.id,
      data: {
        kind: r.kind,
        doc_type: r.docType ?? "nfce_65",
        uf: r.uf ?? "",
        store: r.store,
        cnpj: r.cnpj,
        emitter_address: r.emitterAddress ?? "",
        issued_at: r.issuedAt,
        issued_time: r.issuedTime ?? "",
        access_key: r.accessKey,
        number: r.number,
        series: r.series,
        payment_method: r.paymentMethod,
        discount_cents: r.discountCents ?? 0,
        total_cents: r.totalCents,
        items: r.items,
        archive_category: category,
        folder_path: r.folderPath ?? buildArchiveFolderPath(r.issuedAt, category),
        storage_path: r.storagePath ?? "",
        file_name: r.fileName ?? "",
        file_mime_type: r.fileMimeType ?? "",
        file_hash: r.fileHash ?? "",
        document_url: r.documentUrl ?? "",
        source_url: r.sourceUrl ?? "",
        linked_transaction_id: r.linkedTransactionId ?? "",
        processing_status: r.processingStatus ?? "complete",
        processing_error: r.processingError ?? "",
        source_origin: r.sourceOrigin ?? "manual",
        low_confidence_fields: r.lowConfidenceFields ?? [],
        warranty: r.warranty ?? null,
      },
    };
  });

  return {
    format: "orion-personal-data",
    version: 1,
    sourceApp: "Órion",
    exportedAt: new Date().toISOString(),
    manifest: {
      module: "fiscal_receipts",
      count: receipts.length,
      itemCount: productsIndex.length,
      totalCents,
      byYear,
      byCategory,
    },
    productsIndex,
    collections: [{ module: "fiscal_receipts", records }],
  };
}
