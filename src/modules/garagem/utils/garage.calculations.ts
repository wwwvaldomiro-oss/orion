import { todayBR } from "@/lib/domain/money";
import type {
  DocumentType,
  FuelType,
  FuelingRecord,
  FineRecord,
  GarageReminder,
  GarageSnapshot,
  PersonalDriver,
  PersonalVehicle,
  RouteTrip,
  VehicleDocumentRecord,
  VehicleStatus,
} from "../types/garage.types";

export function formatReaisBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatNumberBR(value: number, decimals = 1): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatKm(odometer: number): string {
  return `${new Intl.NumberFormat("pt-BR").format(Math.round(odometer))} km`;
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function getFuelUnit(fuelType: FuelType): "L" | "kWh" | "m³" {
  if (fuelType === "ELETRICO") return "kWh";
  if (fuelType === "GNV") return "m³";
  return "L";
}

export function fuelTypeLabel(fuelType: FuelType): string {
  const labels: Record<FuelType, string> = {
    GASOLINA: "Gasolina",
    ETANOL: "Etanol",
    DIESEL: "Diesel S10",
    GNV: "GNV",
    ELETRICO: "Elétrico",
    FLEX: "Flex",
  };
  return labels[fuelType];
}

export function vehicleStatusLabel(status: VehicleStatus): string {
  const map: Record<VehicleStatus, string> = {
    ATIVO: "Em uso",
    MANUTENCAO: "Em revisão",
    INATIVO: "Inativo / Parado",
  };
  return map[status];
}

export function documentTypeLabel(docType: DocumentType): string {
  const map: Record<DocumentType, string> = {
    CRLV: "Licenciamento (CRLV-e)",
    IPVA: "IPVA",
    SEGURO: "Seguro Auto",
    VISTORIA: "Vistoria / Inspeção",
  };
  return map[docType];
}

/**
 * Calculadora Flex pessoal: compara paridade real entre Etanol e Gasolina.
 */
export function computeFlexRecommendation(
  ethanolPrice: number,
  gasolinePrice: number,
  efficiencyRatio = 0.7,
): {
  ratioPercent: number;
  recommended: "ETANOL" | "GASOLINA";
  savingsPercent: number;
} | null {
  if (ethanolPrice <= 0 || gasolinePrice <= 0 || efficiencyRatio <= 0) return null;
  const ratio = ethanolPrice / gasolinePrice;
  const ratioPercent = Number((ratio * 100).toFixed(1));
  const recommended = ratio <= efficiencyRatio ? "ETANOL" : "GASOLINA";
  const savingsPercent =
    recommended === "ETANOL"
      ? Number((((efficiencyRatio - ratio) / efficiencyRatio) * 100).toFixed(1))
      : Number((((ratio - efficiencyRatio) / ratio) * 100).toFixed(1));
  return { ratioPercent, recommended, savingsPercent: Math.max(0, savingsPercent) };
}

/**
 * Recalcula médias de consumo (km/L, km/kWh ou km/m³) agrupadas por veículo,
 * utilizando exclusivamente a lógica de tanque cheio a tanque cheio.
 */
export function recalculateFuelingAverages(fuelings: FuelingRecord[]): FuelingRecord[] {
  const byVehicle = new Map<string, FuelingRecord[]>();

  for (const record of fuelings) {
    const list = byVehicle.get(record.vehicleId) ?? [];
    list.push({ ...record, calculatedAvg: undefined });
    byVehicle.set(record.vehicleId, list);
  }

  const result: FuelingRecord[] = [];

  for (const [, records] of byVehicle.entries()) {
    records.sort((a, b) => {
      if (a.odometer !== b.odometer) return a.odometer - b.odometer;
      return a.date.localeCompare(b.date);
    });

    let lastFullOdometer: number | null = null;
    let accumulatedQuantity = 0;

    for (const item of records) {
      if (lastFullOdometer === null) {
        if (item.fullTank) {
          lastFullOdometer = item.odometer;
          accumulatedQuantity = 0;
        }
        result.push(item);
        continue;
      }

      accumulatedQuantity += item.quantity;

      if (item.fullTank) {
        const deltaKm = item.odometer - lastFullOdometer;
        if (deltaKm > 0 && accumulatedQuantity > 0) {
          item.calculatedAvg = Number((deltaKm / accumulatedQuantity).toFixed(2));
        }
        lastFullOdometer = item.odometer;
        accumulatedQuantity = 0;
      }

      result.push(item);
    }
  }

  return result.sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.odometer - a.odometer;
  });
}

