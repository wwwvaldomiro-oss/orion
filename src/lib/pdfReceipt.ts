import { PDFDocument } from "pdf-lib";

export async function computeSha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function convertImageFileToJpegBytes(file: File): Promise<{ bytes: Uint8Array; isPng: boolean }> {
  if (file.type === "image/png") {
    return { bytes: new Uint8Array(await file.arrayBuffer()), isPng: true };
  }
  if (file.type === "image/jpeg") {
    return { bytes: new Uint8Array(await file.arrayBuffer()), isPng: false };
  }

  // Convert WebP or other browser-supported image formats via Canvas to JPEG
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível carregar a imagem para gerar o PDF."));
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível para conversão da imagem.");
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao converter imagem para JPEG."))),
        "image/jpeg",
        0.92,
      );
    });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), isPng: false };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Generates a faithful PDF preserving the original captured receipt photo
 * without synthetic reconstruction or altering document layout.
 */
export async function convertReceiptPhotoToPdf(imageFile: File): Promise<File> {
  const { bytes, isPng } = await convertImageFileToJpegBytes(imageFile);
  const pdfDoc = await PDFDocument.create();
  const embedded = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

  const maxWidth = 595.28; // A4 width in pt
  const margin = 16;
  const targetWidth = Math.min(maxWidth - margin * 2, Math.max(220, embedded.width));
  const scale = targetWidth / embedded.width;
  const targetHeight = embedded.height * scale;

  const page = pdfDoc.addPage([targetWidth + margin * 2, targetHeight + margin * 2]);
  page.drawImage(embedded, {
    x: margin,
    y: margin,
    width: targetWidth,
    height: targetHeight,
  });

  const pdfBytes = await pdfDoc.save();
  const baseName = imageFile.name.replace(/\.[^.]+$/, "") || "nota-fiscal";
  const pdfCopy = new Uint8Array(pdfBytes.byteLength);
  pdfCopy.set(pdfBytes);
  return new File([pdfCopy.buffer], `${baseName}.pdf`, { type: "application/pdf" });
}
