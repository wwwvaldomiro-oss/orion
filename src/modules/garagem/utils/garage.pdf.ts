import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { todayBR } from "@/lib/domain/money";
import type { GarageSnapshot } from "../types/garage.types";
import {
  type PeriodFilter,
  computeGarageKpis,
  computeVehicleTcoSummary,
  detectConsumptionAnomalies,
  formatDateBR,
  formatKm,
  formatNumberBR,
  formatReaisBRL,
  getFuelUnit,
} from "./garage.calculations";

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  "30D": "Ultimos 30 dias",
  "90D": "Ultimos 90 dias",
  ANO: `Exercicio ${new Date().getFullYear()}`,
  TODOS: "Historico completo",
};

function sanitizePdfText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

export async function generateGarageReportPdf(
  snapshot: GarageSnapshot,
  vehicleFilter: string,
  period: PeriodFilter,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(12 / 255, 25 / 255, 40 / 255);
  const petrol = rgb(23 / 255, 61 / 255, 74 / 255);
  const gold = rgb(185 / 255, 149 / 255, 85 / 255);
  const muted = rgb(92 / 255, 107 / 255, 122 / 255);
  const ivory = rgb(231 / 255, 225 / 255, 213 / 255);
  const white = rgb(1, 1, 1);

  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: navy });
  page.drawRectangle({ x: 0, y: height - 95, width, height: 3, color: gold });

  page.drawText("RELATORIO PESSOAL DE GARAGEM & VIAGENS", {
    x: 40,
    y: height - 42,
    size: 15,
    font: fontBold,
    color: white,
  });

  const selectedVeh = snapshot.vehicles.find((v) => v.id === vehicleFilter);
  const scopeText = selectedVeh
    ? `${selectedVeh.plate} - ${selectedVeh.brand} ${selectedVeh.model}`
    : `Todos os veiculos (${snapshot.vehicles.length})`;

  page.drawText(
    sanitizePdfText(
      `Escopo: ${scopeText}  |  Periodo: ${PERIOD_LABELS[period]}  |  Emissao: ${formatDateBR(todayBR())}`,
    ),
    {
      x: 40,
      y: height - 66,
      size: 9.5,
      font: fontRegular,
      color: rgb(225 / 255, 230 / 255, 235 / 255),
    },
  );

  let y = height - 130;

  const kpis = computeGarageKpis(snapshot, vehicleFilter, period);
  page.drawText("1. RESUMO DE GASTOS E RENDIMENTO", {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 18;

  const kpiRows: [string, string][] = [
    ["Gasto Total no Periodo", formatReaisBRL(kpis.totalCost)],
    ["Combustivel / Energia", formatReaisBRL(kpis.fuelCost)],
    ["Manutencoes & Revisoes", formatReaisBRL(kpis.maintenanceCost)],
    ["Impostos, Seguro, Multas & Gastos", formatReaisBRL(kpis.otherExpenseCost)],
    ["Distancia Apurada", formatKm(kpis.totalDistanceKm)],
    ["Custo por Quilometro", kpis.costPerKm > 0 ? `${formatReaisBRL(kpis.costPerKm)}/km` : "-"],
    ["Consumo Medio", kpis.avgConsumption > 0 ? `${formatNumberBR(kpis.avgConsumption, 2)} km/L` : "-"],
    ["Veiculos Ativos", `${kpis.activeVehiclesCount}`],
  ];

  kpiRows.forEach(([label, val], idx) => {
    const colX = idx % 2 === 0 ? 40 : 310;
    const rowY = y - Math.floor(idx / 2) * 20;
    page.drawText(sanitizePdfText(label), {
      x: colX,
      y: rowY,
      size: 9.5,
      font: fontRegular,
      color: muted,
    });
    page.drawText(sanitizePdfText(val), {
      x: colX + 150,
      y: rowY,
      size: 9.5,
      font: fontBold,
      color: navy,
    });
  });

  y -= Math.ceil(kpiRows.length / 2) * 20 + 22;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: ivory });
  y -= 24;

  page.drawText("2. DETALHAMENTO POR VEICULO (CUSTO DE PROPRIEDADE)", {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 20;

  const headers = ["Placa", "Modelo", "Media", "Gasto Variavel", "Custo Total", "R$/km"];
  const colPositions = [40, 100, 235, 315, 415, 505];

  headers.forEach((h, i) => {
    page.drawText(h, {
      x: colPositions[i] ?? 40,
      y,
      size: 8.5,
      font: fontBold,
      color: muted,
    });
  });
  y -= 8;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.75, color: ivory });
  y -= 16;

  const tcoRows = computeVehicleTcoSummary(snapshot, vehicleFilter);
  for (const row of tcoRows) {
    if (y < 120) break;
    const unit = getFuelUnit(row.fuelType);
    const cells = [
      row.plate,
      row.model.slice(0, 22),
      row.avgConsumption ? `${formatNumberBR(row.avgConsumption, 1)} km/${unit}` : "-",
      formatReaisBRL(row.totalOperationalCost),
      formatReaisBRL(row.totalTcoCost),
      row.tcoPerKm ? `${formatReaisBRL(row.tcoPerKm)}` : "-",
    ];
    cells.forEach((cell, i) => {
      page.drawText(sanitizePdfText(cell), {
        x: colPositions[i] ?? 40,
        y,
        size: 8.5,
        font: i === 0 ? fontBold : fontRegular,
        color: navy,
      });
    });
    y -= 18;
  }

  y -= 14;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: ivory });
  y -= 24;

  const anomalies = detectConsumptionAnomalies(snapshot.fuelings, vehicleFilter);
  page.drawText("3. ALERTAS DE CONSUMO (QUEDA >= 15%)", {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 18;

  if (anomalies.length === 0) {
    page.drawText("Nenhuma queda anomala de consumo identificada no historico.", {
      x: 40,
      y,
      size: 9,
      font: fontRegular,
      color: muted,
    });
  } else {
    for (const anom of anomalies.slice(0, 6)) {
      const veh = snapshot.vehicles.find((v) => v.id === anom.vehicleId);
      const line = `${veh?.plate ?? ""} (${formatDateBR(anom.date)}): ${formatNumberBR(anom.actualAvg, 2)} vs media ${formatNumberBR(anom.baselineAvg, 2)} (-${anom.dropPercent}%)`;
      page.drawText(sanitizePdfText(line), {
        x: 40,
        y,
        size: 9,
        font: fontRegular,
        color: navy,
      });
      y -= 15;
    }
  }

  page.drawText("Orion · Garagem & Viagens Pessoais", {
    x: 40,
    y: 32,
    size: 8,
    font: fontRegular,
    color: muted,
  });

  return pdfDoc.save();
}

export async function downloadGarageReportPdf(
  snapshot: GarageSnapshot,
  vehicleFilter: string,
  period: PeriodFilter,
): Promise<void> {
  const bytes = await generateGarageReportPdf(snapshot, vehicleFilter, period);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `relatorio-garagem-${period.toLowerCase()}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
