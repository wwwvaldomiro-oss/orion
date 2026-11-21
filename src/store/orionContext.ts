import { createContext, useContext } from "react";
import type { User } from "firebase/auth";
import type { FiscalReceipt } from "@/lib/receiptAnalysis";
import type {
  AgendaAlarm,
  AgendaContact,
  AgendaEventOverride,
  AgendaNote,
  AgendaSettings,
  AnnualCellState,
  BankAccount,
  BrandLogoId,
  CalculatorHistoryEntry,
  ContactCategory,
  ContactSubcategory,
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
  PaymentAttachmentRef,
  PersonalAgendaRecord,
  PixRecipient,
  RevenueContract,
  RevenueSource,
  ShoppingItem,
  TripPlan,
  UserProfile,
  VehicleRecord,
} from "@/types/orion";
import type { UnifiedHistoryRow } from "@/lib/domain/ledgerHistory";
import type {
  ImportConflictStrategy,
  ImportExecutionReport,
  ImportPreviewPlan,
} from "@/lib/domain/orionImporter";

export interface PaymentSettlementOptions {
  discountCents?: number;
  surchargeCents?: number;
  bankTransactionId?: string | null;
  attachments?: PaymentAttachmentRef[];
  isEarlyPayoff?: boolean;
  idempotencyKey?: string;
}

export interface ReceiptSettlementOptions {
  isSettled?: boolean;
  discountCents?: number;
  surchargeCents?: number;
  bankTransactionId?: string | null;
  attachments?: PaymentAttachmentRef[];
  idempotencyKey?: string;
}

export interface AnnualCellUpdateOptions {
  accountId?: string | null;
  bankTransactionId?: string | null;
  discountCents?: number;
  surchargeCents?: number;
  attachments?: PaymentAttachmentRef[];
  isEarlyPayoff?: boolean;
  idempotencyKey?: string;
}

export interface CorrectPaymentInput {
  paymentEventId?: string;
  billId?: string;
  installmentId?: string;
  annualRowId?: string;
  period?: string;
  paidCents: number;
  paidDate: string | null;
  expectedCents?: number;
  isSettled: boolean;
  discountCents?: number;
  surchargeCents?: number;
  accountId: string | null;
  bankTransactionId: string | null;
  note: string;
  reason: string;
  attachments?: PaymentAttachmentRef[];
  idempotencyKey?: string;
}

export interface ReversePaymentInput {
  paymentEventId?: string;
  billId?: string;
  installmentId?: string;
  annualRowId?: string;
  period?: string;
  reason: string;
  idempotencyKey?: string;
}

export interface CorrectReceiptInput {
  revenueEventId?: string;
  entryId: string;
  receivedCents: number;
  receivedDate: string | null;
  isSettled: boolean;
  discountCents?: number;
  surchargeCents?: number;
  accountId: string | null;
  bankTransactionId: string | null;
  note: string;
  reason: string;
  attachments?: PaymentAttachmentRef[];
  idempotencyKey?: string;
}

export interface ReverseReceiptInput {
  revenueEventId?: string;
  entryId: string;
  reason: string;
  idempotencyKey?: string;
}

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
    options?: ReceiptSettlementOptions,
  ) => Promise<void>;
  correctRevenueEvent: (input: CorrectReceiptInput) => Promise<void>;
  reverseRevenueEvent: (input: ReverseReceiptInput) => Promise<void>;
  createRevenueContract: (
    contract: Omit<RevenueContract, "id" | "createdAt" | "status">,
    installments: number[],
    firstDueDate: string,
  ) => Promise<void>;
  updateContractStatus: (contractId: string, status: RevenueContract["status"]) => Promise<void>;
  updateAnnualCell: (
    rowId: string,
    monthKey: string,
    cell: AnnualCellState,
    options?: AnnualCellUpdateOptions,
  ) => Promise<void>;
  addAnnualCreditor: (input: {
    year: number;
    creditor: string;
    category: string;
    dueDay: number;
    expectedCents: number;
  }) => Promise<void>;
  saveAnnualHistorySnapshot: (year?: number) => Promise<void>;
  payMonthlyBill: (
    billId: string,
    paidCents: number,
    paidDate: string,
    isSettled: boolean,
    note?: string,
    accountId?: string | null,
    options?: PaymentSettlementOptions,
  ) => Promise<void>;
  payPayableInstallment: (
    installmentId: string,
    paidCents: number,
    paidDate: string,
    isSettled: boolean,
    note?: string,
    accountId?: string | null,
    options?: PaymentSettlementOptions,
  ) => Promise<void>;
  correctPaymentEvent: (input: CorrectPaymentInput) => Promise<void>;
  reversePaymentEvent: (input: ReversePaymentInput) => Promise<void>;
  addMonthlyBill: (bill: Omit<MonthlyBill, "id" | "paidDate" | "paidCents" | "isSettled">) => Promise<void>;
  uploadHistoryAttachment: (file: File, linkRefId: string) => Promise<PaymentAttachmentRef>;
  attachToHistoryRow: (row: UnifiedHistoryRow, attachment: PaymentAttachmentRef) => Promise<void>;
  removeAttachmentFromHistoryRow: (row: UnifiedHistoryRow, attachmentId: string) => Promise<void>;
  savePersonalAgenda: (record: Omit<PersonalAgendaRecord, "id"> & { id?: string }) => Promise<string>;
  deletePersonalAgenda: (id: string) => Promise<void>;
  toggleAgendaCheck: (recordId: string, date: string, itemKey: string, done: boolean) => Promise<void>;
  saveAgendaOverride: (
    override: Omit<AgendaEventOverride, "id" | "updatedAtIso"> & { id?: string },
  ) => Promise<string>;
  clearAgendaOverride: (overrideId: string) => Promise<void>;
  upsertContactCategory: (cat: Omit<ContactCategory, "id"> & { id?: string }) => Promise<string>;
  deleteContactCategoryWithRemap: (categoryId: string, replacementCategoryId?: string) => Promise<void>;
  upsertContactSubcategory: (sub: Omit<ContactSubcategory, "id"> & { id?: string }) => Promise<string>;
  deleteContactSubcategory: (subcategoryId: string) => Promise<void>;
  upsertAgendaContact: (contact: Omit<AgendaContact, "id"> & { id?: string }) => Promise<string>;
  deleteAgendaContact: (contactId: string) => Promise<void>;
  upsertAgendaAlarm: (alarm: Omit<AgendaAlarm, "id"> & { id?: string }) => Promise<string>;
  deleteAgendaAlarm: (alarmId: string) => Promise<void>;
  upsertAgendaNote: (
    note: Omit<AgendaNote, "id" | "updatedAtIso"> & { id?: string },
  ) => Promise<string>;
  deleteAgendaNote: (noteId: string) => Promise<void>;
  sendNoteToCalendar: (
    noteId: string,
    input: { date: string; time?: string; title?: string; reminder?: boolean },
  ) => Promise<string>;
  addCalculatorHistory: (
    entry: Omit<CalculatorHistoryEntry, "id" | "createdAtIso">,
  ) => Promise<void>;
  clearCalculatorHistory: () => Promise<void>;
  updateAgendaSettings: (patch: Partial<AgendaSettings>) => Promise<void>;
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
  saveFiscalReceipt: (receipt: FiscalReceipt) => Promise<string>;
  deleteFiscalReceipt: (receipt: FiscalReceipt) => Promise<void>;
  createWarrantyAgendaAlert: (receipt: FiscalReceipt) => Promise<string>;
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
