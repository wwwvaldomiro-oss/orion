import type { FiscalReceipt } from "@/lib/receiptAnalysis";

export type BrandLogoId = "nexo" | "apice" | "prisma" | "vortice" | "orbita";

export type BankAccount = {
  id: string;
  institution: string;
  name: string;
  accountType: "CHECKING" | "SAVINGS";
  number: string;
  balanceCents: number;
  color: string;
  sourceRecordId?: string;
};

export type CardBrand = "VISA" | "MASTERCARD" | "ELO" | "AMEX" | "HIPERCARD" | "OTHER";

export type CreditCardAccount = {
  id: string;
  institution: string;
  name: string;
  brand: CardBrand;
  number: string;
  creditLimitCents: number;
  availableCents: number;
  closingDay: number;
  dueDay: number;
  manualLimitCents?: number;
  manualUsedCents?: number;
  linkedAnnualExpenseId?: string;
  sourceRecordId?: string;
};

export type PaymentAttachmentRef = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  storagePath?: string;
  documentUrl?: string;
  uploadedAt: string;
};

export type WalletTransaction = {
  id: string;
  accountId: string;
  accountType: "BANK" | "CREDIT";
  accountName: string;
  institution: string;
  description: string;
  amountCents: number; // positive = income, negative = expense
  date: string; // YYYY-MM-DD
  category: string;
  reconciledEventId?: string | null;
};

export type RevenueSource = {
  id: string;
  title: string;
  category: string;
  expectedCents: number;
  dueDay: number;
  recurrence: "monthly" | "single";
  active: boolean;
  firstDue?: string;
  details?: string;
  note?: string;
  sourceRecordId?: string;
};

export type RevenueEntry = {
  id: string;
  sourceId?: string;
  contractId?: string;
  installmentNumber?: number;
  title: string;
  category: string;
  dueDate: string; // YYYY-MM-DD
  expectedCents: number;
  receivedDate: string | null;
  receivedCents: number | null;
  agreedCents?: number;
  adjustmentCents?: number | null;
  discountCents?: number | null;
  surchargeCents?: number | null;
  accountId?: string | null;
  bankTransactionId?: string | null;
  attachments?: PaymentAttachmentRef[];
  note?: string;
  sourceRecordId?: string;
};

export type RevenueEventSnapshot = {
  receivedCents?: number | null;
  receivedDate?: string | null;
  isSettled?: boolean;
  accountId?: string | null;
  discountCents?: number | null;
  surchargeCents?: number | null;
  bankTransactionId?: string | null;
  note?: string | null;
};

export type RevenueEvent = {
  id: string;
  entryId: string;
  kind: string;
  reason: string;
  eventCreatedAt: string;
  accountId?: string | null;
  bankTransactionId?: string | null;
  targetEventId?: string | null;
  idempotencyKey?: string;
  beforeData?: RevenueEventSnapshot | null;
  afterData?: RevenueEventSnapshot | null;
  attachments?: PaymentAttachmentRef[];
  sourceRecordId?: string;
};

export type PaymentEventKind =
  | "pagamento"
  | "parcial"
  | "quitacao_antecipada"
  | "correcao"
  | "estorno";

export type PaymentEventSnapshot = {
  paidCents?: number | null;
  paidDate?: string | null;
  isSettled?: boolean;
  accountId?: string | null;
  discountCents?: number | null;
  surchargeCents?: number | null;
  bankTransactionId?: string | null;
  note?: string | null;
};

export type PaymentEvent = {
  id: string;
  billId?: string | null;
  installmentId?: string | null;
  contractId?: string | null;
  annualRowId?: string | null;
  period?: string | null;
  cardId?: string | null;
  creditor: string;
  category?: string;
  dueDate: string; // YYYY-MM-DD or ""
  expectedCents: number;
  paidCents: number;
  paidDate: string | null;
  discountCents?: number | null;
  surchargeCents?: number | null;
  isSettled: boolean;
  accountId?: string | null;
  bankTransactionId?: string | null;
  targetEventId?: string | null;
  idempotencyKey?: string;
  kind: PaymentEventKind;
  reason: string;
  eventCreatedAt: string;
  beforeData?: PaymentEventSnapshot | null;
  afterData?: PaymentEventSnapshot | null;
  attachments?: PaymentAttachmentRef[];
  note?: string;
  sourceRecordId?: string;
};

