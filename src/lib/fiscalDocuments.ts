import { extractAccessKey, type FiscalDocType, type ReceiptItem } from "@/lib/receiptAnalysis";

export const UF_BY_CODE: Record<string, string> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

export type ParsedAccessKeyInfo = {
  valid: boolean;
  reason?: string;
  accessKey: string;
  ufCode: string;
  uf: string;
  yearMonth: string; // YYYY-MM
  cnpj: string;
  formattedCnpj: string;
  model: string;
  docType: FiscalDocType;
  series: string;
  number: string;
  checkDigitExpected: number;
  checkDigitActual: number;
};

export function formatCnpj(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  if (clean.length !== 14) return clean;
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function computeMod11CheckDigit(key43: string): number {
  let weight = 2;
  let sum = 0;
  for (let i = key43.length - 1; i >= 0; i--) {
    sum += Number(key43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  return mod === 0 || mod === 1 ? 0 : 11 - mod;
}

export function parseAccessKey44(raw: string): ParsedAccessKeyInfo | null {
  const digits = extractAccessKey(raw);
  if (digits.length !== 44 || !/^\d{44}$/.test(digits)) {
    return null;
  }

  const ufCode = digits.slice(0, 2);
  const uf = UF_BY_CODE[ufCode] ?? "";
  const yy = Number(digits.slice(2, 4));
  const mm = Number(digits.slice(4, 6));
  const cnpj = digits.slice(6, 20);
  const model = digits.slice(20, 22);
  const series = String(Number(digits.slice(22, 25)));
  const number = String(Number(digits.slice(25, 34)));
  const expectedDv = computeMod11CheckDigit(digits.slice(0, 43));
  const actualDv = Number(digits[43]);

  let valid = true;
  let reason: string | undefined;
  if (!uf) {
    valid = false;
    reason = `Código de UF desconhecido (${ufCode}).`;
  } else if (mm < 1 || mm > 12) {
    valid = false;
    reason = `Mês de emissão inválido na chave (${digits.slice(4, 6)}).`;
  } else if (expectedDv !== actualDv) {
    valid = false;
    reason = `Dígito verificador inválido (esperado ${expectedDv}, informado ${actualDv}).`;
  }

  const docType: FiscalDocType =
    model === "55" ? "nfe_55" : model === "65" ? "nfce_65" : "recibo";

  return {
    valid,
    reason,
    accessKey: digits,
    ufCode,
    uf,
    yearMonth: `20${String(yy).padStart(2, "0")}-${String(mm).padStart(2, "0")}`,
    cnpj,
    formattedCnpj: formatCnpj(cnpj),
    model,
    docType,
    series,
    number,
    checkDigitExpected: expectedDv,
    checkDigitActual: actualDv,
  };
}

export type ParsedFiscalQrInput = {
  raw: string;
  sourceUrl: string;
  accessKey: string;
  uf: string;
  docType: FiscalDocType;
  issuedYearMonth: string;
  cnpj: string;
  number: string;
  series: string;
  keyValid: boolean;
  validationMessage?: string;
  officialPortalUrl: string;
  canAttemptAutoConsult: boolean;
};

export function officialPortalUrlFor(uf: string, docType: FiscalDocType, sourceUrl?: string): string {
  if (sourceUrl && sourceUrl.startsWith("https://")) return sourceUrl;
  if (docType === "nfe_55") {
    return "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&nfe=";
  }
  if (uf === "DF") {
    return "https://www.fazenda.df.gov.br/nfce/";
  }
  return "https://www.nfe.fazenda.gov.br/portal/principal.aspx";
}

export function inferUfFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".df.gov.br")) return "DF";
  if (lower.includes(".go.gov.br")) return "GO";
  if (lower.includes(".sp.gov.br")) return "SP";
  if (lower.includes(".mg.gov.br")) return "MG";
  if (lower.includes(".rj.gov.br")) return "RJ";
  if (lower.includes(".pr.gov.br")) return "PR";
  if (lower.includes(".rs.gov.br")) return "RS";
  if (lower.includes(".sc.gov.br")) return "SC";
  if (lower.includes(".ba.gov.br")) return "BA";
  if (lower.includes(".pe.gov.br")) return "PE";
  if (lower.includes(".ce.gov.br")) return "CE";
  if (lower.includes(".es.gov.br")) return "ES";
  if (lower.includes(".mt.gov.br")) return "MT";
  if (lower.includes(".ms.gov.br")) return "MS";
  return "";
}

