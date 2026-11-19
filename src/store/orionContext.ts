import { createContext, useContext } from "react";
import type { User } from "firebase/auth";
import type {
  AnnualCellState,
  BankAccount,
  BrandLogoId,
  CreditCardAccount,
  FuelLog,
  GarageChecklist,
  GarageDocument,
  GarageDriver,
  GarageExpense,
  GarageFine,
  GarageFueling,
  GarageMaintenance,
  GarageReminder,
  GarageRoute,
  MonthlyBill,
  OrionState,
  PersonalAgendaRecord,
  PixRecipient,
  RevenueContract,
  RevenueSource,
  ShoppingItem,
  TripPlan,
  UserProfile,
  VehicleRecord,
} from "@/types/orion";
import type {
  ImportConflictStrategy,
  ImportExecutionReport,
  ImportPreviewPlan,
} from "@/lib/domain/orionImporter";

export interface OrionContextValue {
  user: User | null;
  authReady: boolean;
  workspaceLoading: boolean;
  state: OrionState;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  updateSelectedLogo: (logoId: BrandLogoId) => Promise<void>;
  updatePixRecipient: (recipient: PixRecipient) => Promise<void>;
  addBankAccount: (bank: Omit<BankAccount, "id">) => Promise<void>;
  addCreditCard: (card: Omit<CreditCardAccount, "id">) => Promise<void>;
  saveCardOverride: (cardId: string, limitCents: number, usedCents: number) => Promise<void>;
  clearCardOverride: (cardId: string) => Promise<void>;
  addQuickMovement: (input: {
    kind: "income" | "expense";
    title: string;
    category: string;
    amountCents: number;
    date: string;
    accountId?: string;
    settled: boolean;
    note?: string;
  }) => Promise<void>;
  addRevenueSource: (source: Omit<RevenueSource, "id">, year?: number) => Promise<void>;
  receiveRevenueEntry: (
    entryId: string,
    receivedCents: number,
    receivedDate: string,
    note?: string,
    accountId?: string | null,
  ) => Promise<void>;
  createRevenueContract: (
    contract: Omit<RevenueContract, "id" | "createdAt" | "status">,
    installments: number[],
    firstDueDate: string,
  ) => Promise<void>;
  updateContractStatus: (contractId: string, status: RevenueContract["status"]) => Promise<void>;
  updateAnnualCell: (rowId: string, monthKey: string, cell: AnnualCellState) => Promise<void>;
  addAnnualCreditor: (input: {
    year: number;
    creditor: string;
    category: string;
    dueDay: number;
    expectedCents: number;
  }) => Promise<void>;
  payMonthlyBill: (
    billId: string,
    paidCents: number,
    paidDate: string,
    isSettled: boolean,
    note?: string,
    accountId?: string | null,
  ) => Promise<void>;
  payPayableInstallment: (
    installmentId: string,
    paidCents: number,
    paidDate: string,
    isSettled: boolean,
    note?: string,
    accountId?: string | null,
  ) => Promise<void>;
  addMonthlyBill: (bill: Omit<MonthlyBill, "id" | "paidDate" | "paidCents" | "isSettled">) => Promise<void>;
  savePersonalAgenda: (record: Omit<PersonalAgendaRecord, "id"> & { id?: string }) => Promise<void>;
  deletePersonalAgenda: (id: string) => Promise<void>;
  toggleAgendaCheck: (recordId: string, date: string, itemKey: string, done: boolean) => Promise<void>;
  addShoppingItem: (item: Omit<ShoppingItem, "id" | "checked">) => Promise<void>;
  toggleShoppingItem: (id: string) => Promise<void>;
  removeShoppingItem: (id: string) => Promise<void>;
  addVehicle: (vehicle: Omit<VehicleRecord, "id">) => Promise<string>;
  upsertGarageVehicle: (vehicle: Omit<VehicleRecord, "id"> & { id?: string }) => Promise<string>;
  deleteGarageVehicle: (id: string) => Promise<void>;
  upsertGarageDriver: (driver: Omit<GarageDriver, "id"> & { id?: string }) => Promise<void>;
  deleteGarageDriver: (id: string) => Promise<void>;
  addGarageFueling: (fueling: Omit<GarageFueling, "id" | "calculatedAvg">) => Promise<void>;
  deleteGarageFueling: (id: string) => Promise<void>;
  addGarageMaintenance: (maint: Omit<GarageMaintenance, "id">) => Promise<string>;
  updateGarageMaintenanceStatus: (id: string, status: GarageMaintenance["status"]) => Promise<void>;
  deleteGarageMaintenance: (id: string) => Promise<void>;
  addGarageExpense: (exp: Omit<GarageExpense, "id">) => Promise<void>;
  deleteGarageExpense: (id: string) => Promise<void>;
  addGarageFine: (fine: Omit<GarageFine, "id">) => Promise<void>;
  updateGarageFineStatus: (id: string, status: GarageFine["status"]) => Promise<void>;
  deleteGarageFine: (id: string) => Promise<void>;
  addGarageDocument: (docItem: Omit<GarageDocument, "id">) => Promise<void>;
  markGarageDocumentPaid: (id: string, recordExpense?: boolean) => Promise<void>;
  deleteGarageDocument: (id: string) => Promise<void>;
  addGarageDocumentsBatch: (docs: Array<Omit<GarageDocument, "id">>) => Promise<void>;
  addGarageChecklist: (
    checklist: Omit<GarageChecklist, "id">,
    options?: { autoCreateMaintenance?: boolean; setVehicleInMaintenance?: boolean },
  ) => Promise<void>;
  addGarageRoute: (route: Omit<GarageRoute, "id" | "distanceKm">) => Promise<void>;
  deleteGarageRoute: (id: string) => Promise<void>;
  addGarageReminder: (reminder: Omit<GarageReminder, "id" | "completed">) => Promise<void>;
  toggleGarageReminder: (id: string) => Promise<void>;
  deleteGarageReminder: (id: string) => Promise<void>;
  addFuelLog: (log: Omit<FuelLog, "id">) => Promise<void>;
  addTrip: (trip: Omit<TripPlan, "id">) => Promise<void>;
  updateTripStatus: (id: string, status: TripPlan["status"]) => Promise<void>;
  toggleWatchlistTicker: (symbol: string) => Promise<void>;
  exportBackupJson: () => string;
  importBackupJson: (jsonText: string) => Promise<void>;
  executeOrionImport: (
    plan: ImportPreviewPlan,
    conflictStrategy: ImportConflictStrategy,
    onProgress?: (info: { phase: 1 | 2; completed: number; total: number }) => void,
  ) => Promise<ImportExecutionReport>;
  clearAllUserData: () => Promise<void>;
}

export const OrionContext = createContext<OrionContextValue | null>(null);

export function useOrion(): OrionContextValue {
  const ctx = useContext(OrionContext);
  if (!ctx) throw new Error("useOrion must be used inside OrionProvider");
  return ctx;
}