export type ContractStatus =
  | "Em andamento"
  | "Atrasado"
  | "Concluído"
  | "Pausado"
  | "Perdoado"
  | "Ajuizado"
  | "Renegociado";

export type CorrectionIndex = "Sem correção" | "IPCA" | "IGP-M" | "Personalizado";

export type RevenueContract = {
  id: string;
  title: string;
  buyer: string;
  cpf: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  address: string;
  postalCode: string;
  totalCents: number;
  downPaymentCents: number;
  interestPercent: number;
  finePercent: number;
  correctionIndex: CorrectionIndex;
  customRatePercent?: number;
  status: ContractStatus;
  createdAt: string;
  note?: string;
};

export type PixRecipient = {
  key: string;
  name: string;
  state: string;
  city: string;
};

export type AnnualYearRecord = {
  id: string;
  year: number;
  sourceName?: string;
  archivedAt?: string | null;
  totalExpenseCents?: number;
  categoryTotalsCents?: Record<string, number>;
  monthlyCategoryCents?: Record<string, Record<string, number>>;
  snapshotUpdatedAt?: string;
  sourceRecordId?: string;
};

export type AnnualCellState = {
  expectedCents: number | null;
  paidCents: number | null;
  paidDate: string | null;
  isSettled: boolean;
  note?: string;
};

export type AnnualExpenseKind = "consumption" | "debt";
export type AnnualExpenseSource = "consumption" | "contract" | "card" | "annual_tax";

export type AnnualExpenseRow = {
  id: string;
  year: number;
  creditor: string;
  category: string;
  dueDay: number;
  months: Record<string, AnnualCellState>; // key "01".."12"
  expenseKind?: AnnualExpenseKind;
  expenseSource?: AnnualExpenseSource;
  annualTaxKind?: string | null;
  consumptionValueType?: string | null;
  position?: number;
  sourceContractId?: string | null;
  sourceTemplateId?: string | null;
  sourceRecordId?: string;
};

export type MonthlyBill = {
  id: string;
  period: string; // YYYY-MM
  creditor: string;
  category: string;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  expectedCents: number;
  paidDate: string | null;
  paidCents: number | null;
  isSettled: boolean;
  sourceAnnualId?: string;
  contractId?: string | null;
  installmentNumber?: number | null;
  expenseKind?: AnnualExpenseKind;
  accountId?: string | null;
  bankTransactionId?: string | null;
  discountCents?: number | null;
  surchargeCents?: number | null;
  attachments?: PaymentAttachmentRef[];
  isCardInvoice?: boolean;
  cardId?: string | null;
  note?: string;
  sourceRecordId?: string;
};

export type PayableContract = {
  id: string;
  name: string;
  description: string;
  sourceSheet?: string;
  detailsJson?: Record<string, number | string | boolean | null>;
  archivedAt?: string | null;
  contractCreatedAt?: string;
  sourceRecordId?: string;
};

export type PayableInstallment = {
  id: string;
  contractId: string;
  number: number;
  dueDate: string; // YYYY-MM-DD
  expectedCents: number;
  isSettled: boolean;
  paidCents: number | null;
  paidDate: string | null;
  note?: string | null;
  accountId?: string | null;
  bankTransactionId?: string | null;
  discountCents?: number | null;
  surchargeCents?: number | null;
  attachments?: PaymentAttachmentRef[];
  sourceRecordId?: string;
};

export type CardMonthSnapshotTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
};

export type CardMonthSnapshot = {
  id: string;
  accountId: string;
  accountName?: string;
  isUnlinked?: boolean;
  period: string; // YYYY-MM
  capturedAt: string;
  closingDate: string | null;
  dueDate: string | null;
  invoiceCents: number | null;
  providerInvoiceId: string | null;
  totalLimitCents: number | null;
  availableLimitCents: number | null;
  usedLimitCents: number | null;
  transactions: CardMonthSnapshotTransaction[];
  sourceRecordId?: string;
};

export type PersonalKind = "birthday" | "work" | "appointment" | "event" | "tasks";

export type AgendaRecurrence =
  | "none"
  | "daily"
  | "12x36"
  | "weekly"
  | "monthly"
  | "yearly"
  | "custom";

export type AgendaChecklistItem = {
  key: string;
  description: string;
};