export function parseFiscalInput(rawInput: string): ParsedFiscalQrInput {
  const raw = rawInput.trim();
  const sourceUrl = raw.startsWith("https://")
    ? raw
    : raw.startsWith("http://")
      ? `https://${raw.slice(7)}`
      : "";

  const key = extractAccessKey(raw);
  const keyInfo = key ? parseAccessKey44(key) : null;
  const uf = keyInfo?.uf || inferUfFromUrl(raw);
  const docType: FiscalDocType = keyInfo?.docType ?? (sourceUrl.includes("nfce") ? "nfce_65" : "recibo");

  const officialUrl = officialPortalUrlFor(uf, docType, sourceUrl);

  return {
    raw,
    sourceUrl,
    accessKey: keyInfo?.accessKey ?? key,
    uf,
    docType,
    issuedYearMonth: keyInfo?.yearMonth ?? "",
    cnpj: keyInfo?.formattedCnpj ?? "",
    number: keyInfo?.number ?? "",
    series: keyInfo?.series ?? "",
    keyValid: Boolean(keyInfo?.valid),
    validationMessage: keyInfo?.reason,
    officialPortalUrl: officialUrl,
    canAttemptAutoConsult: Boolean(sourceUrl && sourceUrl.includes(".gov.br")),
  };
}

export type ParsedFiscalXmlResult = {
  docType: FiscalDocType;
  uf: string;
  store: string;
  cnpj: string;
  emitterAddress: string;
  issuedAt: string;
  issuedTime: string;
  accessKey: string;
  number: string;
  series: string;
  paymentMethod: string;
  discountCents: number;
  totalCents: number;
  items: ReceiptItem[];
};

const TPAG_LABELS: Record<string, string> = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de Crédito",
  "04": "Cartão de Débito",
  "05": "Crédito Loja",
  "10": "Vale Alimentação",
  "11": "Vale Refeição",
  "12": "Vale Presente",
  "13": "Vale Combustível",
  "15": "Boleto Bancário",
  "16": "Depósito Bancário",
  "17": "Pix",
  "18": "Transferência / Carteira Digital",
  "19": "Programa de Fidelidade",
  "90": "Sem pagamento",
  "99": "Outros",
};

function firstTagText(parent: Element | Document, tag: string): string {
  const direct = parent.getElementsByTagName(tag)[0];
  if (direct?.textContent) return direct.textContent.trim();
  const ns = parent.getElementsByTagNameNS("*", tag)[0];
  return ns?.textContent?.trim() ?? "";
}

function allTags(parent: Element | Document, tag: string): Element[] {
  const byName = Array.from(parent.getElementsByTagName(tag));
  if (byName.length > 0) return byName;
  return Array.from(parent.getElementsByTagNameNS("*", tag));
}

