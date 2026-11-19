import type { User } from "firebase/auth";
import type {
  GarageChecklist,
  GarageChecklistItem,
  GarageDocument,
  GarageDocumentStatus,
  GarageDocumentType,
  GarageDriver,
  GarageExpense,
  GarageFine,
  GarageFineStatus,
  GarageFuelType,
  GarageFueling,
  GarageMaintenance,
  GarageMaintenanceStatus,
  GarageMaintenanceType,
  GarageReminder,
  GarageRoute,
  GarageVehicleStatus,
  VehicleRecord,
} from "@/types/orion";

export type {
  GarageFuelType as FuelType,
  GarageVehicleStatus as VehicleStatus,
  GarageMaintenanceType as MaintenanceType,
  GarageMaintenanceStatus as MaintenanceStatus,
  GarageFineStatus as FineStatus,
  GarageDocumentType as DocumentType,
  GarageDocumentStatus as DocumentStatus,
  GarageDriver as PersonalDriver,
  GarageFueling as FuelingRecord,
  GarageMaintenance as MaintenanceRecord,
  GarageExpense as PersonalVehicleExpense,
  GarageFine as FineRecord,
  GarageDocument as VehicleDocumentRecord,
  GarageChecklistItem as ChecklistItemResult,
  GarageChecklist as VehicleChecklist,
  GarageRoute as RouteTrip,
  GarageReminder,
};

export type GarageTab =
  | "dashboard"
  | "veiculos"
  | "documentos"
  | "lancamentos"
  | "checklists"
  | "percursos";

export type PersonalVehicle = VehicleRecord & {
  brand: string;
  year: number;
  fuelType: GarageFuelType;
  currentOdometer: number;
  status: GarageVehicleStatus;
};

export interface GarageSnapshot {
  vehicles: PersonalVehicle[];
  drivers: GarageDriver[];
  fuelings: GarageFueling[];
  maintenances: GarageMaintenance[];
  expenses: GarageExpense[];
  fines: GarageFine[];
  documents: GarageDocument[];
  checklists: GarageChecklist[];
  routes: GarageRoute[];
  reminders: GarageReminder[];
}

export interface FipeConsultationResponse {
  plate: string;
  stateUf: string;
  brasilApiReachable: boolean;
  fipeReferenceMonth: string | null;
  fipeBrandCount: number | null;
  fipePriceRecord: {
    valor?: string;
    marca?: string;
    modelo?: string;
    anoModelo?: number;
    combustivel?: string;
    codigoFipe?: string;
  } | null;
  notice: string;
}

export type QuickEntryKind =
  | "abastecimento"
  | "manutencao"
  | "gasto"
  | "multa"
  | "percurso";

export type GarageContextUser = User | null;