export type PersonalAgendaRecord = {
  id: string;
  kind: PersonalKind;
  title: string;
  startDate: string; // YYYY-MM-DD
  time: string;
  endTime?: string;
  breakRule?: string;
  company?: string;
  description: string;
  recurrence: AgendaRecurrence;
  customDates?: string[];
  favorite: boolean;
  reminder: boolean;
  reminderMinutesBefore?: number;
  completed?: boolean;
  completedAt?: string;
  linkedNoteId?: string;
  linkedContactId?: string;
  color?: string;
  items: AgendaChecklistItem[];
};

export type AgendaCheckState = Record<string, boolean>; // `${recordId}:${date}:${itemKey}`

export type AgendaEventSourceType =
  | "personal"
  | "holiday"
  | "birthday"
  | "bill"
  | "annual_expense"
  | "card_snapshot"
  | "payable_installment"
  | "revenue_entry"
  | "garage_maintenance"
  | "garage_document"
  | "garage_reminder"
  | "garage_fine"
  | "trip"
  | "note";

export type AgendaEventOverride = {
  id: string;
  sourceType: AgendaEventSourceType;
  sourceId: string;
  occurrenceDate: string; // YYYY-MM-DD
  action: "completed" | "postponed" | "hidden" | "modified";
  postponedToDate?: string;
  postponedToTime?: string;
  overrideTitle?: string;
  overrideTime?: string;
  overrideEndTime?: string;
  overrideBreakRule?: string;
  overrideCompany?: string;
  overrideDescription?: string;
  note?: string;
  updatedAtIso: string;
};

export type ContactCategory = {
  id: string;
  name: string;
  color: string;
  isCommercial: boolean;
  order: number;
};

export type ContactSubcategory = {
  id: string;
  categoryId: string;
  name: string;
  color: string;
  order: number;
};

export type ContactPhone = {
  label: string;
  number: string;
  isWhatsApp?: boolean;
};

export type AgendaContact = {
  id: string;
  name: string;
  nickname?: string;
  birthDay?: number | null;
  birthMonth?: number | null;
  birthYear?: number | null;
  phones: ContactPhone[];
  emails: string[];
  categoryId: string;
  subcategoryId?: string;
  categoryColor?: string;
  subcategoryColor?: string;
  relationship?: string;
  company?: string;
  profession?: string;
  address?: string;
  city?: string;
  state?: string;
  website?: string;
  notes?: string;
  birthdayReminderEnabled: boolean;
  birthdayReminderDaysBefore: number;
  notificationsEnabled: boolean;
};

export type AgendaAlarmTone = "chime" | "bell" | "pulse";

export type AgendaAlarm = {
  id: string;
  name: string;
  time: string; // HH:mm
  repeatDays: number[]; // 0=Dom..6=Sab
  soundEnabled: boolean;
  soundTone: AgendaAlarmTone;
  enabled: boolean;
  snoozeUntilIso?: string | null;
  lastTriggeredKey?: string | null;
};

export type AgendaNoteType = "free" | "checklist" | "shopping";

export type AgendaChecklistEntry = {
  id: string;
  text: string;
  done: boolean;
};

export type ShoppingStoreProduct = {
  id: string;
  description: string;
  quantity: number;
  unit?: string;
  unitPriceCents: number;
  purchased: boolean;
};

export type ShoppingStoreGroup = {
  id: string;
  name: string;
  address?: string;
  note?: string;
  items: ShoppingStoreProduct[];
};

export type AgendaNote = {
  id: string;
  type: AgendaNoteType;
  title: string;
  color: string;
  content: string;
  checklistItems: AgendaChecklistEntry[];
  stores: ShoppingStoreGroup[];
  linkedAgendaEventId?: string | null;
  linkedDate?: string | null;
  updatedAtIso: string;
};

export type CalculatorHistoryEntry = {
  id: string;
  expression: string;
  result: string;
  mode: "normal" | "scientific";
  angleUnit: "DEG" | "RAD";
  createdAtIso: string;
};

export type AgendaSettings = {
  timeFormat: "24h" | "12h";
  showSeconds: boolean;
  defaultSnoozeMinutes: number;
  leapYearBirthdayRule: "feb28" | "mar01";
  shoppingHighlightColor: string;
  notificationsEnabled: boolean;
  alarmSoundDefault: boolean;
  weatherLocationName: string;
  weatherLat?: number | null;
  weatherLon?: number | null;
  themeMode: "light" | "dark";
  hiddenDefaultCategoryIds?: string[];
  hiddenDefaultSubcategoryIds?: string[];
};

