import { describe, expect, it } from "vitest";
import {
  computeFlexRecommendation,
  detectConsumptionAnomalies,
  evaluateDocumentStatus,
  evaluateDriverCtbPoints,
  getLicensePlateDueInfo,
  parseNfceQrPayload,
  recalculateFuelingAverages,
} from "../utils/garage.calculations";
import {
  driverSchema,
  fuelingSchema,
  routeTripSchema,
  vehicleSchema,
} from "../schemas/garage.schemas";
import type {
  FineRecord,
  FuelingRecord,
  PersonalDriver,
  VehicleDocumentRecord,
} from "../types/garage.types";

describe("garagem.calculations", () => {
  it("calcula consumo tanque cheio a tanque cheio mesmo com abastecimento parcial intermediário", () => {
    const records: FuelingRecord[] = [
      {
        id: "f1",
        vehicleId: "v1",
        date: "2026-10-01",
        odometer: 10000,
        fuelType: "GASOLINA",
        quantity: 40,
        unitPrice: 6.0,
        totalCost: 240,
        fullTank: true,
      },
      {
        id: "f2",
        vehicleId: "v1",
        date: "2026-10-10",
        odometer: 10200,
        fuelType: "GASOLINA",
        quantity: 15,
        unitPrice: 6.0,
        totalCost: 90,
        fullTank: false,
      },
      {
        id: "f3",
        vehicleId: "v1",
        date: "2026-10-20",
        odometer: 10550,
        fuelType: "GASOLINA",
        quantity: 40,
        unitPrice: 6.0,
        totalCost: 240,
        fullTank: true,
      },
    ];

    const calculated = recalculateFuelingAverages(records);
    const f3 = calculated.find((r) => r.id === "f3");
    const f2 = calculated.find((r) => r.id === "f2");
    expect(f2?.calculatedAvg).toBeUndefined();
    // 550 km / (15 + 40 L) = 10.0 km/L
    expect(f3?.calculatedAvg).toBe(10);
  });

  it("detecta anomalia de consumo quando há queda >= 15% frente à média histórica", () => {
    const calculated = recalculateFuelingAverages([
      {
        id: "a1",
        vehicleId: "v1",
        date: "2026-09-01",
        odometer: 1000,
        fuelType: "GASOLINA",
        quantity: 30,
        unitPrice: 6,
        totalCost: 180,
        fullTank: true,
      },
      {
        id: "a2",
        vehicleId: "v1",
        date: "2026-09-10",
        odometer: 1360,
        fuelType: "GASOLINA",
        quantity: 30,
        unitPrice: 6,
        totalCost: 180,
        fullTank: true,
      }, // 12 km/L
      {
        id: "a3",
        vehicleId: "v1",
        date: "2026-09-20",
        odometer: 1720,
        fuelType: "GASOLINA",
        quantity: 30,
        unitPrice: 6,
        totalCost: 180,
        fullTank: true,
      }, // 12 km/L
      {
        id: "a4",
        vehicleId: "v1",
        date: "2026-09-30",
        odometer: 1960,
        fuelType: "GASOLINA",
        quantity: 30,
        unitPrice: 6,
        totalCost: 180,
        fullTank: true,
      }, // 8 km/L (queda de 33.3%)
    ]);

    const anomalies = detectConsumptionAnomalies(calculated, "TODOS", 15);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0]?.fuelingId).toBe("a4");
    expect(anomalies[0]?.dropPercent).toBeGreaterThanOrEqual(30);
  });

  it("calcula recomendação da calculadora Flex corretamente", () => {
    const etanolMelhor = computeFlexRecommendation(3.8, 6.0, 0.7);
    expect(etanolMelhor?.recommended).toBe("ETANOL");

    const gasolinaMelhor = computeFlexRecommendation(4.6, 6.0, 0.7);
    expect(gasolinaMelhor?.recommended).toBe("GASOLINA");
  });

  it("gera calendário de vencimento IPVA/CRLV por final da placa e UF", () => {
    const sp = getLicensePlateDueInfo("ABC1D22", "SP", 2026);
    expect(sp.finalDigit).toBe(2);
    expect(sp.crlvDueDate).toBe("2026-07-31");

    const df = getLicensePlateDueInfo("XYZ9A09", "DF", 2026);
    expect(df.finalDigit).toBe(9);
    expect(df.crlvDueDate).toBe("2026-12-31");
  });

  it("avalia pontuação CTB Art. 261 com redutores de limite (40/30/20 pts) e ignora multas recorridas", () => {
    const driver: PersonalDriver = {
      id: "d1",
      name: "Condutor Teste",
      cnhNumber: "12345678900",
      cnhCategory: "B",
      cnhExpiry: "2028-10-01",
      allowedVehicleIds: ["v1"],
      active: true,
    };

    const fines: FineRecord[] = [
      {
        id: "fn1",
        vehicleId: "v1",
        driverId: "d1",
        date: "2026-08-01",
        infractionCode: "745-50",
        description: "Velocidade",
        points: 7,
        amount: 293.47,
        sneDiscountApplied: true,
        status: "PAGA",
      },
      {
        id: "fn2",
        vehicleId: "v1",
        driverId: "d1",
        date: "2026-09-01",
        infractionCode: "746-30",
        description: "Velocidade >20%",
        points: 7,
        amount: 293.47,
        sneDiscountApplied: false,
        status: "PENDENTE",
      },
      {
        id: "fn3",
        vehicleId: "v1",
        driverId: "d1",
        date: "2026-10-01",
        infractionCode: "500-10",
        description: "Anulada",
        points: 7,
        amount: 200,
        sneDiscountApplied: false,
        status: "RECORRIDA",
      },
    ];

    const summary = evaluateDriverCtbPoints(driver, fines, "2026-11-19");
    expect(summary.gravissimaCount).toBe(2);
    expect(summary.maxAllowedPoints).toBe(20);
    expect(summary.points12m).toBe(14);
    expect(summary.riskLevel).toBe("ATENCAO");
  });

  it("avalia vencimentos de documentos corretamente", () => {
    const docOverdue: VehicleDocumentRecord = {
      id: "doc1",
      vehicleId: "v1",
      docType: "IPVA",
      referenceYear: 2026,
      dueDate: "2026-10-01",
      amount: 1800,
      status: "PENDENTE",
    };
    expect(evaluateDocumentStatus(docOverdue, "2026-11-19").status).toBe("VENCIDO");

    const docPaid: VehicleDocumentRecord = { ...docOverdue, status: "PAGO" };
    expect(evaluateDocumentStatus(docPaid, "2026-11-19").status).toBe("PAGO");
  });

  it("extrai chave de 44 dígitos, valor e data de URLs NFC-e SEFAZ", () => {
    const key = "53261112345678000190650010000123451000123456";
    const parsed = parseNfceQrPayload(
      `https://www.fazenda.df.gov.br/nfce/qrcode?p=${key}|2|1|1|ABC&vNF=245,80&dhEmi=2026-11-15&xNome=Posto%20Eixo`,
    );
    expect(parsed?.nfceKey).toBe(key);
    expect(parsed?.totalCost).toBeCloseTo(245.8, 2);
    expect(parsed?.date).toBe("2026-11-15");
    expect(parsed?.stationName).toBe("Posto Eixo");
  });

  it("valida schemas Zod pessoais permitindo abastecimento e percurso sem driverId", () => {
    expect(
      vehicleSchema.safeParse({
        plate: "ABC1D23",
        brand: "Toyota",
        model: "Corolla",
        year: 2023,
        fuelType: "FLEX",
        currentOdometer: 25000,
        status: "ATIVO",
      }).success,
    ).toBe(true);

    expect(
      driverSchema.safeParse({
        name: "Titular",
        cnhNumber: "123456789",
        cnhCategory: "B",
        cnhExpiry: "2028-05-10",
        allowedVehicleIds: [],
        active: true,
      }).success,
    ).toBe(true);

    expect(
      fuelingSchema.safeParse({
        vehicleId: "veh-1",
        date: "2026-11-19",
        odometer: 25400,
        fuelType: "GASOLINA",
        quantity: 40,
        unitPrice: 5.99,
        totalCost: 239.6,
        fullTank: true,
      }).success,
    ).toBe(true);

    expect(
      routeTripSchema.safeParse({
        vehicleId: "veh-1",
        date: "2026-11-19",
        origin: "Brasília",
        destination: "Pirenópolis",
        startOdometer: 25000,
        endOdometer: 24900,
      }).success,
    ).toBe(false);
  });
});