export interface ConsumptionAnomaly {
  fuelingId: string;
  vehicleId: string;
  date: string;
  odometer: number;
  actualAvg: number;
  baselineAvg: number;
  dropPercent: number;
  fuelType: FuelType;
}

/**
 * Detecta quedas de rendimento >= thresholdPercent (padrão 15%) em relação à média
 * histórica do próprio veículo com o mesmo combustível.
 */
export function detectConsumptionAnomalies(
  fuelings: FuelingRecord[],
  vehicleFilter = "TODOS",
  thresholdPercent = 15,
): ConsumptionAnomaly[] {
  const byVehicle = new Map<string, FuelingRecord[]>();

  for (const f of fuelings) {
    if (vehicleFilter !== "TODOS" && f.vehicleId !== vehicleFilter) continue;
    if (typeof f.calculatedAvg === "number" && f.calculatedAvg > 0) {
      const list = byVehicle.get(f.vehicleId) ?? [];
      list.push(f);
      byVehicle.set(f.vehicleId, list);
    }
  }

  const anomalies: ConsumptionAnomaly[] = [];

  for (const [vehicleId, records] of byVehicle.entries()) {
    if (records.length < 2) continue;

    for (const current of records) {
      const others = records.filter(
        (r) => r.id !== current.id && r.fuelType === current.fuelType,
      );
      if (others.length === 0) continue;

      const baselineAvg =
        others.reduce((acc, r) => acc + (r.calculatedAvg ?? 0), 0) / others.length;
      if (baselineAvg <= 0 || !current.calculatedAvg) continue;

      const dropPercent = ((baselineAvg - current.calculatedAvg) / baselineAvg) * 100;
      if (dropPercent >= thresholdPercent) {
        anomalies.push({
          fuelingId: current.id,
          vehicleId,
          date: current.date,
          odometer: current.odometer,
          actualAvg: current.calculatedAvg,
          baselineAvg: Number(baselineAvg.toFixed(2)),
          dropPercent: Number(dropPercent.toFixed(1)),
          fuelType: current.fuelType,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.date.localeCompare(a.date));
}

export type PeriodFilter = "30D" | "90D" | "ANO" | "TODOS";

export function filterDateByPeriod(
  isoDate: string,
  period: PeriodFilter,
  refDate = todayBR(),
): boolean {
  if (period === "TODOS") return true;
  const target = new Date(`${isoDate}T12:00:00`);
  const ref = new Date(`${refDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) return true;
  if (period === "ANO") {
    return target.getFullYear() === ref.getFullYear();
  }
  const days = period === "30D" ? 30 : 90;
  const diffMs = ref.getTime() - target.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= -7 && diffDays <= days;
}

export interface GarageKpiSummary {
  totalCost: number;
  fuelCost: number;
  maintenanceCost: number;
  otherExpenseCost: number;
  finesCost: number;
  totalDistanceKm: number;
  costPerKm: number;
  avgConsumption: number;
  activeVehiclesCount: number;
  maintenanceVehiclesCount: number;
}

export function computeGarageKpis(
  snapshot: GarageSnapshot,
  vehicleFilter: string,
  period: PeriodFilter,
  todayIso = todayBR(),
): GarageKpiSummary {
  const matchVehicle = (vId: string) => vehicleFilter === "TODOS" || vId === vehicleFilter;

  const fuelings = snapshot.fuelings.filter(
    (f) => matchVehicle(f.vehicleId) && filterDateByPeriod(f.date, period, todayIso),
  );
  const maintenances = snapshot.maintenances.filter(
    (m) => matchVehicle(m.vehicleId) && filterDateByPeriod(m.date, period, todayIso),
  );
  const expenses = snapshot.expenses.filter(
    (e) => matchVehicle(e.vehicleId) && filterDateByPeriod(e.date, period, todayIso),
  );
  const fines = snapshot.fines.filter(
    (fn) =>
      matchVehicle(fn.vehicleId) &&
      filterDateByPeriod(fn.date, period, todayIso) &&
      fn.status !== "RECORRIDA",
  );
  const routes = snapshot.routes.filter(
    (r) => matchVehicle(r.vehicleId) && filterDateByPeriod(r.date, period, todayIso),
  );

  const fuelCost = fuelings.reduce((acc, f) => acc + f.totalCost, 0);
  const maintenanceCost = maintenances.reduce((acc, m) => acc + m.totalCost, 0);
  const finesCost = fines.reduce((acc, fn) => acc + getEffectiveFineAmount(fn), 0);
  const otherExpenseCost = expenses.reduce((acc, e) => acc + e.amount, 0) + finesCost;
  const totalCost = fuelCost + maintenanceCost + otherExpenseCost;

  const odometersByVehicle = new Map<string, number[]>();
  const pushOdometer = (vId: string, odo: number) => {
    const arr = odometersByVehicle.get(vId) ?? [];
    arr.push(odo);
    odometersByVehicle.set(vId, arr);
  };

  fuelings.forEach((f) => pushOdometer(f.vehicleId, f.odometer));
  maintenances.forEach((m) => pushOdometer(m.vehicleId, m.odometer));
  routes.forEach((r) => {
    pushOdometer(r.vehicleId, r.startOdometer);
    pushOdometer(r.vehicleId, r.endOdometer);
  });

  let totalDistanceKm = 0;
  for (const [, odos] of odometersByVehicle.entries()) {
    if (odos.length >= 2) {
      totalDistanceKm += Math.max(...odos) - Math.min(...odos);
    }
  }
  if (totalDistanceKm === 0 && routes.length > 0) {
    totalDistanceKm = routes.reduce((acc, r) => acc + r.distanceKm, 0);
  }

  const costPerKm = totalDistanceKm > 0 ? totalCost / totalDistanceKm : 0;

  const validAvgs = fuelings
    .map((f) => f.calculatedAvg)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgConsumption =
    validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0;

  const filteredVehicles = snapshot.vehicles.filter((v) => matchVehicle(v.id));

  return {
    totalCost,
    fuelCost,
    maintenanceCost,
    otherExpenseCost,
    finesCost,
    totalDistanceKm,
    costPerKm,
    avgConsumption,
    activeVehiclesCount: filteredVehicles.filter((v) => v.status === "ATIVO").length,
    maintenanceVehiclesCount: filteredVehicles.filter((v) => v.status === "MANUTENCAO").length,
  };
}

export interface VehicleTcoRow {
  vehicleId: string;
  plate: string;
  model: string;
  fuelType: FuelType;
  distanceKm: number;
  avgConsumption: number | null;
  fuelCost: number;
  maintenanceCost: number;
  otherCost: number;
  fixedMonthlyEstimated: number;
  totalOperationalCost: number;
  totalTcoCost: number;
  fuelCostPerKm: number | null;
  tcoPerKm: number | null;
  fipeValue?: number;
}

export function computeVehicleTcoSummary(
  snapshot: GarageSnapshot,
  vehicleFilter = "TODOS",
): VehicleTcoRow[] {
  return snapshot.vehicles
    .filter((v) => vehicleFilter === "TODOS" || v.id === vehicleFilter)
    .map((v) => {
      const vFuel = snapshot.fuelings.filter((f) => f.vehicleId === v.id);
      const vMaint = snapshot.maintenances.filter((m) => m.vehicleId === v.id);
      const vExp = snapshot.expenses.filter((e) => e.vehicleId === v.id);
      const vFines = snapshot.fines.filter(
        (fn) => fn.vehicleId === v.id && fn.status !== "RECORRIDA",
      );
      const vRoutes = snapshot.routes.filter((r) => r.vehicleId === v.id);

      const fuelCost = vFuel.reduce((s, f) => s + f.totalCost, 0);
      const maintenanceCost = vMaint.reduce((s, m) => s + m.totalCost, 0);
      const finesCost = vFines.reduce((s, fn) => s + getEffectiveFineAmount(fn), 0);
      const otherCost = vExp.reduce((s, e) => s + e.amount, 0) + finesCost;

      const odos: number[] = [];
      vFuel.forEach((f) => odos.push(f.odometer));
      vMaint.forEach((m) => odos.push(m.odometer));
      vRoutes.forEach((r) => {
        odos.push(r.startOdometer, r.endOdometer);
      });

      let distanceKm = odos.length >= 2 ? Math.max(...odos) - Math.min(...odos) : 0;
      if (distanceKm === 0 && vRoutes.length > 0) {
        distanceKm = vRoutes.reduce((s, r) => s + r.distanceKm, 0);
      }

      const avgs = vFuel
        .map((f) => f.calculatedAvg)
        .filter((n): n is number => typeof n === "number" && n > 0);
      const avgConsumption =
        avgs.length > 0 ? Number((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2)) : null;

      const fixedMonthlyEstimated = Number((v.monthlyFixedCost ?? 0).toFixed(2));
      const totalOperationalCost = fuelCost + maintenanceCost + otherCost;
      const totalTcoCost = totalOperationalCost + fixedMonthlyEstimated;

      return {
        vehicleId: v.id,
        plate: v.plate,
        model: `${v.brand} ${v.model}`.trim(),
        fuelType: v.fuelType,
        distanceKm,
        avgConsumption,
        fuelCost,
        maintenanceCost,
        otherCost,
        fixedMonthlyEstimated,
        totalOperationalCost,
        totalTcoCost,
        fuelCostPerKm: distanceKm > 0 ? fuelCost / distanceKm : null,
        tcoPerKm: distanceKm > 0 ? totalTcoCost / distanceKm : null,
        fipeValue: v.fipeValue,
      };
    });
}

export interface MonthlyChartDatum {
  monthKey: string;
  label: string;
  abastecimento: number;
  manutencao: number;
  despesas: number;
}

const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export function buildMonthlyCostSeries(
  snapshot: GarageSnapshot,
  vehicleFilter: string,
): MonthlyChartDatum[] {
  const matchVehicle = (vId: string) => vehicleFilter === "TODOS" || vId === vehicleFilter;
  const buckets = new Map<string, MonthlyChartDatum>();

  const ensureBucket = (isoDate: string) => {
    const key = isoDate.slice(0, 7);
    const existing = buckets.get(key);
    if (existing) return existing;
    const [y = "2026", m = "01"] = key.split("-");
    const monthIdx = Math.max(0, Math.min(11, Number(m) - 1));
    const created: MonthlyChartDatum = {
      monthKey: key,
      label: `${MONTH_NAMES[monthIdx]}/${y.slice(2)}`,
      abastecimento: 0,
      manutencao: 0,
      despesas: 0,
    };
    buckets.set(key, created);
    return created;
  };

  snapshot.fuelings
    .filter((f) => matchVehicle(f.vehicleId))
    .forEach((f) => {
      ensureBucket(f.date).abastecimento += f.totalCost;
    });

  snapshot.maintenances
    .filter((m) => matchVehicle(m.vehicleId))
    .forEach((m) => {
      ensureBucket(m.date).manutencao += m.totalCost;
    });

  snapshot.expenses
    .filter((e) => matchVehicle(e.vehicleId))
    .forEach((e) => {
      ensureBucket(e.date).despesas += e.amount;
    });

  snapshot.fines
    .filter((fn) => matchVehicle(fn.vehicleId) && fn.status !== "RECORRIDA")
    .forEach((fn) => {
      ensureBucket(fn.date).despesas += getEffectiveFineAmount(fn);
    });

  return Array.from(buckets.values())
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(-6)
    .map((d) => ({
      ...d,
      abastecimento: Number(d.abastecimento.toFixed(2)),
      manutencao: Number(d.manutencao.toFixed(2)),
      despesas: Number(d.despesas.toFixed(2)),
    }));
}

export interface TimelineEntry {
  id: string;
  date: string;
  vehicleId: string;
  kind: "ABASTECIMENTO" | "MANUTENCAO" | "DESPESA" | "CHECKLIST" | "PERCURSO" | "MULTA";
  title: string;
  subtitle: string;
  amount?: number;
  odometer?: number;
}

export function buildUnifiedTimeline(
  snapshot: GarageSnapshot,
  vehicleFilter: string,
): TimelineEntry[] {
  const matchVehicle = (vId: string) => vehicleFilter === "TODOS" || vId === vehicleFilter;
  const items: TimelineEntry[] = [];

  snapshot.fuelings
    .filter((f) => matchVehicle(f.vehicleId))
    .forEach((f) => {
      items.push({
        id: `fuel-${f.id}`,
        date: f.date,
        vehicleId: f.vehicleId,
        kind: "ABASTECIMENTO",
        title: `${fuelTypeLabel(f.fuelType)} · ${formatNumberBR(f.quantity, 1)} ${getFuelUnit(f.fuelType)}`,
        subtitle: f.stationName
          ? `${f.stationName}${f.calculatedAvg ? ` · ${formatNumberBR(f.calculatedAvg, 2)} km/${getFuelUnit(f.fuelType)}` : ""}`
          : "Abastecimento registrado",
        amount: f.totalCost,
        odometer: f.odometer,
      });
    });

  snapshot.maintenances
    .filter((m) => matchVehicle(m.vehicleId))
    .forEach((m) => {
      items.push({
        id: `maint-${m.id}`,
        date: m.date,
        vehicleId: m.vehicleId,
        kind: "MANUTENCAO",
        title: `${m.category} (${m.type === "PREVENTIVA" ? "Preventiva" : "Corretiva"})`,
        subtitle: m.providerName || "Oficina / Mecânica",
        amount: m.totalCost,
        odometer: m.odometer,
      });
    });

  snapshot.expenses
    .filter((e) => matchVehicle(e.vehicleId))
    .forEach((e) => {
      items.push({
        id: `exp-${e.id}`,
        date: e.date,
        vehicleId: e.vehicleId,
        kind: "DESPESA",
        title: e.category,
        subtitle: e.description || "Gasto com veículo",
        amount: e.amount,
      });
    });

  snapshot.fines
    .filter((fn) => matchVehicle(fn.vehicleId))
    .forEach((fn) => {
      items.push({
        id: `fine-${fn.id}`,
        date: fn.date,
        vehicleId: fn.vehicleId,
        kind: "MULTA",
        title: `Infração ${fn.infractionCode} (${fn.points} pts)`,
        subtitle: fn.description,
        amount: getEffectiveFineAmount(fn),
      });
    });

  snapshot.routes
    .filter((r) => matchVehicle(r.vehicleId))
    .forEach((r) => {
      items.push({
        id: `route-${r.id}`,
        date: r.date,
        vehicleId: r.vehicleId,
        kind: "PERCURSO",
        title: `${r.origin} → ${r.destination}`,
        subtitle: `${formatNumberBR(r.distanceKm, 0)} km percorridos`,
        odometer: r.endOdometer,
      });
    });

  snapshot.checklists
    .filter((c) => matchVehicle(c.vehicleId))
    .forEach((c) => {
      items.push({
        id: `chk-${c.id}`,
        date: c.date,
        vehicleId: c.vehicleId,
        kind: "CHECKLIST",
        title: c.hasIssues ? "Checklist com observações" : "Checklist pré-viagem OK",
        subtitle: `${c.items.filter((i) => i.compliant).length}/${c.items.length} itens conformes`,
        odometer: c.odometer,
      });
    });

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export type AlertSeverity = "VENCIDO" | "ATENCAO" | "EM_DIA" | "CONCLUIDO";

export function evaluateReminderStatus(
  reminder: GarageReminder,
  vehicle: PersonalVehicle | undefined,
  todayIso = todayBR(),
): { status: AlertSeverity; reason: string } {
  if (reminder.completed) {
    return { status: "CONCLUIDO", reason: "Concluído" };
  }

  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  let isOverdue = false;
  let isSoon = false;
  const reasons: string[] = [];

  if (reminder.dueDate) {
    const dueMs = new Date(`${reminder.dueDate}T12:00:00`).getTime();
    const diffDays = Math.ceil((dueMs - todayMs) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      isOverdue = true;
      reasons.push(`Vencido há ${Math.abs(diffDays)} dias`);
    } else if (diffDays <= 20) {
      isSoon = true;
      reasons.push(`Vence em ${diffDays} dias`);
    } else {
      reasons.push(`Previsto ${formatDateBR(reminder.dueDate)}`);
    }
  }

  if (reminder.dueOdometer && vehicle) {
    const remainingKm = reminder.dueOdometer - vehicle.currentOdometer;
    if (remainingKm <= 0) {
      isOverdue = true;
      reasons.push(`Excedido em ${formatNumberBR(Math.abs(remainingKm), 0)} km`);
    } else if (remainingKm <= 1200) {
      isSoon = true;
      reasons.push(`Faltam ${formatNumberBR(remainingKm, 0)} km`);
    } else {
      reasons.push(`Aos ${formatKm(reminder.dueOdometer)}`);
    }
  }

  if (isOverdue) return { status: "VENCIDO", reason: reasons.join(" · ") };
  if (isSoon) return { status: "ATENCAO", reason: reasons.join(" · ") };
  return { status: "EM_DIA", reason: reasons.join(" · ") || "Programado" };
}

export function evaluateCnhStatus(
  driver: PersonalDriver,
  todayIso = todayBR(),
): { status: AlertSeverity; label: string } {
  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  const expMs = new Date(`${driver.cnhExpiry}T12:00:00`).getTime();
  const diffDays = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: "VENCIDO", label: `Vencida há ${Math.abs(diffDays)}d` };
  }
  if (diffDays <= 30) {
    return { status: "ATENCAO", label: `Vence em ${diffDays}d` };
  }
  return { status: "EM_DIA", label: `Válida até ${formatDateBR(driver.cnhExpiry)}` };
}

export interface ParsedNfceData {
  nfceKey: string;
  totalCost?: number;
  date?: string;
  stationName?: string;
}

/**
 * Extrai chave, data e valor de URLs/payloads QR Code de NFC-e (SEFAZ) ou chave de 44 dígitos.
 */
export function parseNfceQrPayload(rawInput: string): ParsedNfceData | null {
  const text = rawInput.trim();
  if (!text) return null;

  try {
    if (text.includes("?") || text.includes("=")) {
      const queryPart = text.includes("?") ? text.split("?")[1] : text;
      const params = new URLSearchParams(queryPart);
      const pParam = params.get("p") ?? "";
      const keyMatch = (pParam || text).match(/\b\d{44}\b/);
      const vNfRaw = params.get("vNF") ?? params.get("valor") ?? params.get("v");
      const dateRaw = params.get("dhEmi") ?? params.get("data");
      const stationRaw = params.get("xNome") ?? params.get("posto");

      const totalCost = vNfRaw ? Number(vNfRaw.replace(",", ".")) : undefined;
      const dateMatch = dateRaw?.match(/\d{4}-\d{2}-\d{2}/);

      if (keyMatch || (totalCost && !Number.isNaN(totalCost))) {
        return {
          nfceKey: keyMatch ? keyMatch[0] : pParam.split("|")[0] || text.slice(0, 44),
          totalCost: totalCost && totalCost > 0 ? totalCost : undefined,
          date: dateMatch ? dateMatch[0] : undefined,
          stationName: stationRaw ? decodeURIComponent(stationRaw) : undefined,
        };
      }
    }
  } catch {
    // Fallback regex
  }

  const directKey = text.match(/\b\d{44}\b/);
  if (directKey) {
    return { nfceKey: directKey[0] };
  }

  return null;
}

export function suggestDriverForDate(
  snapshot: GarageSnapshot,
  vehicleId: string,
  isoDate: string,
): string | undefined {
  const routeMatch = snapshot.routes.find(
    (r) => r.vehicleId === vehicleId && r.date === isoDate,
  );
  if (routeMatch?.driverId) return routeMatch.driverId;

  const fuelingMatch = snapshot.fuelings.find(
    (f) => f.vehicleId === vehicleId && f.date === isoDate,
  );
  if (fuelingMatch?.driverId) return fuelingMatch.driverId;

  const vehicle = snapshot.vehicles.find((v) => v.id === vehicleId);
  return vehicle?.assignedDriverId;
}

export function computeRouteAudit(route: RouteTrip): {
  deltaKm: number;
  deltaPercent: number;
  flagged: boolean;
} | null {
  if (!route.estimatedKm || route.estimatedKm <= 0) return null;
  const deltaKm = Number((route.distanceKm - route.estimatedKm).toFixed(1));
  const deltaPercent = Number(((deltaKm / route.estimatedKm) * 100).toFixed(1));
  return {
    deltaKm,
    deltaPercent,
    flagged: Math.abs(deltaPercent) >= 15,
  };
}

export function getEffectiveFineAmount(fine: FineRecord): number {
  return fine.sneDiscountApplied ? Number((fine.amount * 0.6).toFixed(2)) : fine.amount;
}

export function exportRowsToCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? "");
    if (str.includes(";") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent =
    "\uFEFF" +
    [headers.map(escapeCell).join(";"), ...rows.map((r) => r.map(escapeCell).join(";"))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface PlateDueCalendarInfo {
  finalDigit: number;
  stateUf: string;
  crlvDueDate: string;
  crlvMonthLabel: string;
  ipvaDueDate: string;
  ipvaMonthLabel: string;
}

const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function lastDayOfMonthIso(year: number, month1To12: number): string {
  const dt = new Date(year, month1To12, 0);
  const mm = String(month1To12).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function getLicensePlateDueInfo(
  plate: string,
  stateUf = "DF",
  exerciseYear = new Date().getFullYear(),
): PlateDueCalendarInfo {
  const digits = plate.replace(/\D/g, "");
  const finalDigit = digits.length > 0 ? Number(digits[digits.length - 1]) : 0;
  const uf = (stateUf || "DF").toUpperCase();

  let crlvMonth = 12;
  if (uf === "SP") {
    if (finalDigit === 1 || finalDigit === 2) crlvMonth = 7;
    else if (finalDigit === 3 || finalDigit === 4) crlvMonth = 8;
    else if (finalDigit === 5 || finalDigit === 6) crlvMonth = 9;
    else if (finalDigit === 7 || finalDigit === 8) crlvMonth = 10;
    else if (finalDigit === 9) crlvMonth = 11;
    else crlvMonth = 12;
  } else {
    if (finalDigit >= 1 && finalDigit <= 3) crlvMonth = 9;
    else if (finalDigit >= 4 && finalDigit <= 6) crlvMonth = 10;
    else if (finalDigit >= 7 && finalDigit <= 8) crlvMonth = 11;
    else crlvMonth = 12;
  }

  const ipvaMonth = finalDigit >= 1 && finalDigit <= 5 ? 1 : 2;
  const ipvaDay = finalDigit === 0 ? 24 : 10 + finalDigit;
  const ipvaDueDate = `${exerciseYear}-${String(ipvaMonth).padStart(2, "0")}-${String(ipvaDay).padStart(2, "0")}`;

  return {
    finalDigit,
    stateUf: uf,
    crlvDueDate: lastDayOfMonthIso(exerciseYear, crlvMonth),
    crlvMonthLabel: `${MONTH_NAMES_PT[crlvMonth - 1]}/${exerciseYear}`,
    ipvaDueDate,
    ipvaMonthLabel: `${MONTH_NAMES_PT[ipvaMonth - 1]}/${exerciseYear}`,
  };
}

export function evaluateDocumentStatus(
  doc: VehicleDocumentRecord,
  todayIso = todayBR(),
): { status: "PAGO" | AlertSeverity; daysDiff: number; label: string } {
  if (doc.status === "PAGO" || doc.status === "ISENTO") {
    return {
      status: "PAGO",
      daysDiff: 999,
      label: doc.status === "ISENTO" ? "Isento" : "Quitado",
    };
  }

  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  const dueMs = new Date(`${doc.dueDate}T12:00:00`).getTime();
  const daysDiff = Math.ceil((dueMs - todayMs) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    return {
      status: "VENCIDO",
      daysDiff,
      label: `Vencido há ${Math.abs(daysDiff)}d`,
    };
  }
  if (daysDiff <= 30) {
    return {
      status: "ATENCAO",
      daysDiff,
      label: daysDiff === 0 ? "Vence hoje" : `Vence em ${daysDiff}d`,
    };
  }
  return {
    status: "EM_DIA",
    daysDiff,
    label: `Vence ${formatDateBR(doc.dueDate)}`,
  };
}

export interface DriverCtbPointsSummary {
  driverId: string;
  points12m: number;
  gravissimaCount: number;
  maxAllowedPoints: 20 | 30 | 40;
  riskLevel: "OK" | "ATENCAO" | "SUSPENSAO";
  activeFinesCount: number;
}

export function evaluateDriverCtbPoints(
  driver: PersonalDriver,
  fines: FineRecord[],
  todayIso = todayBR(),
): DriverCtbPointsSummary {
  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  const trailingFines = fines.filter((fn) => {
    if (fn.driverId !== driver.id || fn.status === "RECORRIDA") return false;
    const fineMs = new Date(`${fn.date}T12:00:00`).getTime();
    return todayMs - fineMs <= oneYearMs && fineMs <= todayMs + 7 * 24 * 60 * 60 * 1000;
  });

  const points12m = trailingFines.reduce((sum, fn) => sum + (fn.points || 0), 0);
  const gravissimaCount = trailingFines.filter((fn) => fn.points >= 7).length;
  const maxAllowedPoints: 20 | 30 | 40 =
    gravissimaCount >= 2 ? 20 : gravissimaCount === 1 ? 30 : 40;

  let riskLevel: "OK" | "ATENCAO" | "SUSPENSAO" = "OK";
  if (points12m >= maxAllowedPoints) {
    riskLevel = "SUSPENSAO";
  } else if (points12m >= maxAllowedPoints * 0.7) {
    riskLevel = "ATENCAO";
  }

  return {
    driverId: driver.id,
    points12m,
    gravissimaCount,
    maxAllowedPoints,
    riskLevel,
    activeFinesCount: trailingFines.length,
  };
}

export function checkDriverAndVehicleCompliance(
  vehicle: PersonalVehicle | undefined,
  driver: PersonalDriver | undefined,
  snapshot: GarageSnapshot,
  todayIso = todayBR(),
): { warnings: string[] } {
  const warnings: string[] = [];

  if (driver) {
    const cnh = evaluateCnhStatus(driver, todayIso);
    if (cnh.status === "VENCIDO") {
      warnings.push(`CNH de ${driver.name} vencida (${cnh.label}).`);
    }
    const ctb = evaluateDriverCtbPoints(driver, snapshot.fines, todayIso);
    if (ctb.riskLevel === "SUSPENSAO") {
      warnings.push(
        `${driver.name} atingiu ${ctb.points12m}/${ctb.maxAllowedPoints} pontos CTB em 12 meses.`,
      );
    }
  }

  if (vehicle) {
    const crlvDocs = snapshot.documents.filter(
      (d) => d.vehicleId === vehicle.id && d.docType === "CRLV",
    );
    for (const doc of crlvDocs) {
      const ev = evaluateDocumentStatus(doc, todayIso);
      if (ev.status === "VENCIDO") {
        warnings.push(
          `Licenciamento (CRLV-e ${doc.referenceYear}) de ${vehicle.plate} está vencido (${ev.label}).`,
        );
      }
    }
  }

  return { warnings };
}