export function createDefaultAgendaSettings(): AgendaSettings {
  return {
    timeFormat: "24h",
    showSeconds: true,
    defaultSnoozeMinutes: 5,
    leapYearBirthdayRule: "feb28",
    shoppingHighlightColor: "#fef08a",
    notificationsEnabled: true,
    alarmSoundDefault: true,
    weatherLocationName: "",
    weatherLat: null,
    weatherLon: null,
    themeMode: "light",
    hiddenDefaultCategoryIds: [],
    hiddenDefaultSubcategoryIds: [],
  };
}

export type ShoppingItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPriceCents: number;
  checked: boolean;
};

export type GarageFuelType = "GASOLINA" | "ETANOL" | "DIESEL" | "GNV" | "ELETRICO" | "FLEX";
export type GarageVehicleStatus = "ATIVO" | "MANUTENCAO" | "INATIVO";
export type GarageMaintenanceType = "PREVENTIVA" | "CORRETIVA";
export type GarageMaintenanceStatus = "ABERTA" | "EM_EXECUCAO" | "CONCLUIDA";
export type GarageFineStatus = "PENDENTE" | "INDICADO" | "PAGA" | "RECORRIDA";
export type GarageDocumentType = "CRLV" | "IPVA" | "SEGURO" | "VISTORIA";
export type GarageDocumentStatus = "PENDENTE" | "PAGO" | "ISENTO";

export type VehicleRecord = {
  id: string;
  name: string;
  plate: string;
  brand?: string;
  model: string;
  year?: number;
  fuelType?: GarageFuelType;
  odometerKm: number;
  status?: GarageVehicleStatus;
  assignedDriverId?: string;
  renavam?: string;
  stateUf?: string;
  tankCapacityLiters?: number;
  fipeValue?: number;
  monthlyFixedCost?: number;
  notes?: string;
};

export type GarageDriver = {
  id: string;
  name: string;
  cnhNumber: string;
  cnhCategory: string;
  cnhExpiry: string;
  phone?: string;
  allowedVehicleIds: string[];
  active: boolean;
};

export type GarageFueling = {
  id: string;
  vehicleId: string;
  driverId?: string;
  date: string;
  odometer: number;
  fuelType: GarageFuelType;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  fullTank: boolean;
  stationName?: string;
  calculatedAvg?: number;
  nfceKey?: string;
  notes?: string;
};

export type GarageMaintenance = {
  id: string;
  vehicleId: string;
  driverId?: string;
  type: GarageMaintenanceType;
  status: GarageMaintenanceStatus;
  originChecklistId?: string;
  date: string;
  odometer: number;
  category: string;
  providerName?: string;
  partsCost: number;
  laborCost: number;
  totalCost: number;
  notes?: string;
};

export type GarageExpense = {
  id: string;
  vehicleId: string;
  driverId?: string;
  category: string;
  date: string;
  amount: number;
  description?: string;
};

export type GarageFine = {
  id: string;
  vehicleId: string;
  driverId?: string;
  date: string;
  time?: string;
  infractionCode: string;
  description: string;
  location?: string;
  points: number;
  amount: number;
  sneDiscountApplied: boolean;
  driverIndicationDeadline?: string;
  status: GarageFineStatus;
};

export type GarageDocument = {
  id: string;
  vehicleId: string;
  docType: GarageDocumentType;
  referenceYear: number;
  dueDate: string;
  amount: number;
  stateUf?: string;
  providerOrAuthority?: string;
  policyOrCode?: string;
  status: GarageDocumentStatus;
  paidAt?: string;
  autoGenerated?: boolean;
  notes?: string;
};

export type GarageChecklistItem = {
  id: string;
  label: string;
  compliant: boolean;
  note?: string;
};

export type GarageChecklist = {
  id: string;
  vehicleId: string;
  driverId?: string;
  date: string;
  odometer: number;
  items: GarageChecklistItem[];
  hasIssues: boolean;
  generatedMaintenanceId?: string;
  generalNotes?: string;
};

export type GarageRoute = {
  id: string;
  vehicleId: string;
  driverId?: string;
  date: string;
  origin: string;
  destination: string;
  startOdometer: number;
  endOdometer: number;
  distanceKm: number;
  estimatedKm?: number;
  purpose?: string;
};

