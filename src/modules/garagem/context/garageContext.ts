import { createContext, useContext } from "react";
import type {
  GarageSnapshot,
  GarageTab,
  PersonalVehicle,
  QuickEntryKind,
  VehicleDocumentRecord,
} from "../types/garage.types";

export interface GarageContextValue {
  snapshot: GarageSnapshot;
  activeTab: GarageTab;
  setActiveTab: (tab: GarageTab) => void;
  selectedVehicleFilter: string;
  setSelectedVehicleFilter: (vehicleId: string) => void;
  isQuickEntryOpen: boolean;
  quickEntryKind: QuickEntryKind;
  openQuickEntry: (kind?: QuickEntryKind) => void;
  closeQuickEntry: () => void;
  upsertVehicle: (v: Omit<PersonalVehicle, "id"> & { id?: string }) => Promise<string>;
  deleteVehicle: (id: string) => Promise<void>;
  upsertDriver: (
    d: Omit<GarageSnapshot["drivers"][number], "id"> & { id?: string },
  ) => Promise<void>;
  deleteDriver: (id: string) => Promise<void>;
  addFueling: (
    f: Omit<GarageSnapshot["fuelings"][number], "id" | "calculatedAvg">,
  ) => Promise<void>;
  deleteFueling: (id: string) => Promise<void>;
  addMaintenance: (m: Omit<GarageSnapshot["maintenances"][number], "id">) => Promise<string>;
  updateMaintenanceStatus: (
    id: string,
    status: GarageSnapshot["maintenances"][number]["status"],
  ) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;
  addExpense: (e: Omit<GarageSnapshot["expenses"][number], "id">) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addFine: (fn: Omit<GarageSnapshot["fines"][number], "id">) => Promise<void>;
  updateFineStatus: (
    id: string,
    status: GarageSnapshot["fines"][number]["status"],
  ) => Promise<void>;
  deleteFine: (id: string) => Promise<void>;
  addDocumentObligation: (doc: Omit<VehicleDocumentRecord, "id">) => Promise<void>;
  markDocumentPaid: (id: string, recordExpense?: boolean) => Promise<void>;
  deleteDocumentObligation: (id: string) => Promise<void>;
  generateCalendarForVehicles: (exerciseYear?: number) => Promise<number>;
  addChecklist: (
    chk: Omit<GarageSnapshot["checklists"][number], "id">,
    options?: { autoCreateMaintenance?: boolean; setVehicleInMaintenance?: boolean },
  ) => Promise<void>;
  addRoute: (r: Omit<GarageSnapshot["routes"][number], "id" | "distanceKm">) => Promise<void>;
  deleteRoute: (id: string) => Promise<void>;
  addReminder: (
    rem: Omit<GarageSnapshot["reminders"][number], "id" | "completed">,
  ) => Promise<void>;
  toggleReminder: (id: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
}

export const GarageContext = createContext<GarageContextValue | null>(null);

export function useGarage(): GarageContextValue {
  const ctx = useContext(GarageContext);
  if (!ctx) {
    throw new Error("useGarage deve ser utilizado dentro de <GarageProvider>");
  }
  return ctx;
}