function brNumberToCents(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function parseNfeXml(xmlText: string): ParsedFiscalXmlResult {
  if (!xmlText.trim().startsWith("<")) {
    throw new Error("Arquivo XML inválido: conteúdo não é XML.");
  }

  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error("Não foi possível ler o XML fiscal: estrutura malformada.");
  }

  const infNFe = allTags(doc, "infNFe")[0];
  if (!infNFe) {
    throw new Error("XML não possui tag <infNFe> compatível com NF-e ou NFC-e brasileira.");
  }

  const rawId = infNFe.getAttribute("Id") || "";
  const chNFe = firstTagText(doc, "chNFe");
  const accessKey = extractAccessKey(chNFe || rawId);
  const keyInfo = accessKey ? parseAccessKey44(accessKey) : null;

  const ide = allTags(infNFe, "ide")[0];
  const mod = ide ? firstTagText(ide, "mod") : keyInfo?.model || "65";
  const docType: FiscalDocType = mod === "55" ? "nfe_55" : "nfce_65";
  const number = (ide ? firstTagText(ide, "nNF") : "") || keyInfo?.number || "";
  const series = (ide ? firstTagText(ide, "serie") : "") || keyInfo?.series || "";
  const dhEmi = ide ? firstTagText(ide, "dhEmi") || firstTagText(ide, "dEmi") : "";
  const issuedAt = /^\d{4}-\d{2}-\d{2}/.test(dhEmi)
    ? dhEmi.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const issuedTime = /T(\d{2}:\d{2})/.test(dhEmi) ? dhEmi.match(/T(\d{2}:\d{2})/)?.[1] ?? "" : "";

  const emit = allTags(infNFe, "emit")[0];
  const xFant = emit ? firstTagText(emit, "xFant") : "";
  const xNome = emit ? firstTagText(emit, "xNome") : "";
  const store = (xFant || xNome || "Estabelecimento").slice(0, 160);
  const rawCnpj = (emit ? firstTagText(emit, "CNPJ") : "") || keyInfo?.cnpj || "";
  const cnpj = formatCnpj(rawCnpj);
  const uf =
    (emit ? firstTagText(emit, "UF") : "") ||
    keyInfo?.uf ||
    UF_BY_CODE[ide ? firstTagText(ide, "cUF") : ""] ||
    "";

  const xLgr = emit ? firstTagText(emit, "xLgr") : "";
  const nro = emit ? firstTagText(emit, "nro") : "";
  const xBairro = emit ? firstTagText(emit, "xBairro") : "";
  const xMun = emit ? firstTagText(emit, "xMun") : "";
  const emitterAddress = [xLgr && nro ? `${xLgr}, ${nro}` : xLgr, xBairro, xMun && uf ? `${xMun}/${uf}` : xMun]
    .filter(Boolean)
    .join(" - ")
    .slice(0, 220);

  const detTags = allTags(infNFe, "det");
  const items: ReceiptItem[] = detTags.slice(0, 150).map((det) => {
    const prod = allTags(det, "prod")[0] ?? det;
    const description = firstTagText(prod, "xProd") || "Item";
    const code = firstTagText(prod, "cProd") || undefined;
    const rawEan = firstTagText(prod, "cEAN");
    const ean = rawEan && rawEan !== "SEM GTIN" ? rawEan : undefined;
    const qRaw = firstTagText(prod, "qCom").replace(",", ".");
    const quantity = Number.isFinite(Number(qRaw)) && Number(qRaw) > 0 ? Number(qRaw) : 1;
    const unit = (firstTagText(prod, "uCom") || "un").slice(0, 12);
    const unitPriceCents = brNumberToCents(firstTagText(prod, "vUnCom"));
    const discountCents = brNumberToCents(firstTagText(prod, "vDesc"));
    const prodTotal = brNumberToCents(firstTagText(prod, "vProd"));
    const totalCents = Math.max(0, prodTotal - discountCents);

    return {
      ...(code ? { code: code.slice(0, 40) } : {}),
      ...(ean ? { ean: ean.slice(0, 20) } : {}),
      originalDescription: description.slice(0, 250),
      description: description.slice(0, 250),
      quantity,
      unit,
      unitPriceCents: unitPriceCents || (quantity > 0 ? Math.round(totalCents / quantity) : 0),
      ...(discountCents > 0 ? { discountCents } : {}),
      totalCents,
    };
  });

  const icmsTot = allTags(infNFe, "ICMSTot")[0];
  const discountCents = icmsTot ? brNumberToCents(firstTagText(icmsTot, "vDesc")) : 0;
  const vNfCents = icmsTot ? brNumberToCents(firstTagText(icmsTot, "vNF")) : 0;
  const sumItemsCents = items.reduce((acc, item) => acc + item.totalCents, 0);
  const totalCents = vNfCents > 0 ? vNfCents : sumItemsCents;

  const detPags = allTags(infNFe, "detPag");
  const pagLabels = detPags
    .map((dp) => {
      const code = firstTagText(dp, "tPag");
      return TPAG_LABELS[code] || (code ? `Pagamento ${code}` : "");
    })
    .filter(Boolean);
  const paymentMethod = [...new Set(pagLabels)].join(" + ").slice(0, 80);

  return {
    docType,
    uf,
    store,
    cnpj,
    emitterAddress,
    issuedAt,
    issuedTime,
    accessKey,
    number,
    series,
    paymentMethod,
    discountCents,
    totalCents,
    items,
  };
}