export type GarageReminder = {
  id: string;
  vehicleId: string;
  title: string;
  category: "MANUTENCAO" | "DOCUMENTACAO" | "SEGURO" | "OUTRO";
  dueDate?: string;
  dueOdometer?: number;
  completed: boolean;
  completedAt?: string;
  notes?: string;
};

export type FuelLog = {
  id: string;
  vehicleId: string;
  date: string;
  liters: number;
  totalCents: number;
  odometerKm: number;
  fuelType: "Gasolina" | "Etanol" | "Diesel";
};

export type TripPlan = {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  budgetCents: number;
  spentCents: number;
  notes: string;
  status: "Planejada" | "Em curso" | "Concluída";
};

export type UserProfile = {
  name: string;
  email: string;
  photoUrl: string;
  city: string;
  state: string;
  selectedLogoId: BrandLogoId;
};

export type OrionState = {
  profile: UserProfile;
  pixRecipient: PixRecipient;
  banks: BankAccount[];
  cards: CreditCardAccount[];
  cardMonthSnapshots: CardMonthSnapshot[];
  transactions: WalletTransaction[];
  revenueSources: RevenueSource[];
  revenueContracts: RevenueContract[];
  revenueEntries: RevenueEntry[];
  revenueEvents: RevenueEvent[];
  annualYears: AnnualYearRecord[];
  annualExpenses: AnnualExpenseRow[];
  monthlyBills: MonthlyBill[];
  paymentEvents: PaymentEvent[];
  payableContracts: PayableContract[];
  payableInstallments: PayableInstallment[];
  personalAgenda: PersonalAgendaRecord[];
  agendaChecks: AgendaCheckState;
  agendaOverrides: AgendaEventOverride[];
  contactCategories: ContactCategory[];
  contactSubcategories: ContactSubcategory[];
  agendaContacts: AgendaContact[];
  agendaAlarms: AgendaAlarm[];
  agendaNotes: AgendaNote[];
  calculatorHistory: CalculatorHistoryEntry[];
  agendaSettings: AgendaSettings;
  shoppingList: ShoppingItem[];
  vehicles: VehicleRecord[];
  garageDrivers: GarageDriver[];
  garageFuelings: GarageFueling[];
  garageMaintenances: GarageMaintenance[];
  garageExpenses: GarageExpense[];
  garageFines: GarageFine[];
  garageDocuments: GarageDocument[];
  garageChecklists: GarageChecklist[];
  garageRoutes: GarageRoute[];
  garageReminders: GarageReminder[];
  fuelLogs: FuelLog[];
  trips: TripPlan[];
  fiscalReceipts: FiscalReceipt[];
  watchlistTickers: string[];
};

export function createEmptyOrionState(
  identity?: Partial<Pick<UserProfile, "name" | "email" | "photoUrl">>,
): OrionState {
  return {
    profile: {
      name: identity?.name?.trim() || "Usuário",
      email: identity?.email?.trim() || "",
      photoUrl: identity?.photoUrl || "",
      city: "Brasília",
      state: "DF",
      selectedLogoId: "nexo",
    },
    pixRecipient: {
      key: "",
      name: identity?.name?.trim() || "",
      state: "DF",
      city: "Brasília",
    },
    banks: [],
    cards: [],
    cardMonthSnapshots: [],
    transactions: [],
    revenueSources: [],
    revenueContracts: [],
    revenueEntries: [],
    revenueEvents: [],
    annualYears: [],
    annualExpenses: [],
    monthlyBills: [],
    paymentEvents: [],
    payableContracts: [],
    payableInstallments: [],
    personalAgenda: [],
    agendaChecks: {},
    agendaOverrides: [],
    contactCategories: [],
    contactSubcategories: [],
    agendaContacts: [],
    agendaAlarms: [],
    agendaNotes: [],
    calculatorHistory: [],
    agendaSettings: createDefaultAgendaSettings(),
    shoppingList: [],
    vehicles: [],
    garageDrivers: [],
    garageFuelings: [],
    garageMaintenances: [],
    garageExpenses: [],
    garageFines: [],
    garageDocuments: [],
    garageChecklists: [],
    garageRoutes: [],
    garageReminders: [],
    fuelLogs: [],
    trips: [],
    fiscalReceipts: [],
    watchlistTickers: [],
  };
}
