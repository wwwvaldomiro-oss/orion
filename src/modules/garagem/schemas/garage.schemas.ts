import { z } from "zod";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const vehicleSchema = z.object({
  plate: z
    .string()
    .trim()
    .toUpperCase()
    .min(7, "Informe uma placa válida (ex.: ABC1D23)")
    .max(8, "Placa deve ter no máximo 8 caracteres")
    .regex(/^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/, "Formato esperado: ABC1D23 ou ABC-1234"),
  brand: z.string().trim().min(2, "Informe a marca do veículo"),
  model: z.string().trim().min(2, "Informe o modelo do veículo"),
  year: z.coerce
    .number()
    .int()
    .min(1960, "Ano mínimo 1960")
    .max(new Date().getFullYear() + 1, "Ano inválido"),
  fuelType: z.enum(["GASOLINA", "ETANOL", "DIESEL", "GNV", "ELETRICO", "FLEX"]),
  currentOdometer: z.coerce.number().min(0, "Hodômetro não pode ser negativo"),
  status: z.enum(["ATIVO", "MANUTENCAO", "INATIVO"]),
  assignedDriverId: z.string().optional(),
  renavam: z.string().trim().optional(),
  stateUf: z.string().trim().max(2).optional(),
  tankCapacityLiters: z.coerce.number().min(0).optional(),
  fipeValue: z.coerce.number().min(0).optional(),
  monthlyFixedCost: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

export const driverSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do condutor"),
  cnhNumber: z.string().trim().min(5, "Número da CNH inválido").max(20, "CNH muito longa"),
  cnhCategory: z.string().trim().min(1, "Selecione a categoria"),
  cnhExpiry: z.string().regex(isoDateRegex, "Data de validade inválida"),
  phone: z.string().trim().optional(),
  allowedVehicleIds: z.array(z.string()),
  active: z.boolean(),
});

export const fuelingSchema = z.object({
  vehicleId: z.string().min(1, "Selecione o veículo"),
  driverId: z.string().optional(),
  date: z.string().regex(isoDateRegex, "Data inválida"),
  odometer: z.coerce.number().min(0, "Informe o hodômetro atual"),
  fuelType: z.enum(["GASOLINA", "ETANOL", "DIESEL", "GNV", "ELETRICO", "FLEX"]),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero"),
  unitPrice: z.coerce.number().positive("Preço unitário deve ser maior que zero"),
  totalCost: z.coerce.number().positive("Valor total deve ser maior que zero"),
  fullTank: z.boolean(),
  stationName: z.string().trim().optional(),
  nfceKey: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const maintenanceSchema = z.object({
  vehicleId: z.string().min(1, "Selecione o veículo"),
  driverId: z.string().optional(),
  type: z.enum(["PREVENTIVA", "CORRETIVA"]),
  status: z.enum(["ABERTA", "EM_EXECUCAO", "CONCLUIDA"]).optional(),
  date: z.string().regex(isoDateRegex, "Data inválida"),
  odometer: z.coerce.number().min(0, "Hodômetro inválido"),
  category: z.string().trim().min(2, "Informe o serviço realizado"),
  providerName: z.string().trim().optional(),
  partsCost: z.coerce.number().min(0, "Custo inválido"),
  laborCost: z.coerce.number().min(0, "Custo inválido"),
  totalCost: z.coerce.number().min(0, "Valor total inválido").optional(),
  notes: z.string().trim().optional(),
});

export const personalExpenseSchema = z.object({
  vehicleId: z.string().min(1, "Selecione o veículo"),
  driverId: z.string().optional(),
  category: z.string().trim().min(2, "Informe a categoria"),
  date: z.string().regex(isoDateRegex, "Data inválida"),
  amount: z.coerce.number().positive("O valor deve ser maior que zero"),
  description: z.string().trim().optional(),
});

export const fineSchema = z.object({
  vehicleId: z.string().min(1, "Selecione o veículo"),
  driverId: z.string().optional(),
  date: z.string().regex(isoDateRegex, "Data inválida"),
  time: z.string().trim().optional(),
  infractionCode: z.string().trim().min(3, "Informe o código da infração"),
  description: z.string().trim().min(3, "Descreva a infração"),
  location: z.string().trim().optional(),
  points: z.coerce.number().int().min(0).max(21),
  amount: z.coerce.number().positive("Valor da multa deve ser maior que zero"),
  sneDiscountApplied: z.boolean(),
  driverIndicationDeadline: z.string().optional(),
  status: z.enum(["PENDENTE", "INDICADO", "PAGA", "RECORRIDA"]),
});

export const routeTripSchema = z
  .object({
    vehicleId: z.string().min(1, "Selecione o veículo"),
    driverId: z.string().optional(),
    date: z.string().regex(isoDateRegex, "Data inválida"),
    origin: z.string().trim().min(2, "Informe a origem"),
    destination: z.string().trim().min(2, "Informe o destino"),
    startOdometer: z.coerce.number().min(0, "Hodômetro inicial inválido"),
    endOdometer: z.coerce.number().min(0, "Hodômetro final inválido"),
    estimatedKm: z.coerce.number().min(0).optional(),
    purpose: z.string().trim().optional(),
  })
  .refine((data) => data.endOdometer > data.startOdometer, {
    message: "O hodômetro final deve ser maior que o hodômetro inicial",
    path: ["endOdometer"],
  });

export const reminderSchema = z
  .object({
    vehicleId: z.string().min(1, "Selecione o veículo"),
    title: z.string().trim().min(3, "Informe o título do lembrete"),
    category: z.enum(["MANUTENCAO", "DOCUMENTACAO", "SEGURO", "OUTRO"]),
    dueDate: z.string().optional(),
    dueOdometer: z.coerce.number().min(0).optional(),
    notes: z.string().trim().optional(),
  })
  .refine(
    (data) => Boolean(data.dueDate) || (data.dueOdometer !== undefined && data.dueOdometer > 0),
    {
      message: "Defina uma data alvo ou uma quilometragem limite",
      path: ["dueDate"],
    },
  );

export const documentObligationSchema = z.object({
  vehicleId: z.string().min(1, "Selecione o veículo"),
  docType: z.enum(["CRLV", "IPVA", "SEGURO", "VISTORIA"]),
  referenceYear: z.coerce.number().int().min(2020).max(2040),
  dueDate: z.string().regex(isoDateRegex, "Data de vencimento inválida"),
  amount: z.coerce.number().min(0, "Valor inválido"),
  stateUf: z.string().trim().max(2).optional(),
  providerOrAuthority: z.string().trim().optional(),
  policyOrCode: z.string().trim().optional(),
  status: z.enum(["PENDENTE", "PAGO", "ISENTO"]),
  notes: z.string().trim().optional(),
});
