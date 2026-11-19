import type { PixRecipient, RevenueContract, RevenueEntry } from "@/types/orion";
import {
  calculateIndexCorrection,
  lateCharges,
  pixMerchantText,
  pixRecipientSchema,
  type MonthlyCorrectionIndex,
} from "./contracts";
import { formatBRL, formatDateBR } from "./money";

export type InvoiceQuoteRow = {
  entry: RevenueEntry;
  charges: ReturnType<typeof lateCharges>;
  rate: number;
  months: MonthlyCorrectionIndex[];
};

export type ContractQuote = {
  contract: RevenueContract;
  date: string;
  rows: InvoiceQuoteRow[];
  total: number;
  source: string;
};

export function buildContractQuote(
  contract: RevenueContract,
  entries: RevenueEntry[],
  paymentDate: string,
  observations: MonthlyCorrectionIndex[],
  sourceLabel: string,
): ContractQuote {
  const rows: InvoiceQuoteRow[] = entries.map((entry) => {
    let rate = 0;
    let months: MonthlyCorrectionIndex[] = [];
    if (paymentDate > entry.dueDate) {
      if (contract.correctionIndex === "Personalizado") {
        rate = contract.customRatePercent ?? 0;
      } else if (contract.correctionIndex === "IPCA" || contract.correctionIndex === "IGP-M") {
        const calc = calculateIndexCorrection(entry.dueDate, paymentDate, observations);
        rate = calc.rate;
        months = calc.months;
      }
    }
    const charges = lateCharges(
      entry.expectedCents,
      entry.dueDate,
      paymentDate,
      contract.interestPercent,
      contract.finePercent,
      rate,
    );
    return { entry, charges, rate, months };
  });

  const total = rows.reduce((sum, r) => sum + r.charges.total, 0);
  return { contract, date: paymentDate, rows, total, source: sourceLabel };
}

export async function makePixPayload(recipient: PixRecipient, cents: number): Promise<string> {
  const validated = pixRecipientSchema.parse({
    key: recipient.key,
    name: recipient.name,
    city: recipient.city,
  });
  const { createStaticPix, hasError } = await import("pix-utils");
  const p = createStaticPix({
    pixKey: validated.key,
    merchantName: pixMerchantText(validated.name, 25),
    merchantCity: pixMerchantText(validated.city, 15),
    transactionAmount: cents / 100,
  });
  if (hasError(p)) {
    throw new Error("Chave Pix ou dados do recebedor inválidos.");
  }
  return p.toBRCode();
}

export async function generateInvoicePdf(q: ContractQuote, recipient: PixRecipient) {
  const payload = await makePixPayload(recipient, q.total);
  const [{ PDFDocument, StandardFonts, rgb }, { default: QR }] = await Promise.all([
    import("pdf-lib"),
    import("qrcode"),
  ]);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Fatura — ${q.contract.title}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const brand = rgb(23 / 255, 61 / 255, 74 / 255); // #173D4A
  const ink = rgb(12 / 255, 25 / 255, 40 / 255); // #0C1928
  const paper = rgb(1, 1, 1);
  const muted = rgb(82 / 255, 97 / 255, 106 / 255);

  let page = pdf.addPage([595, 842]);
  let y = 728;

  const safe = (s: string) =>
    [...s.replace(/[\r\n\t]/g, " ")]
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");

  function header() {
    page.drawRectangle({ x: 0, y: 748, width: 595, height: 94, color: brand });
    page.drawText("Fatura", { x: 36, y: 788, font: bold, size: 28, color: paper });
    page.drawText("ÓRION · CONTRATOS PARCELADOS", { x: 36, y: 764, font, size: 10, color: paper });
    y = 724;
  }

  function ensure(space: number) {
    if (y - space < 42) {
      page = pdf.addPage([595, 842]);
      header();
    }
  }

  function text(s: string, size = 10, isBold = false) {
    const f = isBold ? bold : font;
    const words = safe(s).split(" ");
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(candidate, size) > 515 && line) {
        ensure(size + 8);
        page.drawText(line, { x: 36, y, font: f, size, color: ink });
        y -= size + 6;
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) {
      ensure(size + 8);
      page.drawText(line, { x: 36, y, font: f, size, color: ink });
      y -= size + 6;
    }
  }

  function section(s: string) {
    ensure(42);
    y -= 10;
    page.drawRectangle({ x: 36, y: y - 5, width: 523, height: 22, color: brand });
    page.drawText(safe(s), { x: 44, y: y + 2, font: bold, size: 10, color: paper });
    y -= 24;
  }

  header();
  text(`Fatura ${q.contract.id.slice(0, 8).toUpperCase()} · Pagamento previsto: ${formatDateBR(q.date)}`, 11, true);

  section("PAGADOR");
  const c = q.contract;
  text(c.buyer, 12, true);
  text(`CPF/CNPJ: ${c.cpf || "—"} · Telefone: ${c.phone || "—"} · E-mail: ${c.email || "—"}`);
  text(`${c.address || "—"} · CEP: ${c.postalCode || "—"} · ${c.city || "—"} / ${c.state || "—"}`);

  section("PAGÁVEL PARA");
  text(recipient.name, 11, true);
  text(`Cidade: ${recipient.city} / ${recipient.state} · Chave Pix: ${recipient.key}`);

  section("CONTRATO");
  text(c.title, 12, true);
  text(
    `Valor total: ${formatBRL(c.totalCents)} · Entrada: ${formatBRL(c.downPaymentCents)} · Saldo contratado: ${formatBRL(c.totalCents - c.downPaymentCents)}`,
  );

  section("PARCELAS SELECIONADAS");
  for (const r of q.rows) {
    ensure(86);
    text(
      `Parcela ${r.entry.installmentNumber ?? "—"} · Vencimento ${formatDateBR(r.entry.dueDate)} · Original ${formatBRL(r.entry.expectedCents)}`,
      11,
      true,
    );
    text(
      `Juros (${c.interestPercent}% a.m. × ${r.charges.days}/30d): ${formatBRL(r.charges.interestCents)} · Multa (${c.finePercent}%): ${formatBRL(r.charges.fineCents)} · Correção (${c.correctionIndex}): ${formatBRL(r.charges.correctionCents)}`,
    );
    text(`Total da parcela: ${formatBRL(r.charges.total)}`, 10, true);
    y -= 6;
  }

  if (c.correctionIndex !== "Sem correção") {
    text(`Fonte de índice: ${q.source}`, 9);
  }

  ensure(220);
  section("TOTAL A COBRAR VIA PIX");
  text(formatBRL(q.total), 20, true);

  const qr = await QR.toDataURL(payload, { width: 420, margin: 2, errorCorrectionLevel: "M" });
  const image = await pdf.embedPng(qr);
  page.drawImage(image, { x: 36, y: y - 140, width: 140, height: 140 });
  page.drawText("PIX", { x: 196, y: y - 24, font: bold, size: 15, color: brand });
  page.drawText("Valor: " + formatBRL(q.total), { x: 196, y: y - 48, font: bold, size: 12, color: ink });
  page.drawText("Confira o recebedor antes de confirmar o pagamento.", {
    x: 196,
    y: y - 68,
    font,
    size: 10,
    color: muted,
  });
  y -= 152;
  text("Pix copia e cola:", 9, true);
  text(payload, 8);

  const bytes = await pdf.save();
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    payload,
    qr,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
