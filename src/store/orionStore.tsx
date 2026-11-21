import { useEffect, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { auth, db, storage, googleProvider, handleFirestoreError, OperationType } from "@/lib/firebase";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import {
  OrionContext,
  type OrionContextValue,
} from "@/store/orionContext";
import {
  buildArchiveFolderPath,
  classifyArchiveCategory,
  extractAccessKey,
  normalizeProduct,
  suggestReceiptKind,
  type FiscalReceipt,
} from "@/lib/receiptAnalysis";
import {
  createDefaultAgendaSettings,
  createEmptyOrionState,
  type AgendaAlarm,
  type AgendaChecklistEntry,
  type AgendaContact,
  type AgendaEventOverride,
  type AgendaNote,
  type AgendaSettings,
  type AnnualCellState,
  type AnnualExpenseKind,
  type AnnualExpenseRow,
  type AnnualExpenseSource,
  type AnnualYearRecord,
  type BankAccount,
  type BrandLogoId,
  type CalculatorHistoryEntry,
  type CardMonthSnapshot,
  type CardMonthSnapshotTransaction,
  type ContactCategory,
  type ContactPhone,
  type ContactSubcategory,
  type CreditCardAccount,
  type FuelLog,
  type GarageChecklist,
  type GarageDocument,
  type GarageDriver,
  type GarageExpense,
  type GarageFine,
  type GarageFueling,
  type GarageMaintenance,
  type GarageReminder,
  type GarageRoute,
  type MonthlyBill,
  type OrionState,
  type PayableContract,
  type PayableInstallment,
  type PaymentAttachmentRef,
  type PaymentEvent,
  type PaymentEventKind,
  type PaymentEventSnapshot,
  type PersonalAgendaRecord,
  type PixRecipient,
  type RevenueContract,
  type RevenueEntry,
  type RevenueEvent,
  type RevenueEventSnapshot,
  type RevenueSource,
  type ShoppingItem,
  type ShoppingStoreGroup,
  type TripPlan,
  type VehicleRecord,
  type WalletTransaction,
} from "@/types/orion";
import type { PlannedDocWrite } from "@/lib/domain/orionImporter";
import {
  buildYearSnapshotPayload,
  collectAllExpenseYears,
} from "@/lib/domain/expenseAnalytics";
import { derivedContractStatus } from "@/lib/domain/contracts";
import { resolveActivePaymentEvents, resolveActiveRevenueEvents, validIsoDate } from "@/lib/domain/ledgerHistory";
import { clampDueDate, todayBR } from "@/lib/domain/money";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function clampStr(value: unknown, max: number, fallback = ""): string {
  const s = typeof value === "string" ? value.trim() : fallback;
  return s.slice(0, max);
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
}

function sanitizeAttachments(list?: PaymentAttachmentRef[] | unknown): PaymentAttachmentRef[] {
  if (!Array.isArray(list)) return [];
  const out: PaymentAttachmentRef[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<PaymentAttachmentRef>;
    const id = clampStr(item.id || item.storagePath || item.fileName || uid("att"), 128);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(
      stripUndefined({
        id,
        fileName: clampStr(item.fileName || "comprovante", 160),
        mimeType: clampStr(item.mimeType || "application/octet-stream", 80),
        sizeBytes: typeof item.sizeBytes === "number" && item.sizeBytes >= 0 ? Math.trunc(item.sizeBytes) : undefined,
        storagePath: item.storagePath ? clampStr(item.storagePath, 400) : undefined,
        documentUrl: item.documentUrl ? clampStr(item.documentUrl, 1000) : undefined,
        uploadedAt: clampStr(item.uploadedAt || new Date().toISOString(), 40),
      }) as unknown as PaymentAttachmentRef,
    );
    if (out.length >= 20) break;
  }
  return out;
}

const VALID_LOGOS: BrandLogoId[] = ["nexo", "apice", "prisma", "vortice", "orbita"];

const SUBCOLLECTIONS = [
  "banks",
  "cards",
  "cardMonthSnapshots",
  "transactions",
  "revenueSources",
  "revenueContracts",
  "revenueEntries",
  "revenueEvents",
  "annualYears",
  "annualExpenses",
  "monthlyBills",
  "paymentEvents",
  "payableContracts",
  "payableInstallments",
  "personalAgenda",
  "agendaChecks",
  "agendaOverrides",
  "contactCategories",
  "contactSubcategories",
  "agendaContacts",
  "agendaAlarms",
  "agendaNotes",
  "calculatorHistory",
  "agendaSettings",
  "shoppingList",
  "vehicles",
  "garageDrivers",
  "garageFuelings",
  "garageMaintenances",
  "garageExpenses",
  "garageFines",
  "garageDocuments",
  "garageChecklists",
  "garageRoutes",
  "garageReminders",
  "fuelLogs",
  "trips",
  "fiscalReceipts",
] as const;

const CONFLICT_MUTABLE_KEYS: Record<PlannedDocWrite<{ id: string }>["collectionName"], string[]> = {
  annualYears: [
    "sourceName",
    "archivedAt",
    "totalExpenseCents",
    "categoryTotalsCents",
    "monthlyCategoryCents",
    "snapshotUpdatedAt",
    "sourceRecordId",
  ],
  payableContracts: [
    "name",
    "description",
    "sourceSheet",
    "detailsJson",
    "archivedAt",
    "contractCreatedAt",
    "sourceRecordId",
  ],
  annualExpenses: [
    "year",
    "creditor",
    "category",
    "dueDay",
    "months",
    "expenseKind",
    "expenseSource",
    "annualTaxKind",
    "consumptionValueType",
    "position",
    "sourceContractId",
    "sourceTemplateId",
    "sourceRecordId",
  ],
  cards: [
    "institution",
    "name",
    "brand",
    "number",
    "creditLimitCents",
    "availableCents",
    "closingDay",
    "dueDay",
    "linkedAnnualExpenseId",
    "sourceRecordId",
  ],
  banks: [
    "institution",
    "name",
    "accountType",
    "number",
    "balanceCents",
    "color",
    "sourceRecordId",
  ],
  revenueSources: [
    "title",
    "category",
    "expectedCents",
    "dueDay",
    "recurrence",
    "active",
    "firstDue",
    "details",
    "note",
    "sourceRecordId",
  ],
  revenueContracts: ["note"],
  payableInstallments: [
    "number",
    "dueDate",
    "expectedCents",
    "isSettled",
    "paidCents",
    "paidDate",
    "note",
    "accountId",
    "sourceRecordId",
  ],
  monthlyBills: [
    "period",
    "creditor",
    "category",
    "description",
    "dueDate",
    "expectedCents",
    "paidDate",
    "paidCents",
    "isSettled",
    "sourceAnnualId",
    "contractId",
    "installmentNumber",
    "expenseKind",
    "accountId",
    "note",
    "sourceRecordId",
  ],
  revenueEntries: [
    "sourceId",
    "contractId",
    "installmentNumber",
    "title",
    "category",
    "dueDate",
    "expectedCents",
    "receivedDate",
    "receivedCents",
    "agreedCents",
    "adjustmentCents",
    "accountId",
    "note",
    "sourceRecordId",
  ],
  revenueEvents: [
    "entryId",
    "kind",
    "reason",
    "eventCreatedAt",
    "beforeData",
    "afterData",
    "sourceRecordId",
  ],
  cardMonthSnapshots: [
    "accountId",
    "accountName",
    "isUnlinked",
    "period",
    "capturedAt",
    "closingDate",
    "dueDate",
    "invoiceCents",
    "providerInvoiceId",
    "totalLimitCents",
    "availableLimitCents",
    "usedLimitCents",
    "transactions",
    "sourceRecordId",
  ],
  fiscalReceipts: [
    "kind",
    "docType",
    "uf",
    "store",
    "cnpj",
    "emitterAddress",
    "issuedAt",
    "issuedTime",
    "accessKey",
    "number",
    "series",
    "paymentMethod",
    "discountCents",
    "totalCents",
    "items",
    "archiveCategory",
    "folderPath",
    "storagePath",
    "fileName",
    "fileMimeType",
    "fileHash",
    "documentUrl",
    "sourceUrl",
    "linkedTransactionId",
    "processingStatus",
    "processingError",
    "sourceOrigin",
    "lowConfidenceFields",
    "warranty",
    "sourceRecordId",
  ],
};

export function OrionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [state, setState] = useState<OrionState>(() => createEmptyOrionState());
  const inFlightKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setState(createEmptyOrionState());
        setWorkspaceLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !user.emailVerified) return;

    const uidPath = user.uid;
    const userDocPath = `users/${uidPath}`;
    const userRef = doc(db, "users", uidPath);
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    setWorkspaceLoading(true);
    setState(
      createEmptyOrionState({
        name: user.displayName || "Usuário",
        email: user.email || "",
        photoUrl: user.photoURL || "",
      }),
    );

    async function initAndSubscribe() {
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const initialPayload = {
            ownerId: uidPath,
            name: clampStr(user!.displayName || "Usuário", 120) || "Usuário",
            email: clampStr(user!.email || "usuario@gmail.com", 160),
            photoUrl: clampStr(user!.photoURL || "", 500),
            city: "Brasília",
            state: "DF",
            selectedLogoId: "nexo" as BrandLogoId,
            pixRecipient: {
              key: "",
              name: clampStr(user!.displayName || "", 120),
              state: "DF",
              city: "Brasília",
            },
            watchlistTickers: [] as string[],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, initialPayload);
        }
      } catch (err) {
        if (!cancelled) handleFirestoreError(err, OperationType.WRITE, userDocPath);
        return;
      }

      if (cancelled) return;

      unsubs.push(
        onSnapshot(
          userRef,
          (docSnap) => {
            if (!docSnap.exists()) return;
            const d = docSnap.data() as DocumentData;
            const logo = VALID_LOGOS.includes(d["selectedLogoId"] as BrandLogoId)
              ? (d["selectedLogoId"] as BrandLogoId)
              : "nexo";
            const pix = (d["pixRecipient"] as Partial<PixRecipient> | undefined) ?? {};
            setState((prev) => ({
              ...prev,
              profile: {
                name: String(d["name"] ?? user!.displayName ?? "Usuário"),
                email: String(d["email"] ?? user!.email ?? ""),
                photoUrl: String(d["photoUrl"] ?? user!.photoURL ?? ""),
                city: String(d["city"] ?? "Brasília"),
                state: String(d["state"] ?? "DF"),
                selectedLogoId: logo,
              },
              pixRecipient: {
                key: String(pix.key ?? ""),
                name: String(pix.name ?? ""),
                state: String(pix.state ?? "DF"),
                city: String(pix.city ?? "Brasília"),
              },
              watchlistTickers: Array.isArray(d["watchlistTickers"])
                ? (d["watchlistTickers"] as string[])
                : [],
            }));
            setWorkspaceLoading(false);
          },
          (error) => handleFirestoreError(error, OperationType.GET, userDocPath),
        ),
      );

      const listenSub = <T,>(
        subName: (typeof SUBCOLLECTIONS)[number],
        mapDoc: (id: string, data: DocumentData) => T,
        apply: (items: T[]) => void,
      ) => {
        const subPath = `users/${uidPath}/${subName}`;
        const q = query(collection(db, "users", uidPath, subName), where("ownerId", "==", uidPath));
        unsubs.push(
          onSnapshot(
            q,
            (snap) => {
              const items = snap.docs.map((d) => mapDoc(d.id, d.data()));
              apply(items);
            },
            (error) => handleFirestoreError(error, OperationType.LIST, subPath),
          ),
        );
      };

      listenSub<BankAccount>(
        "banks",
        (id, d) => ({
          id,
          institution: String(d["institution"] ?? ""),
          name: String(d["name"] ?? ""),
          accountType: d["accountType"] === "SAVINGS" ? "SAVINGS" : "CHECKING",
          number: String(d["number"] ?? ""),
          balanceCents: Number(d["balanceCents"] ?? 0),
          color: String(d["color"] ?? "#173d4a"),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (banks) => setState((prev) => ({ ...prev, banks })),
      );

      listenSub<CreditCardAccount>(
        "cards",
        (id, d) => ({
          id,
          institution: String(d["institution"] ?? ""),
          name: String(d["name"] ?? ""),
          brand: (d["brand"] as CreditCardAccount["brand"]) ?? "OTHER",
          number: String(d["number"] ?? ""),
          creditLimitCents: Number(d["creditLimitCents"] ?? 0),
          availableCents: Number(d["availableCents"] ?? 0),
          closingDay: Number(d["closingDay"] ?? 15),
          dueDay: Number(d["dueDay"] ?? 25),
          ...(typeof d["manualLimitCents"] === "number" ? { manualLimitCents: d["manualLimitCents"] } : {}),
          ...(typeof d["manualUsedCents"] === "number" ? { manualUsedCents: d["manualUsedCents"] } : {}),
          ...(typeof d["linkedAnnualExpenseId"] === "string"
            ? { linkedAnnualExpenseId: d["linkedAnnualExpenseId"] }
            : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (cards) => setState((prev) => ({ ...prev, cards })),
      );

      listenSub<CardMonthSnapshot>(
        "cardMonthSnapshots",
        (id, d) => ({
          id,
          accountId: String(d["accountId"] ?? ""),
          ...(typeof d["accountName"] === "string" ? { accountName: d["accountName"] } : {}),
          ...(typeof d["isUnlinked"] === "boolean" ? { isUnlinked: d["isUnlinked"] } : {}),
          period: String(d["period"] ?? ""),
          capturedAt: String(d["capturedAt"] ?? ""),
          closingDate: typeof d["closingDate"] === "string" ? d["closingDate"] : null,
          dueDate: typeof d["dueDate"] === "string" ? d["dueDate"] : null,
          invoiceCents: typeof d["invoiceCents"] === "number" ? d["invoiceCents"] : null,
          providerInvoiceId:
            typeof d["providerInvoiceId"] === "string" ? d["providerInvoiceId"] : null,
          totalLimitCents:
            typeof d["totalLimitCents"] === "number" ? d["totalLimitCents"] : null,
          availableLimitCents:
            typeof d["availableLimitCents"] === "number" ? d["availableLimitCents"] : null,
          usedLimitCents: typeof d["usedLimitCents"] === "number" ? d["usedLimitCents"] : null,
          transactions: Array.isArray(d["transactions"])
            ? (d["transactions"] as CardMonthSnapshotTransaction[])
            : [],
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (cardMonthSnapshots) =>
          setState((prev) => ({
            ...prev,
            cardMonthSnapshots: [...cardMonthSnapshots].sort((a, b) =>
              b.period.localeCompare(a.period),
            ),
          })),
      );

      listenSub<WalletTransaction>(
        "transactions",
        (id, d) => ({
          id,
          accountId: String(d["accountId"] ?? ""),
          accountType: d["accountType"] === "CREDIT" ? "CREDIT" : "BANK",
          accountName: String(d["accountName"] ?? ""),
          institution: String(d["institution"] ?? ""),
          description: String(d["description"] ?? ""),
          amountCents: Number(d["amountCents"] ?? 0),
          date: String(d["date"] ?? ""),
          category: String(d["category"] ?? ""),
          ...(typeof d["reconciledEventId"] === "string" || d["reconciledEventId"] === null
            ? { reconciledEventId: d["reconciledEventId"] as string | null }
            : {}),
        }),
        (transactions) =>
          setState((prev) => ({
            ...prev,
            transactions: [...transactions].sort((a, b) => b.date.localeCompare(a.date)),
          })),
      );

      listenSub<RevenueSource>(
        "revenueSources",
        (id, d) => ({
          id,
          title: String(d["title"] ?? ""),
          category: String(d["category"] ?? ""),
          expectedCents: Number(d["expectedCents"] ?? 0),
          dueDay: Number(d["dueDay"] ?? 10),
          recurrence: d["recurrence"] === "single" ? "single" : "monthly",
          active: Boolean(d["active"] ?? true),
          ...(typeof d["firstDue"] === "string" ? { firstDue: d["firstDue"] } : {}),
          ...(typeof d["details"] === "string" ? { details: d["details"] } : {}),
          ...(typeof d["note"] === "string" ? { note: d["note"] } : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (revenueSources) => setState((prev) => ({ ...prev, revenueSources })),
      );

      listenSub<RevenueContract>(
        "revenueContracts",
        (id, d) => ({
          id,
          title: String(d["title"] ?? ""),
          buyer: String(d["buyer"] ?? ""),
          cpf: String(d["cpf"] ?? ""),
          phone: String(d["phone"] ?? ""),
          email: String(d["email"] ?? ""),
          city: String(d["city"] ?? ""),
          state: String(d["state"] ?? ""),
          address: String(d["address"] ?? ""),
          postalCode: String(d["postalCode"] ?? ""),
          totalCents: Number(d["totalCents"] ?? 0),
          downPaymentCents: Number(d["downPaymentCents"] ?? 0),
          interestPercent: Number(d["interestPercent"] ?? 0),
          finePercent: Number(d["finePercent"] ?? 0),
          correctionIndex: (d["correctionIndex"] as RevenueContract["correctionIndex"]) ?? "Sem correção",
          ...(typeof d["customRatePercent"] === "number"
            ? { customRatePercent: d["customRatePercent"] }
            : {}),
          status: (d["status"] as RevenueContract["status"]) ?? "Em andamento",
          createdAt: String(d["contractDate"] ?? ""),
          ...(typeof d["note"] === "string" ? { note: d["note"] } : {}),
        }),
        (revenueContracts) => setState((prev) => ({ ...prev, revenueContracts })),
      );

      listenSub<RevenueEntry>(
        "revenueEntries",
        (id, d) => ({
          id,
          ...(typeof d["sourceId"] === "string" ? { sourceId: d["sourceId"] } : {}),
          ...(typeof d["contractId"] === "string" ? { contractId: d["contractId"] } : {}),
          ...(typeof d["installmentNumber"] === "number"
            ? { installmentNumber: d["installmentNumber"] }
            : {}),
          title: String(d["title"] ?? ""),
          category: String(d["category"] ?? ""),
          dueDate: String(d["dueDate"] ?? ""),
          expectedCents: Number(d["expectedCents"] ?? 0),
          receivedDate: typeof d["receivedDate"] === "string" ? d["receivedDate"] : null,
          receivedCents: typeof d["receivedCents"] === "number" ? d["receivedCents"] : null,
          ...(typeof d["agreedCents"] === "number" ? { agreedCents: d["agreedCents"] } : {}),
          ...(typeof d["adjustmentCents"] === "number" || d["adjustmentCents"] === null
            ? { adjustmentCents: d["adjustmentCents"] as number | null }
            : {}),
          ...(typeof d["discountCents"] === "number" || d["discountCents"] === null
            ? { discountCents: d["discountCents"] as number | null }
            : {}),
          ...(typeof d["surchargeCents"] === "number" || d["surchargeCents"] === null
            ? { surchargeCents: d["surchargeCents"] as number | null }
            : {}),
          ...(typeof d["accountId"] === "string" || d["accountId"] === null
            ? { accountId: d["accountId"] as string | null }
            : {}),
          ...(typeof d["bankTransactionId"] === "string" || d["bankTransactionId"] === null
            ? { bankTransactionId: d["bankTransactionId"] as string | null }
            : {}),
          ...(Array.isArray(d["attachments"])
            ? { attachments: d["attachments"] as PaymentAttachmentRef[] }
            : {}),
          ...(typeof d["note"] === "string" ? { note: d["note"] } : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (revenueEntries) => setState((prev) => ({ ...prev, revenueEntries })),
      );

      listenSub<RevenueEvent>(
        "revenueEvents",
        (id, d) => ({
          id,
          entryId: String(d["entryId"] ?? ""),
          kind: String(d["kind"] ?? ""),
          reason: String(d["reason"] ?? ""),
          eventCreatedAt: String(d["eventCreatedAt"] ?? ""),
          ...(typeof d["accountId"] === "string" || d["accountId"] === null
            ? { accountId: d["accountId"] as string | null }
            : {}),
          ...(typeof d["bankTransactionId"] === "string" || d["bankTransactionId"] === null
            ? { bankTransactionId: d["bankTransactionId"] as string | null }
            : {}),
          ...(typeof d["targetEventId"] === "string" || d["targetEventId"] === null
            ? { targetEventId: d["targetEventId"] as string | null }
            : {}),
          ...(typeof d["idempotencyKey"] === "string"
            ? { idempotencyKey: d["idempotencyKey"] }
            : {}),
          beforeData: (d["beforeData"] as RevenueEventSnapshot | null) ?? null,
          afterData: (d["afterData"] as RevenueEventSnapshot | null) ?? null,
          ...(Array.isArray(d["attachments"])
            ? { attachments: d["attachments"] as PaymentAttachmentRef[] }
            : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (revenueEvents) =>
          setState((prev) => ({
            ...prev,
            revenueEvents: [...revenueEvents].sort((a, b) =>
              b.eventCreatedAt.localeCompare(a.eventCreatedAt),
            ),
          })),
      );

      listenSub<AnnualYearRecord>(
        "annualYears",
        (id, d) => ({
          id,
          year: Number(d["year"] ?? 2026),
          ...(typeof d["sourceName"] === "string" ? { sourceName: d["sourceName"] } : {}),
          archivedAt: typeof d["archivedAt"] === "string" ? d["archivedAt"] : null,
          ...(typeof d["totalExpenseCents"] === "number"
            ? { totalExpenseCents: d["totalExpenseCents"] }
            : {}),
          ...(d["categoryTotalsCents"] && typeof d["categoryTotalsCents"] === "object"
            ? { categoryTotalsCents: d["categoryTotalsCents"] as Record<string, number> }
            : {}),
          ...(d["monthlyCategoryCents"] && typeof d["monthlyCategoryCents"] === "object"
            ? {
                monthlyCategoryCents: d["monthlyCategoryCents"] as Record<
                  string,
                  Record<string, number>
                >,
              }
            : {}),
          ...(typeof d["snapshotUpdatedAt"] === "string"
            ? { snapshotUpdatedAt: d["snapshotUpdatedAt"] }
            : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (annualYears) =>
          setState((prev) => ({
            ...prev,
            annualYears: [...annualYears].sort((a, b) => a.year - b.year),
          })),
      );

      listenSub<AnnualExpenseRow>(
        "annualExpenses",
        (id, d) => ({
          id,
          year: Number(d["year"] ?? 2026),
          creditor: String(d["creditor"] ?? ""),
          category: String(d["category"] ?? ""),
          dueDay: Number(d["dueDay"] ?? 10),
          months: (d["months"] as Record<string, AnnualCellState>) ?? {},
          ...(d["expenseKind"] === "consumption" || d["expenseKind"] === "debt"
            ? { expenseKind: d["expenseKind"] as AnnualExpenseKind }
            : {}),
          ...(d["expenseSource"] === "consumption" ||
          d["expenseSource"] === "contract" ||
          d["expenseSource"] === "card" ||
          d["expenseSource"] === "annual_tax"
            ? { expenseSource: d["expenseSource"] as AnnualExpenseSource }
            : {}),
          ...(typeof d["annualTaxKind"] === "string" || d["annualTaxKind"] === null
            ? { annualTaxKind: d["annualTaxKind"] as string | null }
            : {}),
          ...(typeof d["consumptionValueType"] === "string" || d["consumptionValueType"] === null
            ? { consumptionValueType: d["consumptionValueType"] as string | null }
            : {}),
          ...(typeof d["position"] === "number" ? { position: d["position"] } : {}),
          ...(typeof d["sourceContractId"] === "string" || d["sourceContractId"] === null
            ? { sourceContractId: d["sourceContractId"] as string | null }
            : {}),
          ...(typeof d["sourceTemplateId"] === "string" || d["sourceTemplateId"] === null
            ? { sourceTemplateId: d["sourceTemplateId"] as string | null }
            : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (annualExpenses) =>
          setState((prev) => ({
            ...prev,
            annualExpenses: [...annualExpenses].sort(
              (a, b) => (a.position ?? 999) - (b.position ?? 999) || a.creditor.localeCompare(b.creditor),
            ),
          })),
      );

      listenSub<MonthlyBill>(
        "monthlyBills",
        (id, d) => ({
          id,
          period: String(d["period"] ?? ""),
          creditor: String(d["creditor"] ?? ""),
          category: String(d["category"] ?? ""),
          ...(typeof d["description"] === "string" ? { description: d["description"] } : {}),
          dueDate: String(d["dueDate"] ?? ""),
          expectedCents: Number(d["expectedCents"] ?? 0),
          paidDate: typeof d["paidDate"] === "string" ? d["paidDate"] : null,
          paidCents: typeof d["paidCents"] === "number" ? d["paidCents"] : null,
          isSettled: Boolean(d["isSettled"]),
          ...(typeof d["sourceAnnualId"] === "string" ? { sourceAnnualId: d["sourceAnnualId"] } : {}),
          ...(typeof d["contractId"] === "string" || d["contractId"] === null
            ? { contractId: d["contractId"] as string | null }
            : {}),
          ...(typeof d["installmentNumber"] === "number" || d["installmentNumber"] === null
            ? { installmentNumber: d["installmentNumber"] as number | null }
            : {}),
          ...(d["expenseKind"] === "consumption" || d["expenseKind"] === "debt"
            ? { expenseKind: d["expenseKind"] as AnnualExpenseKind }
            : {}),
          ...(typeof d["accountId"] === "string" || d["accountId"] === null
            ? { accountId: d["accountId"] as string | null }
            : {}),
          ...(typeof d["bankTransactionId"] === "string" || d["bankTransactionId"] === null
            ? { bankTransactionId: d["bankTransactionId"] as string | null }
            : {}),
          ...(typeof d["discountCents"] === "number" || d["discountCents"] === null
            ? { discountCents: d["discountCents"] as number | null }
            : {}),
          ...(typeof d["surchargeCents"] === "number" || d["surchargeCents"] === null
            ? { surchargeCents: d["surchargeCents"] as number | null }
            : {}),
          ...(Array.isArray(d["attachments"])
            ? { attachments: d["attachments"] as PaymentAttachmentRef[] }
            : {}),
          ...(typeof d["isCardInvoice"] === "boolean" ? { isCardInvoice: d["isCardInvoice"] } : {}),
          ...(typeof d["cardId"] === "string" || d["cardId"] === null
            ? { cardId: d["cardId"] as string | null }
            : {}),
          ...(typeof d["note"] === "string" ? { note: d["note"] } : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (monthlyBills) => setState((prev) => ({ ...prev, monthlyBills })),
      );

      listenSub<PaymentEvent>(
        "paymentEvents",
        (id, d) => ({
          id,
          ...(typeof d["billId"] === "string" || d["billId"] === null
            ? { billId: d["billId"] as string | null }
            : {}),
          ...(typeof d["installmentId"] === "string" || d["installmentId"] === null
            ? { installmentId: d["installmentId"] as string | null }
            : {}),
          ...(typeof d["contractId"] === "string" || d["contractId"] === null
            ? { contractId: d["contractId"] as string | null }
            : {}),
          ...(typeof d["annualRowId"] === "string" || d["annualRowId"] === null
            ? { annualRowId: d["annualRowId"] as string | null }
            : {}),
          ...(typeof d["period"] === "string" || d["period"] === null
            ? { period: d["period"] as string | null }
            : {}),
          ...(typeof d["cardId"] === "string" || d["cardId"] === null
            ? { cardId: d["cardId"] as string | null }
            : {}),
          creditor: String(d["creditor"] ?? ""),
          ...(typeof d["category"] === "string" ? { category: d["category"] } : {}),
          dueDate: String(d["dueDate"] ?? ""),
          expectedCents: Number(d["expectedCents"] ?? 0),
          paidCents: Number(d["paidCents"] ?? 0),
          paidDate: typeof d["paidDate"] === "string" ? d["paidDate"] : null,
          ...(typeof d["discountCents"] === "number" || d["discountCents"] === null
            ? { discountCents: d["discountCents"] as number | null }
            : {}),
          ...(typeof d["surchargeCents"] === "number" || d["surchargeCents"] === null
            ? { surchargeCents: d["surchargeCents"] as number | null }
            : {}),
          isSettled: Boolean(d["isSettled"]),
          ...(typeof d["accountId"] === "string" || d["accountId"] === null
            ? { accountId: d["accountId"] as string | null }
            : {}),
          ...(typeof d["bankTransactionId"] === "string" || d["bankTransactionId"] === null
            ? { bankTransactionId: d["bankTransactionId"] as string | null }
            : {}),
          ...(typeof d["targetEventId"] === "string" || d["targetEventId"] === null
            ? { targetEventId: d["targetEventId"] as string | null }
            : {}),
          ...(typeof d["idempotencyKey"] === "string"
            ? { idempotencyKey: d["idempotencyKey"] }
            : {}),
          kind: (d["kind"] as PaymentEventKind) ?? "pagamento",
          reason: String(d["reason"] ?? ""),
          eventCreatedAt: String(d["eventCreatedAt"] ?? ""),
          beforeData: (d["beforeData"] as PaymentEventSnapshot | null) ?? null,
          afterData: (d["afterData"] as PaymentEventSnapshot | null) ?? null,
          ...(Array.isArray(d["attachments"])
            ? { attachments: d["attachments"] as PaymentAttachmentRef[] }
            : {}),
          ...(typeof d["note"] === "string" ? { note: d["note"] } : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (paymentEvents) =>
          setState((prev) => ({
            ...prev,
            paymentEvents: [...paymentEvents].sort((a, b) =>
              b.eventCreatedAt.localeCompare(a.eventCreatedAt),
            ),
          })),
      );

      listenSub<PayableContract>(
        "payableContracts",
        (id, d) => ({
          id,
          name: String(d["name"] ?? ""),
          description: String(d["description"] ?? ""),
          ...(typeof d["sourceSheet"] === "string" ? { sourceSheet: d["sourceSheet"] } : {}),
          ...(d["detailsJson"] && typeof d["detailsJson"] === "object"
            ? { detailsJson: d["detailsJson"] as PayableContract["detailsJson"] }
            : {}),
          archivedAt: typeof d["archivedAt"] === "string" ? d["archivedAt"] : null,
          ...(typeof d["contractCreatedAt"] === "string"
            ? { contractCreatedAt: d["contractCreatedAt"] }
            : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (payableContracts) => setState((prev) => ({ ...prev, payableContracts })),
      );

      listenSub<PayableInstallment>(
        "payableInstallments",
        (id, d) => ({
          id,
          contractId: String(d["contractId"] ?? ""),
          number: Number(d["number"] ?? 1),
          dueDate: String(d["dueDate"] ?? ""),
          expectedCents: Number(d["expectedCents"] ?? 0),
          isSettled: Boolean(d["isSettled"]),
          paidCents: typeof d["paidCents"] === "number" ? d["paidCents"] : null,
          paidDate: typeof d["paidDate"] === "string" ? d["paidDate"] : null,
          ...(typeof d["note"] === "string" || d["note"] === null
            ? { note: d["note"] as string | null }
            : {}),
          ...(typeof d["accountId"] === "string" || d["accountId"] === null
            ? { accountId: d["accountId"] as string | null }
            : {}),
          ...(typeof d["bankTransactionId"] === "string" || d["bankTransactionId"] === null
            ? { bankTransactionId: d["bankTransactionId"] as string | null }
            : {}),
          ...(typeof d["discountCents"] === "number" || d["discountCents"] === null
            ? { discountCents: d["discountCents"] as number | null }
            : {}),
          ...(typeof d["surchargeCents"] === "number" || d["surchargeCents"] === null
            ? { surchargeCents: d["surchargeCents"] as number | null }
            : {}),
          ...(Array.isArray(d["attachments"])
            ? { attachments: d["attachments"] as PaymentAttachmentRef[] }
            : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (payableInstallments) =>
          setState((prev) => ({
            ...prev,
            payableInstallments: [...payableInstallments].sort(
              (a, b) => a.number - b.number || a.dueDate.localeCompare(b.dueDate),
            ),
          })),
      );

      listenSub<PersonalAgendaRecord>(
        "personalAgenda",
        (id, d) => ({
          id,
          kind: (d["kind"] as PersonalAgendaRecord["kind"]) ?? "appointment",
          title: String(d["title"] ?? ""),
          startDate: String(d["startDate"] ?? ""),
          time: String(d["time"] ?? ""),
          ...(typeof d["endTime"] === "string" ? { endTime: d["endTime"] } : {}),
          ...(typeof d["breakRule"] === "string" ? { breakRule: d["breakRule"] } : {}),
          ...(typeof d["company"] === "string" ? { company: d["company"] } : {}),
          description: String(d["description"] ?? ""),
          recurrence: (d["recurrence"] as PersonalAgendaRecord["recurrence"]) ?? "none",
          ...(Array.isArray(d["customDates"])
            ? { customDates: d["customDates"].map((x) => String(x)) }
            : {}),
          favorite: Boolean(d["favorite"]),
          reminder: Boolean(d["reminder"]),
          ...(typeof d["reminderMinutesBefore"] === "number"
            ? { reminderMinutesBefore: d["reminderMinutesBefore"] }
            : {}),
          ...(typeof d["completed"] === "boolean" ? { completed: d["completed"] } : {}),
          ...(typeof d["completedAt"] === "string" ? { completedAt: d["completedAt"] } : {}),
          ...(typeof d["linkedNoteId"] === "string" ? { linkedNoteId: d["linkedNoteId"] } : {}),
          ...(typeof d["linkedContactId"] === "string"
            ? { linkedContactId: d["linkedContactId"] }
            : {}),
          ...(typeof d["color"] === "string" ? { color: d["color"] } : {}),
          items: Array.isArray(d["items"]) ? (d["items"] as PersonalAgendaRecord["items"]) : [],
        }),
        (personalAgenda) => setState((prev) => ({ ...prev, personalAgenda })),
      );

      listenSub<{ checkKey: string; done: boolean }>(
        "agendaChecks",
        (_id, d) => ({
          checkKey: String(d["checkKey"] ?? ""),
          done: Boolean(d["done"]),
        }),
        (list) => {
          const agendaChecks: Record<string, boolean> = {};
          for (const item of list) {
            if (item.checkKey) agendaChecks[item.checkKey] = item.done;
          }
          setState((prev) => ({ ...prev, agendaChecks }));
        },
      );

      listenSub<AgendaEventOverride>(
        "agendaOverrides",
        (id, d) => ({
          id,
          sourceType: (d["sourceType"] as AgendaEventOverride["sourceType"]) ?? "personal",
          sourceId: String(d["sourceId"] ?? ""),
          occurrenceDate: String(d["occurrenceDate"] ?? ""),
          action: (d["action"] as AgendaEventOverride["action"]) ?? "modified",
          ...(typeof d["postponedToDate"] === "string" ? { postponedToDate: d["postponedToDate"] } : {}),
          ...(typeof d["postponedToTime"] === "string" ? { postponedToTime: d["postponedToTime"] } : {}),
          ...(typeof d["overrideTitle"] === "string" ? { overrideTitle: d["overrideTitle"] } : {}),
          ...(typeof d["overrideTime"] === "string" ? { overrideTime: d["overrideTime"] } : {}),
          ...(typeof d["overrideEndTime"] === "string" ? { overrideEndTime: d["overrideEndTime"] } : {}),
          ...(typeof d["overrideBreakRule"] === "string" ? { overrideBreakRule: d["overrideBreakRule"] } : {}),
          ...(typeof d["overrideCompany"] === "string" ? { overrideCompany: d["overrideCompany"] } : {}),
          ...(typeof d["overrideDescription"] === "string"
            ? { overrideDescription: d["overrideDescription"] }
            : {}),
          ...(typeof d["note"] === "string" ? { note: d["note"] } : {}),
          updatedAtIso: String(d["updatedAtIso"] ?? ""),
        }),
        (agendaOverrides) => setState((prev) => ({ ...prev, agendaOverrides })),
      );

      listenSub<ContactCategory>(
        "contactCategories",
        (id, d) => ({
          id,
          name: String(d["name"] ?? ""),
          color: String(d["color"] ?? "#173d4a"),
          isCommercial: Boolean(d["isCommercial"]),
          order: Number(d["order"] ?? 0),
        }),
        (contactCategories) =>
          setState((prev) => ({
            ...prev,
            contactCategories: [...contactCategories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
          })),
      );

      listenSub<ContactSubcategory>(
        "contactSubcategories",
        (id, d) => ({
          id,
          categoryId: String(d["categoryId"] ?? ""),
          name: String(d["name"] ?? ""),
          color: String(d["color"] ?? "#b99555"),
          order: Number(d["order"] ?? 0),
        }),
        (contactSubcategories) =>
          setState((prev) => ({
            ...prev,
            contactSubcategories: [...contactSubcategories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
          })),
      );

      listenSub<AgendaContact>(
        "agendaContacts",
        (id, d) => ({
          id,
          name: String(d["name"] ?? ""),
          ...(typeof d["nickname"] === "string" ? { nickname: d["nickname"] } : {}),
          birthDay: typeof d["birthDay"] === "number" ? d["birthDay"] : null,
          birthMonth: typeof d["birthMonth"] === "number" ? d["birthMonth"] : null,
          birthYear: typeof d["birthYear"] === "number" ? d["birthYear"] : null,
          phones: Array.isArray(d["phones"]) ? (d["phones"] as ContactPhone[]) : [],
          emails: Array.isArray(d["emails"]) ? d["emails"].map((e) => String(e)) : [],
          categoryId: String(d["categoryId"] ?? "cat-familia"),
          ...(typeof d["subcategoryId"] === "string" ? { subcategoryId: d["subcategoryId"] } : {}),
          ...(typeof d["categoryColor"] === "string" ? { categoryColor: d["categoryColor"] } : {}),
          ...(typeof d["subcategoryColor"] === "string" ? { subcategoryColor: d["subcategoryColor"] } : {}),
          ...(typeof d["relationship"] === "string" ? { relationship: d["relationship"] } : {}),
          ...(typeof d["company"] === "string" ? { company: d["company"] } : {}),
          ...(typeof d["profession"] === "string" ? { profession: d["profession"] } : {}),
          ...(typeof d["address"] === "string" ? { address: d["address"] } : {}),
          ...(typeof d["city"] === "string" ? { city: d["city"] } : {}),
          ...(typeof d["state"] === "string" ? { state: d["state"] } : {}),
          ...(typeof d["website"] === "string" ? { website: d["website"] } : {}),
          ...(typeof d["notes"] === "string" ? { notes: d["notes"] } : {}),
          birthdayReminderEnabled: Boolean(d["birthdayReminderEnabled"] ?? true),
          birthdayReminderDaysBefore: Number(d["birthdayReminderDaysBefore"] ?? 1),
          notificationsEnabled: Boolean(d["notificationsEnabled"] ?? true),
        }),
        (agendaContacts) =>
          setState((prev) => ({
            ...prev,
            agendaContacts: [...agendaContacts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
          })),
      );

      listenSub<AgendaAlarm>(
        "agendaAlarms",
        (id, d) => ({
          id,
          name: String(d["name"] ?? "Alarme"),
          time: String(d["time"] ?? "07:00"),
          repeatDays: Array.isArray(d["repeatDays"])
            ? d["repeatDays"].map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
            : [],
          soundEnabled: Boolean(d["soundEnabled"] ?? true),
          soundTone: (d["soundTone"] as AgendaAlarm["soundTone"]) ?? "chime",
          enabled: Boolean(d["enabled"] ?? true),
          snoozeUntilIso: typeof d["snoozeUntilIso"] === "string" ? d["snoozeUntilIso"] : null,
          lastTriggeredKey: typeof d["lastTriggeredKey"] === "string" ? d["lastTriggeredKey"] : null,
        }),
        (agendaAlarms) =>
          setState((prev) => ({
            ...prev,
            agendaAlarms: [...agendaAlarms].sort((a, b) => a.time.localeCompare(b.time)),
          })),
      );

      listenSub<AgendaNote>(
        "agendaNotes",
        (id, d) => ({
          id,
          type: (d["type"] as AgendaNote["type"]) ?? "free",
          title: String(d["title"] ?? "Sem título"),
          color: String(d["color"] ?? "#ffffff"),
          content: String(d["content"] ?? ""),
          checklistItems: Array.isArray(d["checklistItems"])
            ? (d["checklistItems"] as AgendaChecklistEntry[])
            : [],
          stores: Array.isArray(d["stores"]) ? (d["stores"] as ShoppingStoreGroup[]) : [],
          linkedAgendaEventId:
            typeof d["linkedAgendaEventId"] === "string" ? d["linkedAgendaEventId"] : null,
          linkedDate: typeof d["linkedDate"] === "string" ? d["linkedDate"] : null,
          updatedAtIso: String(d["updatedAtIso"] ?? ""),
        }),
        (agendaNotes) =>
          setState((prev) => ({
            ...prev,
            agendaNotes: [...agendaNotes].sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso)),
          })),
      );

      listenSub<CalculatorHistoryEntry>(
        "calculatorHistory",
        (id, d) => ({
          id,
          expression: String(d["expression"] ?? ""),
          result: String(d["result"] ?? "0"),
          mode: d["mode"] === "scientific" ? "scientific" : "normal",
          angleUnit: d["angleUnit"] === "RAD" ? "RAD" : "DEG",
          createdAtIso: String(d["createdAtIso"] ?? ""),
        }),
        (calculatorHistory) =>
          setState((prev) => ({
            ...prev,
            calculatorHistory: [...calculatorHistory].sort((a, b) =>
              b.createdAtIso.localeCompare(a.createdAtIso),
            ),
          })),
      );

      listenSub<AgendaSettings>(
        "agendaSettings",
        (_id, d) => ({
          timeFormat: d["timeFormat"] === "12h" ? "12h" : "24h",
          showSeconds: typeof d["showSeconds"] === "boolean" ? d["showSeconds"] : true,
          defaultSnoozeMinutes: Number(d["defaultSnoozeMinutes"] ?? 5),
          leapYearBirthdayRule: d["leapYearBirthdayRule"] === "mar01" ? "mar01" : "feb28",
          shoppingHighlightColor: String(d["shoppingHighlightColor"] ?? "#fef08a"),
          notificationsEnabled:
            typeof d["notificationsEnabled"] === "boolean" ? d["notificationsEnabled"] : true,
          alarmSoundDefault:
            typeof d["alarmSoundDefault"] === "boolean" ? d["alarmSoundDefault"] : true,
          weatherLocationName: String(d["weatherLocationName"] ?? ""),
          weatherLat: typeof d["weatherLat"] === "number" ? d["weatherLat"] : null,
          weatherLon: typeof d["weatherLon"] === "number" ? d["weatherLon"] : null,
          themeMode: d["themeMode"] === "dark" ? "dark" : "light",
          hiddenDefaultCategoryIds: Array.isArray(d["hiddenDefaultCategoryIds"])
            ? d["hiddenDefaultCategoryIds"].map((s) => String(s))
            : [],
          hiddenDefaultSubcategoryIds: Array.isArray(d["hiddenDefaultSubcategoryIds"])
            ? d["hiddenDefaultSubcategoryIds"].map((s) => String(s))
            : [],
        }),
        (list) =>
          setState((prev) => ({
            ...prev,
            agendaSettings: list[0] ?? createDefaultAgendaSettings(),
          })),
      );

      listenSub<ShoppingItem>(
        "shoppingList",
        (id, d) => ({
          id,
          name: String(d["name"] ?? ""),
          category: String(d["category"] ?? ""),
          quantity: Number(d["quantity"] ?? 1),
          unitPriceCents: Number(d["unitPriceCents"] ?? 0),
          checked: Boolean(d["checked"]),
        }),
        (shoppingList) => setState((prev) => ({ ...prev, shoppingList })),
      );

      listenSub<VehicleRecord>(
        "vehicles",
        (id, d) => ({
          id,
          name: String(d["name"] ?? ""),
          plate: String(d["plate"] ?? ""),
          ...(typeof d["brand"] === "string" ? { brand: d["brand"] } : {}),
          model: String(d["model"] ?? ""),
          ...(typeof d["year"] === "number" ? { year: d["year"] } : {}),
          ...(typeof d["fuelType"] === "string"
            ? { fuelType: d["fuelType"] as VehicleRecord["fuelType"] }
            : {}),
          odometerKm: Number(d["odometerKm"] ?? 0),
          ...(typeof d["status"] === "string"
            ? { status: d["status"] as VehicleRecord["status"] }
            : {}),
          ...(typeof d["assignedDriverId"] === "string"
            ? { assignedDriverId: d["assignedDriverId"] }
            : {}),
          ...(typeof d["renavam"] === "string" ? { renavam: d["renavam"] } : {}),
          ...(typeof d["stateUf"] === "string" ? { stateUf: d["stateUf"] } : {}),
          ...(typeof d["tankCapacityLiters"] === "number"
            ? { tankCapacityLiters: d["tankCapacityLiters"] }
            : {}),
          ...(typeof d["fipeValue"] === "number" ? { fipeValue: d["fipeValue"] } : {}),
          ...(typeof d["monthlyFixedCost"] === "number"
            ? { monthlyFixedCost: d["monthlyFixedCost"] }
            : {}),
          ...(typeof d["notes"] === "string" ? { notes: d["notes"] } : {}),
        }),
        (vehicles) => setState((prev) => ({ ...prev, vehicles })),
      );

      listenSub<GarageDriver>(
        "garageDrivers",
        (id, d) => ({
          id,
          name: String(d["name"] ?? ""),
          cnhNumber: String(d["cnhNumber"] ?? ""),
          cnhCategory: String(d["cnhCategory"] ?? "B"),
          cnhExpiry: String(d["cnhExpiry"] ?? ""),
          ...(typeof d["phone"] === "string" ? { phone: d["phone"] } : {}),
          allowedVehicleIds: Array.isArray(d["allowedVehicleIds"])
            ? (d["allowedVehicleIds"] as string[])
            : [],
          active: Boolean(d["active"]),
        }),
        (garageDrivers) => setState((prev) => ({ ...prev, garageDrivers })),
      );

      listenSub<GarageFueling>(
        "garageFuelings",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          ...(typeof d["driverId"] === "string" ? { driverId: d["driverId"] } : {}),
          date: String(d["date"] ?? ""),
          odometer: Number(d["odometer"] ?? 0),
          fuelType: (d["fuelType"] as GarageFueling["fuelType"]) ?? "GASOLINA",
          quantity: Number(d["quantity"] ?? 0),
          unitPrice: Number(d["unitPrice"] ?? 0),
          totalCost: Number(d["totalCost"] ?? 0),
          fullTank: Boolean(d["fullTank"]),
          ...(typeof d["stationName"] === "string" ? { stationName: d["stationName"] } : {}),
          ...(typeof d["nfceKey"] === "string" ? { nfceKey: d["nfceKey"] } : {}),
          ...(typeof d["notes"] === "string" ? { notes: d["notes"] } : {}),
        }),
        (garageFuelings) => setState((prev) => ({ ...prev, garageFuelings })),
      );

      listenSub<GarageMaintenance>(
        "garageMaintenances",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          ...(typeof d["driverId"] === "string" ? { driverId: d["driverId"] } : {}),
          type: d["type"] === "CORRETIVA" ? "CORRETIVA" : "PREVENTIVA",
          status: (d["status"] as GarageMaintenance["status"]) ?? "ABERTA",
          ...(typeof d["originChecklistId"] === "string"
            ? { originChecklistId: d["originChecklistId"] }
            : {}),
          date: String(d["date"] ?? ""),
          odometer: Number(d["odometer"] ?? 0),
          category: String(d["category"] ?? ""),
          ...(typeof d["providerName"] === "string" ? { providerName: d["providerName"] } : {}),
          partsCost: Number(d["partsCost"] ?? 0),
          laborCost: Number(d["laborCost"] ?? 0),
          totalCost: Number(d["totalCost"] ?? 0),
          ...(typeof d["notes"] === "string" ? { notes: d["notes"] } : {}),
        }),
        (garageMaintenances) =>
          setState((prev) => ({
            ...prev,
            garageMaintenances: [...garageMaintenances].sort((a, b) =>
              b.date.localeCompare(a.date),
            ),
          })),
      );

      listenSub<GarageExpense>(
        "garageExpenses",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          ...(typeof d["driverId"] === "string" ? { driverId: d["driverId"] } : {}),
          category: String(d["category"] ?? ""),
          date: String(d["date"] ?? ""),
          amount: Number(d["amount"] ?? 0),
          ...(typeof d["description"] === "string" ? { description: d["description"] } : {}),
        }),
        (garageExpenses) =>
          setState((prev) => ({
            ...prev,
            garageExpenses: [...garageExpenses].sort((a, b) => b.date.localeCompare(a.date)),
          })),
      );

      listenSub<GarageFine>(
        "garageFines",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          ...(typeof d["driverId"] === "string" ? { driverId: d["driverId"] } : {}),
          date: String(d["date"] ?? ""),
          ...(typeof d["time"] === "string" ? { time: d["time"] } : {}),
          infractionCode: String(d["infractionCode"] ?? ""),
          description: String(d["description"] ?? ""),
          ...(typeof d["location"] === "string" ? { location: d["location"] } : {}),
          points: Number(d["points"] ?? 0),
          amount: Number(d["amount"] ?? 0),
          sneDiscountApplied: Boolean(d["sneDiscountApplied"]),
          ...(typeof d["driverIndicationDeadline"] === "string"
            ? { driverIndicationDeadline: d["driverIndicationDeadline"] }
            : {}),
          status: (d["status"] as GarageFine["status"]) ?? "PENDENTE",
        }),
        (garageFines) =>
          setState((prev) => ({
            ...prev,
            garageFines: [...garageFines].sort((a, b) => b.date.localeCompare(a.date)),
          })),
      );

      listenSub<GarageDocument>(
        "garageDocuments",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          docType: (d["docType"] as GarageDocument["docType"]) ?? "CRLV",
          referenceYear: Number(d["referenceYear"] ?? new Date().getFullYear()),
          dueDate: String(d["dueDate"] ?? ""),
          amount: Number(d["amount"] ?? 0),
          ...(typeof d["stateUf"] === "string" ? { stateUf: d["stateUf"] } : {}),
          ...(typeof d["providerOrAuthority"] === "string"
            ? { providerOrAuthority: d["providerOrAuthority"] }
            : {}),
          ...(typeof d["policyOrCode"] === "string" ? { policyOrCode: d["policyOrCode"] } : {}),
          status: (d["status"] as GarageDocument["status"]) ?? "PENDENTE",
          ...(typeof d["paidAt"] === "string" ? { paidAt: d["paidAt"] } : {}),
          ...(typeof d["autoGenerated"] === "boolean"
            ? { autoGenerated: d["autoGenerated"] }
            : {}),
          ...(typeof d["notes"] === "string" ? { notes: d["notes"] } : {}),
        }),
        (garageDocuments) =>
          setState((prev) => ({
            ...prev,
            garageDocuments: [...garageDocuments].sort((a, b) =>
              a.dueDate.localeCompare(b.dueDate),
            ),
          })),
      );

      listenSub<GarageChecklist>(
        "garageChecklists",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          ...(typeof d["driverId"] === "string" ? { driverId: d["driverId"] } : {}),
          date: String(d["date"] ?? ""),
          odometer: Number(d["odometer"] ?? 0),
          items: Array.isArray(d["items"]) ? (d["items"] as GarageChecklist["items"]) : [],
          hasIssues: Boolean(d["hasIssues"]),
          ...(typeof d["generatedMaintenanceId"] === "string"
            ? { generatedMaintenanceId: d["generatedMaintenanceId"] }
            : {}),
          ...(typeof d["generalNotes"] === "string" ? { generalNotes: d["generalNotes"] } : {}),
        }),
        (garageChecklists) =>
          setState((prev) => ({
            ...prev,
            garageChecklists: [...garageChecklists].sort((a, b) => b.date.localeCompare(a.date)),
          })),
      );

      listenSub<GarageRoute>(
        "garageRoutes",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          ...(typeof d["driverId"] === "string" ? { driverId: d["driverId"] } : {}),
          date: String(d["date"] ?? ""),
          origin: String(d["origin"] ?? ""),
          destination: String(d["destination"] ?? ""),
          startOdometer: Number(d["startOdometer"] ?? 0),
          endOdometer: Number(d["endOdometer"] ?? 0),
          distanceKm: Number(d["distanceKm"] ?? 0),
          ...(typeof d["estimatedKm"] === "number" ? { estimatedKm: d["estimatedKm"] } : {}),
          ...(typeof d["purpose"] === "string" ? { purpose: d["purpose"] } : {}),
        }),
        (garageRoutes) =>
          setState((prev) => ({
            ...prev,
            garageRoutes: [...garageRoutes].sort((a, b) => b.date.localeCompare(a.date)),
          })),
      );

      listenSub<GarageReminder>(
        "garageReminders",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          title: String(d["title"] ?? ""),
          category: (d["category"] as GarageReminder["category"]) ?? "MANUTENCAO",
          ...(typeof d["dueDate"] === "string" ? { dueDate: d["dueDate"] } : {}),
          ...(typeof d["dueOdometer"] === "number" ? { dueOdometer: d["dueOdometer"] } : {}),
          completed: Boolean(d["completed"]),
          ...(typeof d["completedAt"] === "string" ? { completedAt: d["completedAt"] } : {}),
          ...(typeof d["notes"] === "string" ? { notes: d["notes"] } : {}),
        }),
        (garageReminders) => setState((prev) => ({ ...prev, garageReminders })),
      );

      listenSub<FuelLog>(
        "fuelLogs",
        (id, d) => ({
          id,
          vehicleId: String(d["vehicleId"] ?? ""),
          date: String(d["date"] ?? ""),
          liters: Number(d["liters"] ?? 0),
          totalCents: Number(d["totalCents"] ?? 0),
          odometerKm: Number(d["odometerKm"] ?? 0),
          fuelType: (d["fuelType"] as FuelLog["fuelType"]) ?? "Gasolina",
        }),
        (fuelLogs) =>
          setState((prev) => ({
            ...prev,
            fuelLogs: [...fuelLogs].sort((a, b) => b.date.localeCompare(a.date)),
          })),
      );

      listenSub<TripPlan>(
        "trips",
        (id, d) => ({
          id,
          destination: String(d["destination"] ?? ""),
          startDate: String(d["startDate"] ?? ""),
          endDate: String(d["endDate"] ?? ""),
          budgetCents: Number(d["budgetCents"] ?? 0),
          spentCents: Number(d["spentCents"] ?? 0),
          notes: String(d["notes"] ?? ""),
          status: (d["status"] as TripPlan["status"]) ?? "Planejada",
        }),
        (trips) => setState((prev) => ({ ...prev, trips })),
      );

      listenSub<FiscalReceipt>(
        "fiscalReceipts",
        (id, d) => ({
          id,
          ownerId: typeof d["ownerId"] === "string" ? d["ownerId"] : uidPath,
          kind:
            d["kind"] === "mercado" || d["kind"] === "aquisicoes"
              ? d["kind"]
              : "geral",
          ...(typeof d["docType"] === "string"
            ? { docType: d["docType"] as FiscalReceipt["docType"] }
            : {}),
          ...(typeof d["uf"] === "string" ? { uf: d["uf"] } : {}),
          store: String(d["store"] ?? ""),
          cnpj: String(d["cnpj"] ?? ""),
          ...(typeof d["emitterAddress"] === "string"
            ? { emitterAddress: d["emitterAddress"] }
            : {}),
          issuedAt: String(d["issuedAt"] ?? ""),
          ...(typeof d["issuedTime"] === "string" ? { issuedTime: d["issuedTime"] } : {}),
          accessKey: String(d["accessKey"] ?? ""),
          number: String(d["number"] ?? ""),
          series: String(d["series"] ?? ""),
          paymentMethod: String(d["paymentMethod"] ?? ""),
          ...(typeof d["discountCents"] === "number"
            ? { discountCents: d["discountCents"] }
            : {}),
          totalCents: Number(d["totalCents"] ?? 0),
          items: Array.isArray(d["items"]) ? (d["items"] as FiscalReceipt["items"]) : [],
          ...(typeof d["archiveCategory"] === "string"
            ? { archiveCategory: d["archiveCategory"] }
            : {}),
          ...(typeof d["folderPath"] === "string" ? { folderPath: d["folderPath"] } : {}),
          ...(typeof d["storagePath"] === "string" ? { storagePath: d["storagePath"] } : {}),
          ...(typeof d["fileName"] === "string" ? { fileName: d["fileName"] } : {}),
          ...(typeof d["fileMimeType"] === "string" ? { fileMimeType: d["fileMimeType"] } : {}),
          ...(typeof d["fileHash"] === "string" ? { fileHash: d["fileHash"] } : {}),
          ...(typeof d["documentUrl"] === "string" ? { documentUrl: d["documentUrl"] } : {}),
          ...(typeof d["sourceUrl"] === "string" ? { sourceUrl: d["sourceUrl"] } : {}),
          ...(typeof d["linkedTransactionId"] === "string"
            ? { linkedTransactionId: d["linkedTransactionId"] }
            : {}),
          ...(typeof d["processingStatus"] === "string"
            ? { processingStatus: d["processingStatus"] as FiscalReceipt["processingStatus"] }
            : {}),
          ...(typeof d["processingError"] === "string"
            ? { processingError: d["processingError"] }
            : {}),
          ...(typeof d["sourceOrigin"] === "string"
            ? { sourceOrigin: d["sourceOrigin"] as FiscalReceipt["sourceOrigin"] }
            : {}),
          ...(Array.isArray(d["lowConfidenceFields"])
            ? { lowConfidenceFields: d["lowConfidenceFields"] as string[] }
            : {}),
          ...(d["warranty"] && typeof d["warranty"] === "object"
            ? { warranty: d["warranty"] as FiscalReceipt["warranty"] }
            : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (fiscalReceipts) =>
          setState((prev) => ({
            ...prev,
            fiscalReceipts: [...fiscalReceipts].sort((a, b) =>
              b.issuedAt.localeCompare(a.issuedAt),
            ),
          })),
      );
    }

    void initAndSubscribe();

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
  }, [user]);

  const requireUid = () => {
    if (!user) throw new Error("Usuário não autenticado.");
    return user.uid;
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  const updateProfile: OrionContextValue["updateProfile"] = async (profile) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}`;
    try {
      await updateDoc(doc(db, "users", ownerId), {
        name: clampStr(profile.name, 120) || "Usuário",
        email: clampStr(profile.email, 160),
        photoUrl: clampStr(profile.photoUrl, 500),
        city: clampStr(profile.city, 100),
        state: clampStr(profile.state, 4),
        selectedLogoId: profile.selectedLogoId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const updateSelectedLogo: OrionContextValue["updateSelectedLogo"] = async (logoId) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}`;
    try {
      await updateDoc(doc(db, "users", ownerId), {
        selectedLogoId: logoId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const updatePixRecipient: OrionContextValue["updatePixRecipient"] = async (pixRecipient) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}`;
    try {
      await updateDoc(doc(db, "users", ownerId), {
        pixRecipient: {
          key: clampStr(pixRecipient.key, 160),
          name: clampStr(pixRecipient.name, 120),
          state: clampStr(pixRecipient.state, 4),
          city: clampStr(pixRecipient.city, 100),
        },
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const addBankAccount: OrionContextValue["addBankAccount"] = async (bank) => {
    const ownerId = requireUid();
    const id = uid("bank");
    const path = `users/${ownerId}/banks/${id}`;
    try {
      await setDoc(doc(db, "users", ownerId, "banks", id), {
        ownerId,
        institution: clampStr(bank.institution, 80),
        name: clampStr(bank.name, 80),
        accountType: bank.accountType,
        number: clampStr(bank.number || "0001", 20),
        balanceCents: Math.trunc(bank.balanceCents),
        color: clampStr(bank.color || "#173d4a", 20),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const addCreditCard: OrionContextValue["addCreditCard"] = async (card) => {
    const ownerId = requireUid();
    const id = uid("card");
    const path = `users/${ownerId}/cards/${id}`;
    try {
      await setDoc(
        doc(db, "users", ownerId, "cards", id),
        stripUndefined({
          ownerId,
          institution: clampStr(card.institution, 80),
          name: clampStr(card.name, 80),
          brand: card.brand,
          number: clampStr(card.number || "0000", 10),
          creditLimitCents: Math.max(0, Math.trunc(card.creditLimitCents)),
          availableCents: Math.trunc(card.availableCents),
          closingDay: Math.min(31, Math.max(1, Math.trunc(card.closingDay))),
          dueDay: Math.min(31, Math.max(1, Math.trunc(card.dueDay))),
          manualLimitCents: card.manualLimitCents,
          manualUsedCents: card.manualUsedCents,
          linkedAnnualExpenseId: card.linkedAnnualExpenseId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const saveCardOverride: OrionContextValue["saveCardOverride"] = async (
    cardId,
    limitCents,
    usedCents,
  ) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/cards/${cardId}`;
    try {
      await updateDoc(doc(db, "users", ownerId, "cards", cardId), {
        manualLimitCents: Math.max(0, Math.trunc(limitCents)),
        manualUsedCents: Math.max(0, Math.trunc(usedCents)),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const clearCardOverride: OrionContextValue["clearCardOverride"] = async (cardId) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/cards/${cardId}`;
    try {
      await updateDoc(doc(db, "users", ownerId, "cards", cardId), {
        manualLimitCents: deleteField(),
        manualUsedCents: deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const addQuickMovement: OrionContextValue["addQuickMovement"] = async (input) => {
    const ownerId = requireUid();
    const batch = writeBatch(db);
    const bank = state.banks.find((b) => b.id === input.accountId) ?? state.banks[0];

    if (input.settled && bank) {
      const txId = uid("tx");
      batch.set(doc(db, "users", ownerId, "transactions", txId), {
        ownerId,
        accountId: bank.id,
        accountType: "BANK",
        accountName: clampStr(bank.name, 100),
        institution: clampStr(bank.institution, 80),
        description: clampStr(input.title, 160),
        amountCents: Math.trunc(input.kind === "income" ? input.amountCents : -input.amountCents),
        date: input.date,
        category: clampStr(input.category, 60),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(doc(db, "users", ownerId, "banks", bank.id), {
        balanceCents: Math.trunc(
          bank.balanceCents + (input.kind === "income" ? input.amountCents : -input.amountCents),
        ),
        updatedAt: serverTimestamp(),
      });
    }

    if (input.kind === "income") {
      const revId = uid("rev");
      batch.set(
        doc(db, "users", ownerId, "revenueEntries", revId),
        stripUndefined({
          ownerId,
          title: clampStr(input.title, 160),
          category: clampStr(input.category, 60),
          dueDate: input.date,
          expectedCents: Math.max(1, Math.trunc(input.amountCents)),
          receivedDate: input.settled ? input.date : null,
          receivedCents: input.settled ? Math.trunc(input.amountCents) : null,
          note: input.note ? clampStr(input.note, 300) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    } else {
      const billId = uid("bill");
      batch.set(
        doc(db, "users", ownerId, "monthlyBills", billId),
        stripUndefined({
          ownerId,
          period: input.date.slice(0, 7),
          creditor: clampStr(input.title, 140),
          category: clampStr(input.category, 60),
          dueDate: input.date,
          expectedCents: Math.max(0, Math.trunc(input.amountCents)),
          paidDate: input.settled ? input.date : null,
          paidCents: input.settled ? Math.trunc(input.amountCents) : null,
          isSettled: input.settled,
          note: input.note ? clampStr(input.note, 300) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }

    const nextBills = [...state.monthlyBills];
    const nextTransactions = [...state.transactions];
    if (input.settled && bank) {
      nextTransactions.push({
        id: "tmp-tx",
        accountId: bank.id,
        accountType: "BANK",
        accountName: clampStr(bank.name, 100),
        institution: clampStr(bank.institution, 80),
        description: clampStr(input.title, 160),
        amountCents: Math.trunc(input.kind === "income" ? input.amountCents : -input.amountCents),
        date: input.date,
        category: clampStr(input.category, 60),
      });
    }
    if (input.kind === "expense") {
      nextBills.push({
        id: "tmp-bill",
        period: input.date.slice(0, 7),
        creditor: clampStr(input.title, 140),
        category: clampStr(input.category, 60),
        dueDate: input.date,
        expectedCents: Math.max(0, Math.trunc(input.amountCents)),
        paidDate: input.settled ? input.date : null,
        paidCents: input.settled ? Math.trunc(input.amountCents) : null,
        isSettled: input.settled,
      });
    }

    try {
      await batch.commit();
      if (input.kind === "expense") {
        const expYear = Number(input.date.slice(0, 4));
        if (expYear >= 2000 && expYear <= 2100) {
          await persistAnnualCategoryHistory(ownerId, expYear, {
            ...state,
            monthlyBills: nextBills,
            transactions: nextTransactions,
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/quickMovement`);
    }
  };

  const addRevenueSource: OrionContextValue["addRevenueSource"] = async (source, year = 2026) => {
    const ownerId = requireUid();
    const sourceId = uid("src");
    const today = todayBR();
    const currentMonth = Number(today.slice(5, 7));
    const batch = writeBatch(db);

    batch.set(
      doc(db, "users", ownerId, "revenueSources", sourceId),
      stripUndefined({
        ownerId,
        title: clampStr(source.title, 140),
        category: clampStr(source.category, 60),
        expectedCents: Math.max(1, Math.trunc(source.expectedCents)),
        dueDay: Math.min(31, Math.max(1, Math.trunc(source.dueDay))),
        recurrence: source.recurrence,
        active: source.active,
        note: source.note ? clampStr(source.note, 300) : undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    const monthsList =
      source.recurrence === "monthly"
        ? Array.from({ length: 12 - currentMonth + 1 }, (_, i) => currentMonth + i)
        : [currentMonth];

    for (const m of monthsList) {
      const entryId = uid("rev");
      batch.set(
        doc(db, "users", ownerId, "revenueEntries", entryId),
        stripUndefined({
          ownerId,
          sourceId,
          title: clampStr(source.title, 160),
          category: clampStr(source.category, 60),
          dueDate: clampDueDate(year, m, source.dueDay),
          expectedCents: Math.max(1, Math.trunc(source.expectedCents)),
          receivedDate: null,
          receivedCents: null,
          note: source.note ? clampStr(source.note, 300) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/revenueSources/${sourceId}`);
    }
  };

  const receiveRevenueEntry: OrionContextValue["receiveRevenueEntry"] = async (
    entryId,
    receivedCents,
    receivedDate,
    note,
    accountId,
    options,
  ) => {
    const ownerId = requireUid();
    const idemKey = options?.idempotencyKey;
    if (idemKey) {
      if (inFlightKeysRef.current.has(idemKey)) return;
      if (state.revenueEvents.some((ev) => ev.idempotencyKey === idemKey)) return;
      inFlightKeysRef.current.add(idemKey);
    }

    const path = `users/${ownerId}/revenueEntries/${entryId}`;
    const safeDate = validIsoDate(receivedDate);
    const cashNow = Math.max(0, Math.trunc(receivedCents));
    const discountNow = Math.max(0, Math.trunc(options?.discountCents ?? 0));
    const surchargeNow = Math.max(0, Math.trunc(options?.surchargeCents ?? 0));
    const bankTxId = options?.bankTransactionId ? clampStr(options.bankTransactionId, 128) : null;
    const chosenAccountId = accountId ? clampStr(accountId, 128) : null;
    const incomingAtts = sanitizeAttachments(options?.attachments);
    const eventId = uid("revec");

    try {
      await runTransaction(db, async (tx) => {
        const entryRef = doc(db, "users", ownerId, "revenueEntries", entryId);
        const entrySnap = await tx.get(entryRef);
        if (!entrySnap.exists()) throw new Error("Lançamento de receita não encontrado.");
        const ed = entrySnap.data() as DocumentData;
        const contractId = typeof ed["contractId"] === "string" ? ed["contractId"] : null;
        const contractRef = contractId ? doc(db, "users", ownerId, "revenueContracts", contractId) : null;
        const contractSnap = contractRef ? await tx.get(contractRef) : null;
        const bankRef =
          !bankTxId && chosenAccountId && cashNow > 0
            ? doc(db, "users", ownerId, "banks", chosenAccountId)
            : null;
        const bankSnap = bankRef ? await tx.get(bankRef) : null;
        const bankTxRef = bankTxId ? doc(db, "users", ownerId, "transactions", bankTxId) : null;
        const bankTxSnap = bankTxRef ? await tx.get(bankTxRef) : null;

        const prevReceived = Number(ed["receivedCents"] ?? 0);
        const expectedTotal = Math.max(
          0,
          Number(ed["expectedCents"] ?? 0) + Number(ed["adjustmentCents"] ?? 0),
        );
        const newTotalReceived = prevReceived + cashNow;
        const totalDiscount = Number(ed["discountCents"] ?? 0) + discountNow;
        const totalSurcharge = Number(ed["surchargeCents"] ?? 0) + surchargeNow;
        const isSettled =
          options?.isSettled !== undefined
            ? Boolean(options.isSettled)
            : newTotalReceived + totalDiscount >= expectedTotal;
        const mergedAtts = sanitizeAttachments([
          ...((ed["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
          ...incomingAtts,
        ]);
        const finalNote =
          note !== undefined ? clampStr(note, 300) : (typeof ed["note"] === "string" ? ed["note"] : "");

        tx.update(
          entryRef,
          stripUndefined({
            receivedCents: newTotalReceived,
            receivedDate: safeDate,
            discountCents: totalDiscount > 0 ? totalDiscount : null,
            surchargeCents: totalSurcharge > 0 ? totalSurcharge : null,
            note: finalNote || undefined,
            accountId: chosenAccountId ?? (typeof ed["accountId"] === "string" ? ed["accountId"] : null),
            bankTransactionId:
              bankTxId ?? (typeof ed["bankTransactionId"] === "string" ? ed["bankTransactionId"] : null),
            attachments: mergedAtts.length > 0 ? mergedAtts : undefined,
            updatedAt: serverTimestamp(),
          }),
        );

        if (bankSnap?.exists()) {
          tx.update(bankSnap.ref, {
            balanceCents: Math.trunc(Number(bankSnap.data()["balanceCents"] ?? 0) + cashNow),
            updatedAt: serverTimestamp(),
          });
        }

        if (bankTxSnap?.exists()) {
          tx.update(bankTxSnap.ref, {
            reconciledEventId: eventId,
            updatedAt: serverTimestamp(),
          });
        }

        if (contractSnap?.exists()) {
          const cd = contractSnap.data() as DocumentData;
          const nextEntries = state.revenueEntries.map((item) =>
            item.id === entryId
              ? {
                  ...item,
                  receivedCents: newTotalReceived,
                  receivedDate: isSettled ? safeDate : null,
                  discountCents: totalDiscount || null,
                }
              : item,
          );
          const nextStatus = derivedContractStatus(
            {
              id: contractSnap.id,
              title: String(cd["title"] ?? ""),
              buyer: String(cd["buyer"] ?? ""),
              cpf: String(cd["cpf"] ?? ""),
              phone: String(cd["phone"] ?? ""),
              email: String(cd["email"] ?? ""),
              city: String(cd["city"] ?? ""),
              state: String(cd["state"] ?? ""),
              address: String(cd["address"] ?? ""),
              postalCode: String(cd["postalCode"] ?? ""),
              totalCents: Number(cd["totalCents"] ?? 0),
              downPaymentCents: Number(cd["downPaymentCents"] ?? 0),
              interestPercent: Number(cd["interestPercent"] ?? 0),
              finePercent: Number(cd["finePercent"] ?? 0),
              correctionIndex: (cd["correctionIndex"] as RevenueContract["correctionIndex"]) ?? "Sem correção",
              status: (cd["status"] as RevenueContract["status"]) ?? "Em andamento",
              createdAt: String(cd["contractDate"] ?? ""),
            },
            nextEntries,
            todayBR(),
          );
          if (nextStatus !== cd["status"]) {
            tx.update(contractSnap.ref, {
              status: nextStatus,
              updatedAt: serverTimestamp(),
            });
          }
        }

        const eventCreatedAt = new Date().toISOString();
        const beforeData: RevenueEventSnapshot = {
          receivedDate: typeof ed["receivedDate"] === "string" ? ed["receivedDate"] : null,
          receivedCents: typeof ed["receivedCents"] === "number" ? ed["receivedCents"] : null,
          discountCents: typeof ed["discountCents"] === "number" ? ed["discountCents"] : null,
          surchargeCents: typeof ed["surchargeCents"] === "number" ? ed["surchargeCents"] : null,
          accountId: typeof ed["accountId"] === "string" ? ed["accountId"] : null,
          bankTransactionId: typeof ed["bankTransactionId"] === "string" ? ed["bankTransactionId"] : null,
          note: typeof ed["note"] === "string" ? ed["note"] : undefined,
        };
        const afterData: RevenueEventSnapshot = {
          receivedDate: safeDate,
          receivedCents: cashNow,
          discountCents: discountNow > 0 ? discountNow : null,
          surchargeCents: surchargeNow > 0 ? surchargeNow : null,
          isSettled,
          accountId: chosenAccountId,
          bankTransactionId: bankTxId,
          note: finalNote || undefined,
        };

        tx.set(
          doc(db, "users", ownerId, "revenueEvents", eventId),
          stripUndefined({
            ownerId,
            entryId,
            kind: isSettled ? "recebimento" : "parcial",
            reason: isSettled
              ? prevReceived > 0
                ? "Quitação complementar de recebimento"
                : "Confirmação de recebimento"
              : "Recebimento parcial registrado",
            eventCreatedAt,
            accountId: chosenAccountId,
            bankTransactionId: bankTxId,
            idempotencyKey: idemKey ? clampStr(idemKey, 128) : undefined,
            beforeData,
            afterData,
            attachments: incomingAtts.length > 0 ? incomingAtts : undefined,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      if (idemKey) inFlightKeysRef.current.delete(idemKey);
    }
  };

  const correctRevenueEvent: OrionContextValue["correctRevenueEvent"] = async (input) => {
    const ownerId = requireUid();
    const idemKey = input.idempotencyKey;
    if (idemKey) {
      if (inFlightKeysRef.current.has(idemKey)) return;
      if (state.revenueEvents.some((ev) => ev.idempotencyKey === idemKey)) return;
      inFlightKeysRef.current.add(idemKey);
    }

    const safeDate = validIsoDate(input.receivedDate);
    const newCash = Math.max(0, Math.trunc(input.receivedCents));
    const newDiscount = Math.max(0, Math.trunc(input.discountCents ?? 0));
    const newSurcharge = Math.max(0, Math.trunc(input.surchargeCents ?? 0));
    const newAccountId = input.accountId ? clampStr(input.accountId, 128) : null;
    const newBankTxId = input.bankTransactionId ? clampStr(input.bankTransactionId, 128) : null;
    const newAtts = sanitizeAttachments(input.attachments);
    const newEventId = uid("revc");

    try {
      await runTransaction(db, async (tx) => {
        const entryRef = doc(db, "users", ownerId, "revenueEntries", input.entryId);
        const entrySnap = await tx.get(entryRef);
        if (!entrySnap.exists()) throw new Error("Lançamento de receita não encontrado.");
        const ed = entrySnap.data() as DocumentData;

        const targetEvRef = input.revenueEventId
          ? doc(db, "users", ownerId, "revenueEvents", input.revenueEventId)
          : null;
        const targetEvSnap = targetEvRef ? await tx.get(targetEvRef) : null;
        const targetEvData = targetEvSnap?.exists() ? (targetEvSnap.data() as DocumentData) : null;
        const targetAfter = (targetEvData?.["afterData"] as RevenueEventSnapshot | undefined) ?? undefined;

        const oldEventCash = targetAfter?.receivedCents ?? Number(ed["receivedCents"] ?? 0);
        const oldAccountId =
          targetAfter?.accountId !== undefined
            ? targetAfter.accountId
            : (typeof targetEvData?.["accountId"] === "string"
                ? (targetEvData["accountId"] as string)
                : (typeof ed["accountId"] === "string" ? (ed["accountId"] as string) : null));
        const oldBankTxId =
          targetAfter?.bankTransactionId !== undefined
            ? targetAfter.bankTransactionId
            : (typeof targetEvData?.["bankTransactionId"] === "string"
                ? (targetEvData["bankTransactionId"] as string)
                : (typeof ed["bankTransactionId"] === "string"
                    ? (ed["bankTransactionId"] as string)
                    : null));

        const contractId = typeof ed["contractId"] === "string" ? ed["contractId"] : null;
        const contractSnap = contractId
          ? await tx.get(doc(db, "users", ownerId, "revenueContracts", contractId))
          : null;

        const oldBankRef =
          oldAccountId && !oldBankTxId && oldEventCash > 0
            ? doc(db, "users", ownerId, "banks", oldAccountId)
            : null;
        const newBankRef =
          newAccountId && !newBankTxId && newCash > 0
            ? doc(db, "users", ownerId, "banks", newAccountId)
            : null;
        const sameBankRef = oldBankRef && newBankRef && oldBankRef.id === newBankRef.id;
        const oldBankSnap = oldBankRef ? await tx.get(oldBankRef) : null;
        const newBankSnap = newBankRef && !sameBankRef ? await tx.get(newBankRef) : null;

        const oldTxSnap =
          oldBankTxId && oldBankTxId !== newBankTxId
            ? await tx.get(doc(db, "users", ownerId, "transactions", oldBankTxId))
            : null;
        const newTxSnap =
          newBankTxId && newBankTxId !== oldBankTxId
            ? await tx.get(doc(db, "users", ownerId, "transactions", newBankTxId))
            : null;

        const activeEvents = resolveActiveRevenueEvents(state.revenueEvents).filter(
          (ev) => ev.entryId === input.entryId && ev.id !== input.revenueEventId,
        );
        const otherSum = activeEvents.reduce(
          (s, ev) => s + Math.max(0, Number(ev.afterData?.receivedCents ?? 0)),
          0,
        );
        const entryTotalReceived = Math.max(0, otherSum + newCash);
        const mergedAtts = sanitizeAttachments([
          ...newAtts,
          ...((ed["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
        ]);

        tx.update(
          entryRef,
          stripUndefined({
            receivedCents: entryTotalReceived,
            receivedDate: safeDate,
            discountCents: newDiscount > 0 ? newDiscount : null,
            surchargeCents: newSurcharge > 0 ? newSurcharge : null,
            accountId: newAccountId,
            bankTransactionId: newBankTxId,
            note: clampStr(input.note, 300),
            attachments: mergedAtts.length > 0 ? mergedAtts : undefined,
            updatedAt: serverTimestamp(),
          }),
        );

        // Adjust bank balances cleanly
        if (sameBankRef && oldBankSnap?.exists()) {
          const netDelta = newCash - oldEventCash;
          if (netDelta !== 0) {
            tx.update(oldBankSnap.ref, {
              balanceCents: Math.trunc(Number(oldBankSnap.data()["balanceCents"] ?? 0) + netDelta),
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          if (oldBankSnap?.exists() && oldEventCash > 0) {
            tx.update(oldBankSnap.ref, {
              balanceCents: Math.trunc(Number(oldBankSnap.data()["balanceCents"] ?? 0) - oldEventCash),
              updatedAt: serverTimestamp(),
            });
          }
          if (newBankSnap?.exists() && newCash > 0) {
            tx.update(newBankSnap.ref, {
              balanceCents: Math.trunc(Number(newBankSnap.data()["balanceCents"] ?? 0) + newCash),
              updatedAt: serverTimestamp(),
            });
          }
        }

        if (oldTxSnap?.exists()) {
          tx.update(oldTxSnap.ref, { reconciledEventId: null, updatedAt: serverTimestamp() });
        }
        if (newTxSnap?.exists()) {
          tx.update(newTxSnap.ref, { reconciledEventId: newEventId, updatedAt: serverTimestamp() });
        }

        if (contractSnap?.exists()) {
          const cd = contractSnap.data() as DocumentData;
          const nextEntries = state.revenueEntries.map((item) =>
            item.id === input.entryId
              ? {
                  ...item,
                  receivedCents: entryTotalReceived,
                  receivedDate: input.isSettled ? safeDate : null,
                  discountCents: newDiscount || null,
                }
              : item,
          );
          const nextStatus = derivedContractStatus(
            {
              id: contractSnap.id,
              title: String(cd["title"] ?? ""),
              buyer: String(cd["buyer"] ?? ""),
              cpf: String(cd["cpf"] ?? ""),
              phone: String(cd["phone"] ?? ""),
              email: String(cd["email"] ?? ""),
              city: String(cd["city"] ?? ""),
              state: String(cd["state"] ?? ""),
              address: String(cd["address"] ?? ""),
              postalCode: String(cd["postalCode"] ?? ""),
              totalCents: Number(cd["totalCents"] ?? 0),
              downPaymentCents: Number(cd["downPaymentCents"] ?? 0),
              interestPercent: Number(cd["interestPercent"] ?? 0),
              finePercent: Number(cd["finePercent"] ?? 0),
              correctionIndex: (cd["correctionIndex"] as RevenueContract["correctionIndex"]) ?? "Sem correção",
              status: (cd["status"] as RevenueContract["status"]) ?? "Em andamento",
              createdAt: String(cd["contractDate"] ?? ""),
            },
            nextEntries,
            todayBR(),
          );
          if (nextStatus !== cd["status"]) {
            tx.update(contractSnap.ref, { status: nextStatus, updatedAt: serverTimestamp() });
          }
        }

        const beforeData: RevenueEventSnapshot = {
          receivedDate: targetAfter?.receivedDate ?? (typeof ed["receivedDate"] === "string" ? ed["receivedDate"] : null),
          receivedCents: oldEventCash,
          discountCents: targetAfter?.discountCents ?? (typeof ed["discountCents"] === "number" ? ed["discountCents"] : null),
          surchargeCents: targetAfter?.surchargeCents ?? (typeof ed["surchargeCents"] === "number" ? ed["surchargeCents"] : null),
          isSettled: targetAfter?.isSettled,
          accountId: oldAccountId,
          bankTransactionId: oldBankTxId,
          note: targetAfter?.note ?? (typeof ed["note"] === "string" ? ed["note"] : undefined),
        };
        const afterData: RevenueEventSnapshot = {
          receivedDate: safeDate,
          receivedCents: newCash,
          discountCents: newDiscount > 0 ? newDiscount : null,
          surchargeCents: newSurcharge > 0 ? newSurcharge : null,
          isSettled: input.isSettled,
          accountId: newAccountId,
          bankTransactionId: newBankTxId,
          note: clampStr(input.note, 300) || undefined,
        };

        tx.set(
          doc(db, "users", ownerId, "revenueEvents", newEventId),
          stripUndefined({
            ownerId,
            entryId: input.entryId,
            kind: "correcao",
            reason: clampStr(input.reason || "Correção de recebimento", 300),
            eventCreatedAt: new Date().toISOString(),
            accountId: newAccountId,
            bankTransactionId: newBankTxId,
            targetEventId: input.revenueEventId ?? null,
            idempotencyKey: idemKey ? clampStr(idemKey, 128) : undefined,
            beforeData,
            afterData,
            attachments: newAtts.length > 0 ? newAtts : undefined,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/revenueEvents/${newEventId}`);
    } finally {
      if (idemKey) inFlightKeysRef.current.delete(idemKey);
    }
  };

  const reverseRevenueEvent: OrionContextValue["reverseRevenueEvent"] = async (input) => {
    const ownerId = requireUid();
    const idemKey = input.idempotencyKey;
    if (idemKey) {
      if (inFlightKeysRef.current.has(idemKey)) return;
      if (state.revenueEvents.some((ev) => ev.idempotencyKey === idemKey)) return;
      inFlightKeysRef.current.add(idemKey);
    }

    const revEventId = uid("revest");
    try {
      await runTransaction(db, async (tx) => {
        const entryRef = doc(db, "users", ownerId, "revenueEntries", input.entryId);
        const entrySnap = await tx.get(entryRef);
        if (!entrySnap.exists()) throw new Error("Lançamento de receita não encontrado.");
        const ed = entrySnap.data() as DocumentData;

        const targetEvRef = input.revenueEventId
          ? doc(db, "users", ownerId, "revenueEvents", input.revenueEventId)
          : null;
        const targetEvSnap = targetEvRef ? await tx.get(targetEvRef) : null;
        const targetEvData = targetEvSnap?.exists() ? (targetEvSnap.data() as DocumentData) : null;
        const targetAfter = (targetEvData?.["afterData"] as RevenueEventSnapshot | undefined) ?? undefined;

        const oldCash = targetAfter?.receivedCents ?? Number(ed["receivedCents"] ?? 0);
        const oldAccountId =
          targetAfter?.accountId !== undefined
            ? targetAfter.accountId
            : (typeof ed["accountId"] === "string" ? (ed["accountId"] as string) : null);
        const oldBankTxId =
          targetAfter?.bankTransactionId !== undefined
            ? targetAfter.bankTransactionId
            : (typeof ed["bankTransactionId"] === "string" ? (ed["bankTransactionId"] as string) : null);

        const contractId = typeof ed["contractId"] === "string" ? ed["contractId"] : null;
        const contractSnap = contractId
          ? await tx.get(doc(db, "users", ownerId, "revenueContracts", contractId))
          : null;
        const oldBankSnap =
          oldAccountId && !oldBankTxId && oldCash > 0
            ? await tx.get(doc(db, "users", ownerId, "banks", oldAccountId))
            : null;
        const oldTxSnap = oldBankTxId
          ? await tx.get(doc(db, "users", ownerId, "transactions", oldBankTxId))
          : null;

        const remainingActive = resolveActiveRevenueEvents(state.revenueEvents).filter(
          (ev) => ev.entryId === input.entryId && ev.id !== input.revenueEventId,
        );
        const remainingCash = remainingActive.reduce(
          (s, ev) => s + Math.max(0, Number(ev.afterData?.receivedCents ?? 0)),
          0,
        );
        const latestRemaining = remainingActive[remainingActive.length - 1];
        const nextReceivedDate = latestRemaining?.afterData?.receivedDate ?? null;

        tx.update(
          entryRef,
          stripUndefined({
            receivedCents: remainingCash > 0 ? remainingCash : null,
            receivedDate: remainingCash > 0 ? nextReceivedDate : null,
            discountCents: remainingCash > 0 ? (latestRemaining?.afterData?.discountCents ?? null) : null,
            surchargeCents: remainingCash > 0 ? (latestRemaining?.afterData?.surchargeCents ?? null) : null,
            accountId: remainingCash > 0 ? (latestRemaining?.afterData?.accountId ?? null) : null,
            bankTransactionId: remainingCash > 0 ? (latestRemaining?.afterData?.bankTransactionId ?? null) : null,
            updatedAt: serverTimestamp(),
          }),
        );

        if (oldBankSnap?.exists() && oldCash > 0) {
          tx.update(oldBankSnap.ref, {
            balanceCents: Math.trunc(Number(oldBankSnap.data()["balanceCents"] ?? 0) - oldCash),
            updatedAt: serverTimestamp(),
          });
        }
        if (oldTxSnap?.exists()) {
          tx.update(oldTxSnap.ref, { reconciledEventId: null, updatedAt: serverTimestamp() });
        }

        if (contractSnap?.exists()) {
          const cd = contractSnap.data() as DocumentData;
          const nextEntries = state.revenueEntries.map((item) =>
            item.id === input.entryId
              ? {
                  ...item,
                  receivedCents: remainingCash > 0 ? remainingCash : null,
                  receivedDate: remainingCash > 0 ? nextReceivedDate : null,
                }
              : item,
          );
          const nextStatus = derivedContractStatus(
            {
              id: contractSnap.id,
              title: String(cd["title"] ?? ""),
              buyer: String(cd["buyer"] ?? ""),
              cpf: String(cd["cpf"] ?? ""),
              phone: String(cd["phone"] ?? ""),
              email: String(cd["email"] ?? ""),
              city: String(cd["city"] ?? ""),
              state: String(cd["state"] ?? ""),
              address: String(cd["address"] ?? ""),
              postalCode: String(cd["postalCode"] ?? ""),
              totalCents: Number(cd["totalCents"] ?? 0),
              downPaymentCents: Number(cd["downPaymentCents"] ?? 0),
              interestPercent: Number(cd["interestPercent"] ?? 0),
              finePercent: Number(cd["finePercent"] ?? 0),
              correctionIndex: (cd["correctionIndex"] as RevenueContract["correctionIndex"]) ?? "Sem correção",
              status: (cd["status"] as RevenueContract["status"]) ?? "Em andamento",
              createdAt: String(cd["contractDate"] ?? ""),
            },
            nextEntries,
            todayBR(),
          );
          if (nextStatus !== cd["status"]) {
            tx.update(contractSnap.ref, { status: nextStatus, updatedAt: serverTimestamp() });
          }
        }

        tx.set(
          doc(db, "users", ownerId, "revenueEvents", revEventId),
          stripUndefined({
            ownerId,
            entryId: input.entryId,
            kind: "estorno",
            reason: clampStr(input.reason || "Estorno de recebimento", 300),
            eventCreatedAt: new Date().toISOString(),
            targetEventId: input.revenueEventId ?? null,
            idempotencyKey: idemKey ? clampStr(idemKey, 128) : undefined,
            beforeData: {
              receivedDate: targetAfter?.receivedDate ?? (typeof ed["receivedDate"] === "string" ? ed["receivedDate"] : null),
              receivedCents: oldCash,
              accountId: oldAccountId,
              bankTransactionId: oldBankTxId,
            },
            afterData: {
              receivedDate: remainingCash > 0 ? nextReceivedDate : null,
              receivedCents: remainingCash > 0 ? remainingCash : null,
              isSettled: false,
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/revenueEvents/${revEventId}`);
    } finally {
      if (idemKey) inFlightKeysRef.current.delete(idemKey);
    }
  };

  const createRevenueContract: OrionContextValue["createRevenueContract"] = async (
    contractData,
    installments,
    firstDueDate,
  ) => {
    const ownerId = requireUid();
    const contractId = uid("ctr");
    const contractDate = todayBR();
    const [startY = 2026, startM = 11, startD = 15] = firstDueDate.split("-").map(Number);
    const batch = writeBatch(db);

    batch.set(
      doc(db, "users", ownerId, "revenueContracts", contractId),
      stripUndefined({
        ownerId,
        title: clampStr(contractData.title, 160),
        buyer: clampStr(contractData.buyer, 140),
        cpf: clampStr(contractData.cpf, 30),
        phone: clampStr(contractData.phone, 40),
        email: clampStr(contractData.email, 140),
        city: clampStr(contractData.city, 100),
        state: clampStr(contractData.state, 4),
        address: clampStr(contractData.address, 200),
        postalCode: clampStr(contractData.postalCode, 20),
        totalCents: Math.max(1, Math.trunc(contractData.totalCents)),
        downPaymentCents: Math.max(0, Math.trunc(contractData.downPaymentCents)),
        interestPercent: contractData.interestPercent,
        finePercent: contractData.finePercent,
        correctionIndex: contractData.correctionIndex,
        customRatePercent: contractData.customRatePercent,
        status: "Em andamento",
        contractDate,
        note: contractData.note ? clampStr(contractData.note, 300) : undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    installments.forEach((cents, idx) => {
      const totalMonths = startM - 1 + idx;
      const y = startY + Math.floor(totalMonths / 12);
      const m = (totalMonths % 12) + 1;
      const entryId = uid("ctre");
      batch.set(doc(db, "users", ownerId, "revenueEntries", entryId), {
        ownerId,
        contractId,
        installmentNumber: idx + 1,
        title: clampStr(`${contractData.title} (${idx + 1}/${installments.length})`, 160),
        category: "Crediário",
        dueDate: clampDueDate(y, m, startD),
        expectedCents: Math.max(1, Math.trunc(cents)),
        receivedDate: null,
        receivedCents: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/revenueContracts/${contractId}`);
    }
  };

  const updateContractStatus: OrionContextValue["updateContractStatus"] = async (
    contractId,
    status,
  ) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/revenueContracts/${contractId}`;
    try {
      await updateDoc(doc(db, "users", ownerId, "revenueContracts", contractId), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const updateAnnualCell: OrionContextValue["updateAnnualCell"] = async (
    rowId,
    monthKey,
    cell,
    options,
  ) => {
    const ownerId = requireUid();
    const row = state.annualExpenses.find((r) => r.id === rowId);
    if (!row) return;
    const idemKey = options?.idempotencyKey;
    if (idemKey) {
      if (inFlightKeysRef.current.has(idemKey)) return;
      if (state.paymentEvents.some((ev) => ev.idempotencyKey === idemKey)) return;
      inFlightKeysRef.current.add(idemKey);
    }

    const period = `${row.year}-${monthKey}`;
    const safeDate = validIsoDate(cell.paidDate);
    const linkedBillCandidates = state.monthlyBills.filter(
      (b) => b.sourceAnnualId === rowId && b.period === period,
    );
    const primaryBill = linkedBillCandidates[0];
    const linkedInst =
      row.sourceContractId
        ? state.payableInstallments.find(
            (i) => i.contractId === row.sourceContractId && i.dueDate.slice(0, 7) === period,
          )
        : primaryBill?.contractId && primaryBill.installmentNumber != null
          ? state.payableInstallments.find(
              (i) =>
                i.contractId === primaryBill.contractId &&
                i.number === primaryBill.installmentNumber,
            )
          : undefined;

    const chosenAccountId =
      options?.accountId !== undefined
        ? (options.accountId ? clampStr(options.accountId, 128) : null)
        : (primaryBill?.accountId ?? linkedInst?.accountId ?? null);
    const bankTxId =
      options?.bankTransactionId !== undefined
        ? (options.bankTransactionId ? clampStr(options.bankTransactionId, 128) : null)
        : (primaryBill?.bankTransactionId ?? null);
    const discountCents = Math.max(0, Math.trunc(options?.discountCents ?? 0));
    const surchargeCents = Math.max(0, Math.trunc(options?.surchargeCents ?? 0));
    const incomingAtts = sanitizeAttachments(options?.attachments);
    const eventId = uid("pevc");
    let nextMonthsForHistory: Record<string, AnnualCellState> = row.months;
    let nextPaidForHistory: number | null = cell.paidCents;

    try {
      await runTransaction(db, async (tx) => {
        const annRef = doc(db, "users", ownerId, "annualExpenses", rowId);
        const annSnap = await tx.get(annRef);
        if (!annSnap.exists()) return;
        const ad = annSnap.data() as DocumentData;
        const existingMonths = (ad["months"] as Record<string, AnnualCellState>) ?? {};
        const prevCell = existingMonths[monthKey] ?? {
          expectedCents: 0,
          paidCents: null,
          paidDate: null,
          isSettled: false,
        };

        const billSnaps = await Promise.all(
          linkedBillCandidates.map((b) => tx.get(doc(db, "users", ownerId, "monthlyBills", b.id))),
        );
        const instSnap = linkedInst
          ? await tx.get(doc(db, "users", ownerId, "payableInstallments", linkedInst.id))
          : null;
        const bankSnap =
          !bankTxId && chosenAccountId
            ? await tx.get(doc(db, "users", ownerId, "banks", chosenAccountId))
            : null;
        const bankTxSnap = bankTxId
          ? await tx.get(doc(db, "users", ownerId, "transactions", bankTxId))
          : null;

        const cleanCell: AnnualCellState = stripUndefined({
          expectedCents: cell.expectedCents !== null ? Math.max(0, Math.trunc(cell.expectedCents)) : null,
          paidCents: cell.paidCents !== null ? Math.max(0, Math.trunc(cell.paidCents)) : null,
          paidDate: safeDate,
          isSettled: Boolean(cell.isSettled),
          note: cell.note !== undefined ? clampStr(cell.note, 300) : prevCell.note,
        }) as unknown as AnnualCellState;
        nextPaidForHistory = cleanCell.paidCents;

        const nextMonths = { ...existingMonths, [monthKey]: cleanCell };
        nextMonthsForHistory = nextMonths;

        tx.update(annRef, {
          months: nextMonths,
          updatedAt: serverTimestamp(),
        });

        for (const bSnap of billSnaps) {
          if (!bSnap.exists()) continue;
          const bd = bSnap.data() as DocumentData;
          const mergedAtts = sanitizeAttachments([
            ...((bd["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
            ...incomingAtts,
          ]);
          tx.update(
            bSnap.ref,
            stripUndefined({
              expectedCents: Math.max(0, Math.trunc(cleanCell.expectedCents ?? 0)),
              paidCents: cleanCell.paidCents,
              paidDate: cleanCell.paidDate,
              isSettled: cleanCell.isSettled,
              discountCents: discountCents > 0 ? discountCents : null,
              surchargeCents: surchargeCents > 0 ? surchargeCents : null,
              accountId: chosenAccountId,
              bankTransactionId: bankTxId,
              attachments: mergedAtts.length > 0 ? mergedAtts : undefined,
              note: cleanCell.note !== undefined ? clampStr(cleanCell.note, 300) : undefined,
              updatedAt: serverTimestamp(),
            }),
          );
        }

        if (instSnap?.exists()) {
          const idata = instSnap.data() as DocumentData;
          const mergedAtts = sanitizeAttachments([
            ...((idata["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
            ...incomingAtts,
          ]);
          tx.update(
            instSnap.ref,
            stripUndefined({
              paidCents: cleanCell.paidCents,
              paidDate: cleanCell.paidDate,
              isSettled: cleanCell.isSettled,
              discountCents: discountCents > 0 ? discountCents : null,
              surchargeCents: surchargeCents > 0 ? surchargeCents : null,
              accountId: chosenAccountId,
              bankTransactionId: bankTxId,
              attachments: mergedAtts.length > 0 ? mergedAtts : undefined,
              note: cleanCell.note !== undefined ? clampStr(cleanCell.note, 300) : undefined,
              updatedAt: serverTimestamp(),
            }),
          );
        }

        const prevPaidCash = prevCell.paidCents ?? 0;
        const newPaidCash = cleanCell.paidCents ?? 0;
        const cashDelta = newPaidCash - prevPaidCash;
        if (bankSnap?.exists() && cashDelta !== 0) {
          tx.update(bankSnap.ref, {
            balanceCents: Math.trunc(Number(bankSnap.data()["balanceCents"] ?? 0) - cashDelta),
            updatedAt: serverTimestamp(),
          });
        }
        if (bankTxSnap?.exists()) {
          tx.update(bankTxSnap.ref, {
            reconciledEventId: eventId,
            updatedAt: serverTimestamp(),
          });
        }

        const hasPaymentNow = Boolean(cleanCell.isSettled) || (cleanCell.paidCents !== null && cleanCell.paidCents > 0);
        if (hasPaymentNow && newPaidCash >= 0) {
          const existingActive = resolveActivePaymentEvents(state.paymentEvents).find(
            (ev) =>
              (primaryBill && ev.billId === primaryBill.id) ||
              (linkedInst && ev.installmentId === linkedInst.id) ||
              (ev.annualRowId === rowId && ev.period === period),
          );
          const changedVsActive =
            !existingActive ||
            existingActive.paidCents !== newPaidCash ||
            existingActive.paidDate !== safeDate ||
            existingActive.isSettled !== cleanCell.isSettled;
          if (changedVsActive) {
            const dueDate = clampDueDate(row.year, Number(monthKey), row.dueDay);
            tx.set(
              doc(db, "users", ownerId, "paymentEvents", eventId),
              stripUndefined({
                ownerId,
                billId: primaryBill?.id ?? null,
                installmentId: linkedInst?.id ?? null,
                contractId: primaryBill?.contractId ?? row.sourceContractId ?? null,
                annualRowId: rowId,
                period,
                cardId: primaryBill?.cardId ?? null,
                creditor: clampStr(row.creditor, 140) || "Credor",
                category: clampStr(row.category, 60),
                dueDate,
                expectedCents: Math.max(0, Math.trunc(cleanCell.expectedCents ?? 0)),
                paidCents: newPaidCash,
                paidDate: safeDate,
                discountCents: discountCents > 0 ? discountCents : null,
                surchargeCents: surchargeCents > 0 ? surchargeCents : null,
                isSettled: cleanCell.isSettled,
                accountId: chosenAccountId,
                bankTransactionId: bankTxId,
                targetEventId: existingActive?.id ?? null,
                idempotencyKey: idemKey ? clampStr(idemKey, 128) : undefined,
                kind: existingActive
                  ? "correcao"
                  : options?.isEarlyPayoff
                    ? "quitacao_antecipada"
                    : cleanCell.isSettled
                      ? "pagamento"
                      : "parcial",
                reason: existingActive
                  ? "Atualização via Grade Anual"
                  : options?.isEarlyPayoff
                    ? "Quitação antecipada via Grade Anual"
                    : cleanCell.isSettled
                      ? "Pagamento confirmado via Grade Anual"
                      : "Pagamento parcial via Grade Anual",
                eventCreatedAt: new Date().toISOString(),
                beforeData: existingActive
                  ? {
                      paidDate: existingActive.paidDate,
                      paidCents: existingActive.paidCents,
                      expectedCents: existingActive.expectedCents,
                      isSettled: existingActive.isSettled,
                      accountId: existingActive.accountId ?? null,
                      bankTransactionId: existingActive.bankTransactionId ?? null,
                    }
                  : null,
                afterData: {
                  paidDate: safeDate,
                  paidCents: newPaidCash,
                  expectedCents: Math.max(0, Math.trunc(cleanCell.expectedCents ?? 0)),
                  isSettled: cleanCell.isSettled,
                  discountCents: discountCents > 0 ? discountCents : null,
                  surchargeCents: surchargeCents > 0 ? surchargeCents : null,
                  accountId: chosenAccountId,
                  bankTransactionId: bankTxId,
                  note: cleanCell.note,
                },
                attachments: incomingAtts.length > 0 ? incomingAtts : undefined,
                note: cleanCell.note,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
          }
        }
      });

      const nextAnnualRows = state.annualExpenses.map((r) =>
        r.id === rowId ? { ...r, months: nextMonthsForHistory } : r,
      );
      const nextBills = state.monthlyBills.map((b) =>
        b.sourceAnnualId === rowId && b.period === period
          ? {
              ...b,
              expectedCents: Math.max(0, Math.trunc(cell.expectedCents ?? 0)),
              paidCents: nextPaidForHistory,
              paidDate: safeDate,
              isSettled: cell.isSettled,
            }
          : b,
      );
      await persistAnnualCategoryHistory(ownerId, row.year, {
        ...state,
        annualExpenses: nextAnnualRows,
        monthlyBills: nextBills,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/annualExpenses/${rowId}`);
    } finally {
      if (idemKey) inFlightKeysRef.current.delete(idemKey);
    }
  };

  const persistAnnualCategoryHistory = async (
    ownerId: string,
    targetYear: number,
    projection: Pick<OrionState, "monthlyBills" | "annualExpenses" | "transactions" | "annualYears">,
  ) => {
    const payload = buildYearSnapshotPayload(projection, targetYear);
    const snapshotUpdatedAt = new Date().toISOString();
    const existing = state.annualYears.find((y) => y.year === targetYear);
    const yearDocId = existing?.id ?? String(targetYear);
    const ref = doc(db, "users", ownerId, "annualYears", yearDocId);

    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          totalExpenseCents: payload.totalExpenseCents,
          categoryTotalsCents: payload.categoryTotalsCents,
          monthlyCategoryCents: payload.monthlyCategoryCents,
          snapshotUpdatedAt,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          ownerId,
          year: targetYear,
          sourceName: "Consolidado Órion",
          archivedAt: null,
          totalExpenseCents: payload.totalExpenseCents,
          categoryTotalsCents: payload.categoryTotalsCents,
          monthlyCategoryCents: payload.monthlyCategoryCents,
          snapshotUpdatedAt,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/annualYears/${yearDocId}`);
    }
  };

  const saveAnnualHistorySnapshot: OrionContextValue["saveAnnualHistorySnapshot"] = async (
    targetYear,
  ) => {
    const ownerId = requireUid();
    const currentYear = Number(todayBR().slice(0, 4)) || 2026;
    const yearsToSave = targetYear ? [targetYear] : collectAllExpenseYears(state, currentYear);
    for (const y of yearsToSave) {
      await persistAnnualCategoryHistory(ownerId, y, state);
    }
  };

  const addAnnualCreditor: OrionContextValue["addAnnualCreditor"] = async ({
    year,
    creditor,
    category,
    dueDay,
    expectedCents,
  }) => {
    const ownerId = requireUid();
    const id = uid("ann");
    const months: Record<string, AnnualCellState> = {};
    for (let m = 1; m <= 12; m++) {
      months[String(m).padStart(2, "0")] = {
        expectedCents: Math.max(0, Math.trunc(expectedCents)),
        paidCents: null,
        paidDate: null,
        isSettled: false,
      };
    }

    const currentMonthNum = Number(todayBR().slice(5, 7));
    const currentMonthKey = String(currentMonthNum).padStart(2, "0");
    const billId = uid("bill");
    const batch = writeBatch(db);

    batch.set(doc(db, "users", ownerId, "annualExpenses", id), {
      ownerId,
      year,
      creditor: clampStr(creditor, 140),
      category: clampStr(category, 60),
      dueDay: Math.min(31, Math.max(1, Math.trunc(dueDay))),
      months,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, "users", ownerId, "monthlyBills", billId), {
      ownerId,
      period: `${year}-${currentMonthKey}`,
      creditor: clampStr(creditor, 140),
      category: clampStr(category, 60),
      dueDate: clampDueDate(year, currentMonthNum, dueDay),
      expectedCents: Math.max(0, Math.trunc(expectedCents)),
      paidDate: null,
      paidCents: null,
      isSettled: false,
      sourceAnnualId: id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      await persistAnnualCategoryHistory(ownerId, year, {
        ...state,
        annualExpenses: [
          ...state.annualExpenses,
          { id, year, creditor, category, dueDay, months },
        ],
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/annualExpenses/${id}`);
    }
  };

  const payMonthlyBill: OrionContextValue["payMonthlyBill"] = async (
    billId,
    paidCents,
    paidDate,
    isSettled,
    note,
    accountId,
    options,
  ) => {
    const ownerId = requireUid();
    const idemKey = options?.idempotencyKey;
    if (idemKey) {
      if (inFlightKeysRef.current.has(idemKey)) return;
      if (state.paymentEvents.some((ev) => ev.idempotencyKey === idemKey)) return;
      inFlightKeysRef.current.add(idemKey);
    }

    const target = state.monthlyBills.find((b) => b.id === billId);
    const linkedInst =
      target?.contractId && target.installmentNumber != null
        ? state.payableInstallments.find(
            (i) => i.contractId === target.contractId && i.number === target.installmentNumber,
          )
        : undefined;
    const annIdCandidate =
      target?.sourceAnnualId ??
      (target?.contractId
        ? state.annualExpenses.find((a) => a.sourceContractId === target.contractId)?.id
        : undefined);

    const safeDate = validIsoDate(paidDate);
    const cashNow = Math.max(0, Math.trunc(paidCents));
    const discountNow = Math.max(0, Math.trunc(options?.discountCents ?? 0));
    const surchargeNow = Math.max(0, Math.trunc(options?.surchargeCents ?? 0));
    const chosenAccountId = accountId ? clampStr(accountId, 128) : null;
    const bankTxId = options?.bankTransactionId ? clampStr(options.bankTransactionId, 128) : null;
    const incomingAtts = sanitizeAttachments(options?.attachments);
    const eventId = uid("pevp");
    let finalBillPaidCents = cashNow;

    try {
      await runTransaction(db, async (tx) => {
        const billRef = doc(db, "users", ownerId, "monthlyBills", billId);
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists()) throw new Error("Conta mensal não encontrada.");
        const bd = billSnap.data() as DocumentData;

        const instSnap = linkedInst
          ? await tx.get(doc(db, "users", ownerId, "payableInstallments", linkedInst.id))
          : null;
        const annSnap = annIdCandidate
          ? await tx.get(doc(db, "users", ownerId, "annualExpenses", annIdCandidate))
          : null;
        const bankSnap =
          !bankTxId && chosenAccountId && cashNow > 0
            ? await tx.get(doc(db, "users", ownerId, "banks", chosenAccountId))
            : null;
        const bankTxSnap = bankTxId
          ? await tx.get(doc(db, "users", ownerId, "transactions", bankTxId))
          : null;

        const prevPaid = !bd["isSettled"] ? Number(bd["paidCents"] ?? 0) : 0;
        const newTotalPaid = prevPaid + cashNow;
        finalBillPaidCents = newTotalPaid;
        const totalDiscount = Number(bd["discountCents"] ?? 0) + discountNow;
        const totalSurcharge = Number(bd["surchargeCents"] ?? 0) + surchargeNow;
        const settled = Boolean(isSettled);
        const finalNote =
          note !== undefined ? clampStr(note, 300) : (typeof bd["note"] === "string" ? bd["note"] : "");
        const mergedAtts = sanitizeAttachments([
          ...((bd["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
          ...incomingAtts,
        ]);

        tx.update(
          billRef,
          stripUndefined({
            paidCents: newTotalPaid,
            paidDate: safeDate,
            isSettled: settled,
            discountCents: totalDiscount > 0 ? totalDiscount : null,
            surchargeCents: totalSurcharge > 0 ? totalSurcharge : null,
            note: finalNote || undefined,
            accountId: chosenAccountId ?? (typeof bd["accountId"] === "string" ? bd["accountId"] : null),
            bankTransactionId:
              bankTxId ?? (typeof bd["bankTransactionId"] === "string" ? bd["bankTransactionId"] : null),
            attachments: mergedAtts.length > 0 ? mergedAtts : undefined,
            updatedAt: serverTimestamp(),
          }),
        );

        if (instSnap?.exists()) {
          const idata = instSnap.data() as DocumentData;
          const instMergedAtts = sanitizeAttachments([
            ...((idata["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
            ...incomingAtts,
          ]);
          tx.update(
            instSnap.ref,
            stripUndefined({
              paidCents: newTotalPaid,
              paidDate: safeDate,
              isSettled: settled,
              discountCents: totalDiscount > 0 ? totalDiscount : null,
              surchargeCents: totalSurcharge > 0 ? totalSurcharge : null,
              note: finalNote || undefined,
              accountId: chosenAccountId ?? (typeof idata["accountId"] === "string" ? idata["accountId"] : null),
              bankTransactionId: bankTxId ?? (typeof idata["bankTransactionId"] === "string" ? idata["bankTransactionId"] : null),
              attachments: instMergedAtts.length > 0 ? instMergedAtts : undefined,
              updatedAt: serverTimestamp(),
            }),
          );
        }

        if (annSnap?.exists()) {
          const ad = annSnap.data() as DocumentData;
          const period = String(bd["period"] ?? "");
          const monthKey = period.slice(5, 7);
          const months = (ad["months"] as Record<string, AnnualCellState>) ?? {};
          const prevCell = months[monthKey] ?? {
            expectedCents: Number(bd["expectedCents"] ?? 0),
            paidCents: null,
            paidDate: null,
            isSettled: false,
          };
          tx.update(annSnap.ref, {
            months: {
              ...months,
              [monthKey]: stripUndefined({
                ...prevCell,
                paidCents: newTotalPaid,
                paidDate: safeDate,
                isSettled: settled,
                ...(finalNote ? { note: finalNote } : {}),
              }),
            },
            updatedAt: serverTimestamp(),
          });
        }

        if (bankSnap?.exists()) {
          tx.update(bankSnap.ref, {
            balanceCents: Math.trunc(Number(bankSnap.data()["balanceCents"] ?? 0) - cashNow),
            updatedAt: serverTimestamp(),
          });
        }

        if (bankTxSnap?.exists()) {
          tx.update(bankTxSnap.ref, {
            reconciledEventId: eventId,
            updatedAt: serverTimestamp(),
          });
        }

        const kind: PaymentEventKind = options?.isEarlyPayoff
          ? "quitacao_antecipada"
          : settled
            ? "pagamento"
            : "parcial";

        tx.set(
          doc(db, "users", ownerId, "paymentEvents", eventId),
          stripUndefined({
            ownerId,
            billId,
            installmentId: linkedInst?.id ?? null,
            contractId: (bd["contractId"] as string | null) ?? null,
            annualRowId: annIdCandidate ?? null,
            period: String(bd["period"] ?? "") || null,
            cardId: (bd["cardId"] as string | null) ?? null,
            creditor: clampStr(String(bd["creditor"] ?? "Credor"), 140) || "Credor",
            category: clampStr(String(bd["category"] ?? "Despesas"), 60),
            dueDate: clampStr(String(bd["dueDate"] ?? ""), 10),
            expectedCents: Math.max(0, Math.trunc(Number(bd["expectedCents"] ?? 0))),
            paidCents: cashNow,
            paidDate: safeDate,
            discountCents: discountNow > 0 ? discountNow : null,
            surchargeCents: surchargeNow > 0 ? surchargeNow : null,
            isSettled: settled,
            accountId: chosenAccountId,
            bankTransactionId: bankTxId,
            idempotencyKey: idemKey ? clampStr(idemKey, 128) : undefined,
            kind,
            reason: options?.isEarlyPayoff
              ? "Quitação antecipada registrada"
              : settled
                ? prevPaid > 0
                  ? "Quitação complementar registrada"
                  : "Pagamento registrado"
                : "Pagamento parcial registrado",
            eventCreatedAt: new Date().toISOString(),
            beforeData: {
              paidDate: typeof bd["paidDate"] === "string" ? bd["paidDate"] : null,
              paidCents: typeof bd["paidCents"] === "number" ? bd["paidCents"] : null,
              expectedCents: Number(bd["expectedCents"] ?? 0),
              isSettled: Boolean(bd["isSettled"]),
              accountId: typeof bd["accountId"] === "string" ? bd["accountId"] : null,
              bankTransactionId: typeof bd["bankTransactionId"] === "string" ? bd["bankTransactionId"] : null,
              note: typeof bd["note"] === "string" ? bd["note"] : undefined,
            },
            afterData: {
              paidDate: safeDate,
              paidCents: cashNow,
              expectedCents: Number(bd["expectedCents"] ?? 0),
              isSettled: settled,
              discountCents: discountNow > 0 ? discountNow : null,
              surchargeCents: surchargeNow > 0 ? surchargeNow : null,
              accountId: chosenAccountId,
              bankTransactionId: bankTxId,
              note: finalNote || undefined,
            },
            attachments: incomingAtts.length > 0 ? incomingAtts : undefined,
            note: finalNote || undefined,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      });

      if (target) {
        const billYear = Number(target.period.slice(0, 4));
        if (billYear >= 2000 && billYear <= 2100) {
          await persistAnnualCategoryHistory(ownerId, billYear, {
            ...state,
            monthlyBills: state.monthlyBills.map((b) =>
              b.id === billId ? { ...b, paidCents: finalBillPaidCents, paidDate: safeDate, isSettled } : b,
            ),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/monthlyBills/${billId}`);
    } finally {
      if (idemKey) inFlightKeysRef.current.delete(idemKey);
    }
  };

  const payPayableInstallment: OrionContextValue["payPayableInstallment"] = async (
    installmentId,
    paidCents,
    paidDate,
    isSettled,
    note,
    accountId,
    options,
  ) => {
    const ownerId = requireUid();
    const idemKey = options?.idempotencyKey;
    if (idemKey) {
      if (inFlightKeysRef.current.has(idemKey)) return;
      if (state.paymentEvents.some((ev) => ev.idempotencyKey === idemKey)) return;
      inFlightKeysRef.current.add(idemKey);
    }

    const instCandidate = state.payableInstallments.find((i) => i.id === installmentId);
    const contractCandidate = instCandidate
      ? state.payableContracts.find((c) => c.id === instCandidate.contractId)
      : undefined;
    const linkedBill = instCandidate
      ? state.monthlyBills.find(
          (b) =>
            b.contractId === instCandidate.contractId &&
            b.installmentNumber === instCandidate.number,
        )
      : undefined;
    const linkedAnn = instCandidate
      ? state.annualExpenses.find((a) => a.sourceContractId === instCandidate.contractId)
      : undefined;

    const safeDate = validIsoDate(paidDate);
    const cashNow = Math.max(0, Math.trunc(paidCents));
    const discountNow = Math.max(0, Math.trunc(options?.discountCents ?? 0));
    const surchargeNow = Math.max(0, Math.trunc(options?.surchargeCents ?? 0));
    const chosenAccountId = accountId ? clampStr(accountId, 128) : null;
    const bankTxId = options?.bankTransactionId ? clampStr(options.bankTransactionId, 128) : null;
    const incomingAtts = sanitizeAttachments(options?.attachments);
    const eventId = uid("pevi");

    try {
      await runTransaction(db, async (tx) => {
        const instRef = doc(db, "users", ownerId, "payableInstallments", installmentId);
        const instSnap = await tx.get(instRef);
        if (!instSnap.exists()) throw new Error("Parcela do contrato não encontrada.");
        const idata = instSnap.data() as DocumentData;

        const billSnap = linkedBill
          ? await tx.get(doc(db, "users", ownerId, "monthlyBills", linkedBill.id))
          : null;
        const annSnap = linkedAnn
          ? await tx.get(doc(db, "users", ownerId, "annualExpenses", linkedAnn.id))
          : null;
        const bankSnap =
          !bankTxId && chosenAccountId && cashNow > 0
            ? await tx.get(doc(db, "users", ownerId, "banks", chosenAccountId))
            : null;
        const bankTxSnap = bankTxId
          ? await tx.get(doc(db, "users", ownerId, "transactions", bankTxId))
          : null;

        const prevPaid = !idata["isSettled"] ? Number(idata["paidCents"] ?? 0) : 0;
        const newTotalPaid = prevPaid + cashNow;
        const totalDiscount = Number(idata["discountCents"] ?? 0) + discountNow;
        const totalSurcharge = Number(idata["surchargeCents"] ?? 0) + surchargeNow;
        const settled = Boolean(isSettled);
        const finalNote =
          note !== undefined ? clampStr(note, 300) : (typeof idata["note"] === "string" ? idata["note"] : "");
        const mergedAtts = sanitizeAttachments([
          ...((idata["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
          ...incomingAtts,
        ]);

        tx.update(
          instRef,
          stripUndefined({
            paidCents: newTotalPaid,
            paidDate: safeDate,
            isSettled: settled,
            discountCents: totalDiscount > 0 ? totalDiscount : null,
            surchargeCents: totalSurcharge > 0 ? totalSurcharge : null,
            note: finalNote || undefined,
            accountId: chosenAccountId ?? (typeof idata["accountId"] === "string" ? idata["accountId"] : null),
            bankTransactionId: bankTxId ?? (typeof idata["bankTransactionId"] === "string" ? idata["bankTransactionId"] : null),
            attachments: mergedAtts.length > 0 ? mergedAtts : undefined,
            updatedAt: serverTimestamp(),
          }),
        );

        if (billSnap?.exists()) {
          const bd = billSnap.data() as DocumentData;
          const bAtts = sanitizeAttachments([
            ...((bd["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
            ...incomingAtts,
          ]);
          tx.update(
            billSnap.ref,
            stripUndefined({
              paidCents: newTotalPaid,
              paidDate: safeDate,
              isSettled: settled,
              discountCents: totalDiscount > 0 ? totalDiscount : null,
              surchargeCents: totalSurcharge > 0 ? totalSurcharge : null,
              note: finalNote || undefined,
              accountId: chosenAccountId ?? (typeof bd["accountId"] === "string" ? bd["accountId"] : null),
              bankTransactionId: bankTxId ?? (typeof bd["bankTransactionId"] === "string" ? bd["bankTransactionId"] : null),
              attachments: bAtts.length > 0 ? bAtts : undefined,
              updatedAt: serverTimestamp(),
            }),
          );
        }

        const period = String(idata["dueDate"] ?? "").slice(0, 7);
        if (annSnap?.exists() && period.length === 7) {
          const ad = annSnap.data() as DocumentData;
          const monthKey = period.slice(5, 7);
          const months = (ad["months"] as Record<string, AnnualCellState>) ?? {};
          const prevCell = months[monthKey] ?? {
            expectedCents: Number(idata["expectedCents"] ?? 0),
            paidCents: null,
            paidDate: null,
            isSettled: false,
          };
          tx.update(annSnap.ref, {
            months: {
              ...months,
              [monthKey]: stripUndefined({
                ...prevCell,
                paidCents: newTotalPaid,
                paidDate: safeDate,
                isSettled: settled,
                ...(finalNote ? { note: finalNote } : {}),
              }),
            },
            updatedAt: serverTimestamp(),
          });
        }

        if (bankSnap?.exists()) {
          tx.update(bankSnap.ref, {
            balanceCents: Math.trunc(Number(bankSnap.data()["balanceCents"] ?? 0) - cashNow),
            updatedAt: serverTimestamp(),
          });
        }
        if (bankTxSnap?.exists()) {
          tx.update(bankTxSnap.ref, {
            reconciledEventId: eventId,
            updatedAt: serverTimestamp(),
          });
        }

        const kind: PaymentEventKind = options?.isEarlyPayoff
          ? "quitacao_antecipada"
          : settled
            ? "pagamento"
            : "parcial";
        const creditorLabel = contractCandidate
          ? `${contractCandidate.name} · Parcela #${idata["number"]}`
          : `Parcela #${idata["number"]}`;

        tx.set(
          doc(db, "users", ownerId, "paymentEvents", eventId),
          stripUndefined({
            ownerId,
            billId: linkedBill?.id ?? null,
            installmentId,
            contractId: String(idata["contractId"] ?? "") || null,
            annualRowId: linkedAnn?.id ?? null,
            period: period || null,
            creditor: clampStr(creditorLabel, 140) || "Credor",
            category: "Contrato Parcelado",
            dueDate: clampStr(String(idata["dueDate"] ?? ""), 10),
            expectedCents: Math.max(0, Math.trunc(Number(idata["expectedCents"] ?? 0))),
            paidCents: cashNow,
            paidDate: safeDate,
            discountCents: discountNow > 0 ? discountNow : null,
            surchargeCents: surchargeNow > 0 ? surchargeNow : null,
            isSettled: settled,
            accountId: chosenAccountId,
            bankTransactionId: bankTxId,
            idempotencyKey: idemKey ? clampStr(idemKey, 128) : undefined,
            kind,
            reason: options?.isEarlyPayoff
              ? "Quitação antecipada de parcela"
              : settled
                ? "Pagamento de parcela confirmado"
                : "Pagamento parcial de parcela",
            eventCreatedAt: new Date().toISOString(),
            beforeData: {
              paidDate: typeof idata["paidDate"] === "string" ? idata["paidDate"] : null,
              paidCents: typeof idata["paidCents"] === "number" ? idata["paidCents"] : null,
              expectedCents: Number(idata["expectedCents"] ?? 0),
              isSettled: Boolean(idata["isSettled"]),
              accountId: typeof idata["accountId"] === "string" ? idata["accountId"] : null,
              bankTransactionId: typeof idata["bankTransactionId"] === "string" ? idata["bankTransactionId"] : null,
              note: typeof idata["note"] === "string" ? idata["note"] : undefined,
            },
            afterData: {
              paidDate: safeDate,
              paidCents: cashNow,
              expectedCents: Number(idata["expectedCents"] ?? 0),
              isSettled: settled,
              discountCents: discountNow > 0 ? discountNow : null,
              surchargeCents: surchargeNow > 0 ? surchargeNow : null,
              accountId: chosenAccountId,
              bankTransactionId: bankTxId,
              note: finalNote || undefined,
            },
            attachments: incomingAtts.length > 0 ? incomingAtts : undefined,
            note: finalNote || undefined,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `users/${ownerId}/payableInstallments/${installmentId}`,
      );
    } finally {
      if (idemKey) inFlightKeysRef.current.delete(idemKey);
    }
  };

  const correctPaymentEvent: OrionContextValue["correctPaymentEvent"] = async (input) => {
    const ownerId = requireUid();
    const idemKey = input.idempotencyKey;
    if (idemKey) {
      if (inFlightKeysRef.current.has(idemKey)) return;
      if (state.paymentEvents.some((ev) => ev.idempotencyKey === idemKey)) return;
      inFlightKeysRef.current.add(idemKey);
    }

    const safeDate = validIsoDate(input.paidDate);
    const newCash = Math.max(0, Math.trunc(input.paidCents));
    const newDiscount = Math.max(0, Math.trunc(input.discountCents ?? 0));
    const newSurcharge = Math.max(0, Math.trunc(input.surchargeCents ?? 0));
    const newAccountId = input.accountId ? clampStr(input.accountId, 128) : null;
    const newBankTxId = input.bankTransactionId ? clampStr(input.bankTransactionId, 128) : null;
    const newAtts = sanitizeAttachments(input.attachments);
    const newEventId = uid("pevcor");

    try {
      await runTransaction(db, async (tx) => {
        const targetEvSnap = input.paymentEventId
          ? await tx.get(doc(db, "users", ownerId, "paymentEvents", input.paymentEventId))
          : null;
        const targetEvData = targetEvSnap?.exists() ? (targetEvSnap.data() as DocumentData) : null;

        const billId = input.billId ?? (typeof targetEvData?.["billId"] === "string" ? (targetEvData["billId"] as string) : undefined);
        const installmentId = input.installmentId ?? (typeof targetEvData?.["installmentId"] === "string" ? (targetEvData["installmentId"] as string) : undefined);
        const annualRowId = input.annualRowId ?? (typeof targetEvData?.["annualRowId"] === "string" ? (targetEvData["annualRowId"] as string) : undefined);
        const period = input.period ?? (typeof targetEvData?.["period"] === "string" ? (targetEvData["period"] as string) : undefined);

        const billSnap = billId ? await tx.get(doc(db, "users", ownerId, "monthlyBills", billId)) : null;
        const instSnap = installmentId
          ? await tx.get(doc(db, "users", ownerId, "payableInstallments", installmentId))
          : null;
        const annSnap = annualRowId
          ? await tx.get(doc(db, "users", ownerId, "annualExpenses", annualRowId))
          : null;

        const bd = billSnap?.exists() ? (billSnap.data() as DocumentData) : null;
        const idata = instSnap?.exists() ? (instSnap.data() as DocumentData) : null;
        const ad = annSnap?.exists() ? (annSnap.data() as DocumentData) : null;

        const oldCash = Number(targetEvData?.["paidCents"] ?? bd?.["paidCents"] ?? idata?.["paidCents"] ?? 0);
        const oldAccountId =
          targetEvData && "accountId" in targetEvData
            ? ((targetEvData["accountId"] as string | null) ?? null)
            : ((bd?.["accountId"] as string | null) ?? (idata?.["accountId"] as string | null) ?? null);
        const oldBankTxId =
          targetEvData && "bankTransactionId" in targetEvData
            ? ((targetEvData["bankTransactionId"] as string | null) ?? null)
            : ((bd?.["bankTransactionId"] as string | null) ?? (idata?.["bankTransactionId"] as string | null) ?? null);

        const oldBankRef =
          oldAccountId && !oldBankTxId && oldCash > 0
            ? doc(db, "users", ownerId, "banks", oldAccountId)
            : null;
        const newBankRef =
          newAccountId && !newBankTxId && newCash > 0
            ? doc(db, "users", ownerId, "banks", newAccountId)
            : null;
        const sameBankRef = oldBankRef && newBankRef && oldBankRef.id === newBankRef.id;
        const oldBankSnap = oldBankRef ? await tx.get(oldBankRef) : null;
        const newBankSnap = newBankRef && !sameBankRef ? await tx.get(newBankRef) : null;

        const oldTxSnap =
          oldBankTxId && oldBankTxId !== newBankTxId
            ? await tx.get(doc(db, "users", ownerId, "transactions", oldBankTxId))
            : null;
        const newTxSnap =
          newBankTxId && newBankTxId !== oldBankTxId
            ? await tx.get(doc(db, "users", ownerId, "transactions", newBankTxId))
            : null;

        // Calculate total paid across other active events for the same commitment
        const otherActive = resolveActivePaymentEvents(state.paymentEvents).filter((ev) => {
          if (ev.id === input.paymentEventId) return false;
          if (billId && ev.billId === billId) return true;
          if (installmentId && ev.installmentId === installmentId) return true;
          if (annualRowId && period && ev.annualRowId === annualRowId && ev.period === period) return true;
          return false;
        });
        const otherPaid = otherActive.reduce((s, ev) => s + Math.max(0, ev.paidCents), 0);
        const totalPaidCommitment = Math.max(0, otherPaid + newCash);
        const finalNote = clampStr(input.note, 300);

        if (billSnap?.exists() && bd) {
          const mergedAtts = sanitizeAttachments([
            ...newAtts,
            ...((bd["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
          ]);
          tx.update(
            billSnap.ref,
            stripUndefined({
              ...(input.expectedCents !== undefined
                ? { expectedCents: Math.max(0, Math.trunc(input.expectedCents)) }
                : {}),
              paidCents: totalPaidCommitment,
              paidDate: safeDate,
              isSettled: input.isSettled,
              discountCents: newDiscount > 0 ? newDiscount : null,
              surchargeCents: newSurcharge > 0 ? newSurcharge : null,
              accountId: newAccountId,
              bankTransactionId: newBankTxId,
              note: finalNote,
              attachments: mergedAtts.length > 0 ? mergedAtts : undefined,
              updatedAt: serverTimestamp(),
            }),
          );
        }

        if (instSnap?.exists() && idata) {
          const mergedAtts = sanitizeAttachments([
            ...newAtts,
            ...((idata["attachments"] as PaymentAttachmentRef[] | undefined) ?? []),
          ]);
          tx.update(
            instSnap.ref,
            stripUndefined({
              paidCents: totalPaidCommitment,
              paidDate: safeDate,
              isSettled: input.isSettled,
              discountCents: newDiscount > 0 ? newDiscount : null,
              surchargeCents: newSurcharge > 0 ? newSurcharge : null,
              accountId: newAccountId,
              bankTransactionId: newBankTxId,
              note: finalNote,
              attachments: mergedAtts.length > 0 ? mergedAtts : undefined,
              updatedAt: serverTimestamp(),
            }),
          );
        }

        if (annSnap?.exists() && ad && period && period.length === 7) {
          const monthKey = period.slice(5, 7);
          const months = (ad["months"] as Record<string, AnnualCellState>) ?? {};
          const prevCell = months[monthKey] ?? {
            expectedCents: Number(input.expectedCents ?? bd?.["expectedCents"] ?? 0),
            paidCents: null,
            paidDate: null,
            isSettled: false,
          };
          tx.update(annSnap.ref, {
            months: {
              ...months,
              [monthKey]: stripUndefined({
                ...prevCell,
                ...(input.expectedCents !== undefined
                  ? { expectedCents: Math.max(0, Math.trunc(input.expectedCents)) }
                  : {}),
                paidCents: totalPaidCommitment,
                paidDate: safeDate,
                isSettled: input.isSettled,
                note: finalNote || undefined,
              }),
            },
            updatedAt: serverTimestamp(),
          });
        }

        // Bank balance delta (cash outflow reduces balance)
        if (sameBankRef && oldBankSnap?.exists()) {
          const cashDelta = newCash - oldCash;
          if (cashDelta !== 0) {
            tx.update(oldBankSnap.ref, {
              balanceCents: Math.trunc(Number(oldBankSnap.data()["balanceCents"] ?? 0) - cashDelta),
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          if (oldBankSnap?.exists() && oldCash > 0) {
            tx.update(oldBankSnap.ref, {
              balanceCents: Math.trunc(Number(oldBankSnap.data()["balanceCents"] ?? 0) + oldCash),
              updatedAt: serverTimestamp(),
            });
          }
          if (newBankSnap?.exists() && newCash > 0) {
            tx.update(newBankSnap.ref, {
              balanceCents: Math.trunc(Number(newBankSnap.data()["balanceCents"] ?? 0) - newCash),
              updatedAt: serverTimestamp(),
            });
          }
        }

        if (oldTxSnap?.exists()) {
          tx.update(oldTxSnap.ref, { reconciledEventId: null, updatedAt: serverTimestamp() });
        }
        if (newTxSnap?.exists()) {
          tx.update(newTxSnap.ref, { reconciledEventId: newEventId, updatedAt: serverTimestamp() });
        }

        const creditor =
          clampStr(
            String(
              targetEvData?.["creditor"] ??
                bd?.["creditor"] ??
                ad?.["creditor"] ??
                (idata ? `Parcela #${idata["number"]}` : "Credor"),
            ),
            140,
          ) || "Credor";
        const expected = Math.max(
          0,
          Math.trunc(
            input.expectedCents ??
              Number(targetEvData?.["expectedCents"] ?? bd?.["expectedCents"] ?? idata?.["expectedCents"] ?? 0),
          ),
        );
        const dueDate = clampStr(
          String(targetEvData?.["dueDate"] ?? bd?.["dueDate"] ?? idata?.["dueDate"] ?? safeDate ?? ""),
          10,
        );

        tx.set(
          doc(db, "users", ownerId, "paymentEvents", newEventId),
          stripUndefined({
            ownerId,
            billId: billId ?? null,
            installmentId: installmentId ?? null,
            contractId: (targetEvData?.["contractId"] as string | null) ?? (bd?.["contractId"] as string | null) ?? (idata?.["contractId"] as string | null) ?? null,
            annualRowId: annualRowId ?? null,
            period: period ?? null,
            cardId: (targetEvData?.["cardId"] as string | null) ?? (bd?.["cardId"] as string | null) ?? null,
            creditor,
            category: clampStr(String(targetEvData?.["category"] ?? bd?.["category"] ?? ad?.["category"] ?? "Despesas"), 60),
            dueDate,
            expectedCents: expected,
            paidCents: newCash,
            paidDate: safeDate,
            discountCents: newDiscount > 0 ? newDiscount : null,
            surchargeCents: newSurcharge > 0 ? newSurcharge : null,
            isSettled: input.isSettled,
            accountId: newAccountId,
            bankTransactionId: newBankTxId,
            targetEventId: input.paymentEventId ?? null,
            idempotencyKey: idemKey ? clampStr(idemKey, 128) : undefined,
            kind: "correcao",
            reason: clampStr(input.reason || "Correção manual de pagamento", 300),
            eventCreatedAt: new Date().toISOString(),
            beforeData: {
              paidDate: (targetEvData?.["paidDate"] as string | null) ?? (bd?.["paidDate"] as string | null) ?? null,
              paidCents: oldCash,
              expectedCents: expected,
              isSettled: Boolean(targetEvData?.["isSettled"] ?? bd?.["isSettled"] ?? idata?.["isSettled"]),
              accountId: oldAccountId,
              bankTransactionId: oldBankTxId,
              note: typeof bd?.["note"] === "string" ? (bd["note"] as string) : undefined,
            },
            afterData: {
              paidDate: safeDate,
              paidCents: newCash,
              expectedCents: expected,
              isSettled: input.isSettled,
              discountCents: newDiscount > 0 ? newDiscount : null,
              surchargeCents: newSurcharge > 0 ? newSurcharge : null,
              accountId: newAccountId,
              bankTransactionId: newBankTxId,
              note: finalNote || undefined,
            },
            attachments: newAtts.length > 0 ? newAtts : undefined,
            note: finalNote || undefined,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/paymentEvents/${newEventId}`);
    } finally {
      if (idemKey) inFlightKeysRef.current.delete(idemKey);
    }
  };

  const reversePaymentEvent: OrionContextValue["reversePaymentEvent"] = async (input) => {
    const ownerId = requireUid();
    const idemKey = input.idempotencyKey;
    if (idemKey) {
      if (inFlightKeysRef.current.has(idemKey)) return;
      if (state.paymentEvents.some((ev) => ev.idempotencyKey === idemKey)) return;
      inFlightKeysRef.current.add(idemKey);
    }

    const revEventId = uid("pevest");
    try {
      await runTransaction(db, async (tx) => {
        const targetEvSnap = input.paymentEventId
          ? await tx.get(doc(db, "users", ownerId, "paymentEvents", input.paymentEventId))
          : null;
        const targetEvData = targetEvSnap?.exists() ? (targetEvSnap.data() as DocumentData) : null;

        const billId = input.billId ?? (typeof targetEvData?.["billId"] === "string" ? (targetEvData["billId"] as string) : undefined);
        const installmentId = input.installmentId ?? (typeof targetEvData?.["installmentId"] === "string" ? (targetEvData["installmentId"] as string) : undefined);
        const annualRowId = input.annualRowId ?? (typeof targetEvData?.["annualRowId"] === "string" ? (targetEvData["annualRowId"] as string) : undefined);
        const period = input.period ?? (typeof targetEvData?.["period"] === "string" ? (targetEvData["period"] as string) : undefined);

        const billSnap = billId ? await tx.get(doc(db, "users", ownerId, "monthlyBills", billId)) : null;
        const instSnap = installmentId
          ? await tx.get(doc(db, "users", ownerId, "payableInstallments", installmentId))
          : null;
        const annSnap = annualRowId
          ? await tx.get(doc(db, "users", ownerId, "annualExpenses", annualRowId))
          : null;

        const bd = billSnap?.exists() ? (billSnap.data() as DocumentData) : null;
        const idata = instSnap?.exists() ? (instSnap.data() as DocumentData) : null;
        const ad = annSnap?.exists() ? (annSnap.data() as DocumentData) : null;

        const oldCash = Number(targetEvData?.["paidCents"] ?? bd?.["paidCents"] ?? idata?.["paidCents"] ?? 0);
        const oldAccountId =
          targetEvData && "accountId" in targetEvData
            ? ((targetEvData["accountId"] as string | null) ?? null)
            : ((bd?.["accountId"] as string | null) ?? (idata?.["accountId"] as string | null) ?? null);
        const oldBankTxId =
          targetEvData && "bankTransactionId" in targetEvData
            ? ((targetEvData["bankTransactionId"] as string | null) ?? null)
            : ((bd?.["bankTransactionId"] as string | null) ?? (idata?.["bankTransactionId"] as string | null) ?? null);

        const oldBankSnap =
          oldAccountId && !oldBankTxId && oldCash > 0
            ? await tx.get(doc(db, "users", ownerId, "banks", oldAccountId))
            : null;
        const oldTxSnap = oldBankTxId
          ? await tx.get(doc(db, "users", ownerId, "transactions", oldBankTxId))
          : null;

        const remainingActive = resolveActivePaymentEvents(state.paymentEvents).filter((ev) => {
          if (ev.id === input.paymentEventId) return false;
          if (billId && ev.billId === billId) return true;
          if (installmentId && ev.installmentId === installmentId) return true;
          if (annualRowId && period && ev.annualRowId === annualRowId && ev.period === period) return true;
          return false;
        });
        const remainingPaid = remainingActive.reduce((s, ev) => s + Math.max(0, ev.paidCents), 0);
        const latestRemaining = remainingActive[remainingActive.length - 1];
        const nextPaidDate = remainingPaid > 0 ? (latestRemaining?.paidDate ?? null) : null;

        if (billSnap?.exists()) {
          tx.update(
            billSnap.ref,
            stripUndefined({
              paidCents: remainingPaid > 0 ? remainingPaid : null,
              paidDate: nextPaidDate,
              isSettled: false,
              discountCents: remainingPaid > 0 ? (latestRemaining?.discountCents ?? null) : null,
              surchargeCents: remainingPaid > 0 ? (latestRemaining?.surchargeCents ?? null) : null,
              accountId: remainingPaid > 0 ? (latestRemaining?.accountId ?? null) : null,
              bankTransactionId: remainingPaid > 0 ? (latestRemaining?.bankTransactionId ?? null) : null,
              updatedAt: serverTimestamp(),
            }),
          );
        }

        if (instSnap?.exists()) {
          tx.update(
            instSnap.ref,
            stripUndefined({
              paidCents: remainingPaid > 0 ? remainingPaid : null,
              paidDate: nextPaidDate,
              isSettled: false,
              discountCents: remainingPaid > 0 ? (latestRemaining?.discountCents ?? null) : null,
              surchargeCents: remainingPaid > 0 ? (latestRemaining?.surchargeCents ?? null) : null,
              accountId: remainingPaid > 0 ? (latestRemaining?.accountId ?? null) : null,
              bankTransactionId: remainingPaid > 0 ? (latestRemaining?.bankTransactionId ?? null) : null,
              updatedAt: serverTimestamp(),
            }),
          );
        }

        if (annSnap?.exists() && ad && period && period.length === 7) {
          const monthKey = period.slice(5, 7);
          const months = (ad["months"] as Record<string, AnnualCellState>) ?? {};
          const prevCell = months[monthKey];
          if (prevCell) {
            tx.update(annSnap.ref, {
              months: {
                ...months,
                [monthKey]: {
                  ...prevCell,
                  paidCents: remainingPaid > 0 ? remainingPaid : null,
                  paidDate: nextPaidDate,
                  isSettled: false,
                },
              },
              updatedAt: serverTimestamp(),
            });
          }
        }

        if (oldBankSnap?.exists() && oldCash > 0) {
          tx.update(oldBankSnap.ref, {
            balanceCents: Math.trunc(Number(oldBankSnap.data()["balanceCents"] ?? 0) + oldCash),
            updatedAt: serverTimestamp(),
          });
        }
        if (oldTxSnap?.exists()) {
          tx.update(oldTxSnap.ref, { reconciledEventId: null, updatedAt: serverTimestamp() });
        }

        const creditor =
          clampStr(
            String(targetEvData?.["creditor"] ?? bd?.["creditor"] ?? ad?.["creditor"] ?? "Credor"),
            140,
          ) || "Credor";
        const expected = Math.max(
          0,
          Math.trunc(Number(targetEvData?.["expectedCents"] ?? bd?.["expectedCents"] ?? idata?.["expectedCents"] ?? 0)),
        );

        tx.set(
          doc(db, "users", ownerId, "paymentEvents", revEventId),
          stripUndefined({
            ownerId,
            billId: billId ?? null,
            installmentId: installmentId ?? null,
            contractId: (targetEvData?.["contractId"] as string | null) ?? (bd?.["contractId"] as string | null) ?? null,
            annualRowId: annualRowId ?? null,
            period: period ?? null,
            creditor,
            category: clampStr(String(targetEvData?.["category"] ?? bd?.["category"] ?? "Despesas"), 60),
            dueDate: clampStr(String(targetEvData?.["dueDate"] ?? bd?.["dueDate"] ?? idata?.["dueDate"] ?? ""), 10),
            expectedCents: expected,
            paidCents: 0,
            paidDate: null,
            isSettled: false,
            targetEventId: input.paymentEventId ?? null,
            idempotencyKey: idemKey ? clampStr(idemKey, 128) : undefined,
            kind: "estorno",
            reason: clampStr(input.reason || "Estorno de pagamento", 300),
            eventCreatedAt: new Date().toISOString(),
            beforeData: {
              paidDate: (targetEvData?.["paidDate"] as string | null) ?? (bd?.["paidDate"] as string | null) ?? null,
              paidCents: oldCash,
              expectedCents: expected,
              isSettled: Boolean(targetEvData?.["isSettled"] ?? bd?.["isSettled"] ?? idata?.["isSettled"]),
              accountId: oldAccountId,
              bankTransactionId: oldBankTxId,
            },
            afterData: {
              paidDate: nextPaidDate,
              paidCents: remainingPaid > 0 ? remainingPaid : null,
              expectedCents: expected,
              isSettled: false,
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/paymentEvents/${revEventId}`);
    } finally {
      if (idemKey) inFlightKeysRef.current.delete(idemKey);
    }
  };

  const addMonthlyBill: OrionContextValue["addMonthlyBill"] = async (bill) => {
    const ownerId = requireUid();
    const id = uid("bill");
    const path = `users/${ownerId}/monthlyBills/${id}`;
    try {
      await setDoc(
        doc(db, "users", ownerId, "monthlyBills", id),
        stripUndefined({
          ownerId,
          period: bill.period,
          creditor: clampStr(bill.creditor, 140),
          category: clampStr(bill.category, 60),
          description: bill.description ? clampStr(bill.description, 200) : undefined,
          dueDate: bill.dueDate,
          expectedCents: Math.max(0, Math.trunc(bill.expectedCents)),
          paidDate: null,
          paidCents: null,
          isSettled: false,
          sourceAnnualId: bill.sourceAnnualId,
          isCardInvoice: bill.isCardInvoice,
          cardId: bill.cardId,
          note: bill.note ? clampStr(bill.note, 300) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      const billYear = Number(bill.period.slice(0, 4));
      if (billYear >= 2000 && billYear <= 2100) {
        await persistAnnualCategoryHistory(ownerId, billYear, {
          ...state,
          monthlyBills: [
            ...state.monthlyBills,
            { ...bill, id, paidDate: null, paidCents: null, isSettled: false },
          ],
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const uploadHistoryAttachment: OrionContextValue["uploadHistoryAttachment"] = async (
    file,
    linkRefId,
  ) => {
    const ownerId = requireUid();
    const allowedMime = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedMime.includes(file.type)) {
      throw new Error("Formato inválido. Envie apenas PDF, JPG, PNG ou WEBP.");
    }
    if (file.size >= 15 * 1024 * 1024) {
      throw new Error("O arquivo excede o limite de 15 MB.");
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "comprovante";
    const safeFolder = sanitizeId(linkRefId || "geral");
    const objectPath = `users/${ownerId}/fiscalReceipts/${safeFolder}/${Date.now()}-${safeName}`;
    const fileRef = storageRef(storage, objectPath);
    await uploadBytes(fileRef, file, { contentType: file.type });
    let documentUrl: string | undefined;
    try {
      documentUrl = await getDownloadURL(fileRef);
    } catch {
      documentUrl = undefined;
    }
    return {
      id: uid("att"),
      fileName: clampStr(file.name, 160),
      mimeType: clampStr(file.type, 80),
      sizeBytes: Math.trunc(file.size),
      storagePath: objectPath,
      documentUrl,
      uploadedAt: new Date().toISOString(),
    };
  };

  const attachToHistoryRow: OrionContextValue["attachToHistoryRow"] = async (row, attachment) => {
    const ownerId = requireUid();
    const cleanAtt = sanitizeAttachments([attachment])[0];
    if (!cleanAtt) return;
    const refs: Array<ReturnType<typeof doc>> = [];
    if (row.rawRefs.paymentEventId) {
      refs.push(doc(db, "users", ownerId, "paymentEvents", row.rawRefs.paymentEventId));
    }
    if (row.rawRefs.billId) {
      refs.push(doc(db, "users", ownerId, "monthlyBills", row.rawRefs.billId));
    }
    if (row.rawRefs.installmentId) {
      refs.push(doc(db, "users", ownerId, "payableInstallments", row.rawRefs.installmentId));
    }
    if (row.rawRefs.revenueEventId) {
      refs.push(doc(db, "users", ownerId, "revenueEvents", row.rawRefs.revenueEventId));
    }
    if (row.rawRefs.entryId) {
      refs.push(doc(db, "users", ownerId, "revenueEntries", row.rawRefs.entryId));
    }

    try {
      if (refs.length === 0 && row.direction === "payment") {
        const eventId = uid("pevatt");
        await setDoc(
          doc(db, "users", ownerId, "paymentEvents", eventId),
          stripUndefined({
            ownerId,
            annualRowId: row.rawRefs.annualRowId ?? null,
            period: row.rawRefs.period ?? null,
            creditor: clampStr(row.party, 140) || "Credor",
            category: clampStr(row.category, 60),
            dueDate: clampStr(row.dueDate ?? row.effectiveDate ?? "", 10),
            expectedCents: Math.max(0, Math.trunc(row.expectedCents)),
            paidCents: Math.max(0, Math.trunc(row.actualCents)),
            paidDate: validIsoDate(row.effectiveDate),
            discountCents: row.discountCents > 0 ? row.discountCents : null,
            surchargeCents: row.surchargeCents > 0 ? row.surchargeCents : null,
            isSettled: row.isSettled,
            accountId: row.accountId ?? null,
            bankTransactionId: row.bankTransactionId ?? null,
            kind: row.isSettled ? "pagamento" : "parcial",
            reason: "Comprovante anexado ao registro histórico",
            eventCreatedAt: new Date().toISOString(),
            attachments: [cleanAtt],
            note: row.observation ? clampStr(row.observation, 300) : undefined,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
        return;
      }

      await runTransaction(db, async (tx) => {
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        for (const s of snaps) {
          if (!s.exists()) continue;
          const prev = (s.data()["attachments"] as PaymentAttachmentRef[] | undefined) ?? [];
          const next = sanitizeAttachments([...prev, cleanAtt]);
          tx.update(s.ref, {
            attachments: next,
            updatedAt: serverTimestamp(),
          });
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/attachments/${row.id}`);
    }
  };

  const removeAttachmentFromHistoryRow: OrionContextValue["removeAttachmentFromHistoryRow"] = async (
    row,
    attachmentId,
  ) => {
    const ownerId = requireUid();
    const refs: Array<ReturnType<typeof doc>> = [];
    if (row.rawRefs.paymentEventId) {
      refs.push(doc(db, "users", ownerId, "paymentEvents", row.rawRefs.paymentEventId));
    }
    if (row.rawRefs.billId) {
      refs.push(doc(db, "users", ownerId, "monthlyBills", row.rawRefs.billId));
    }
    if (row.rawRefs.installmentId) {
      refs.push(doc(db, "users", ownerId, "payableInstallments", row.rawRefs.installmentId));
    }
    if (row.rawRefs.revenueEventId) {
      refs.push(doc(db, "users", ownerId, "revenueEvents", row.rawRefs.revenueEventId));
    }
    if (row.rawRefs.entryId) {
      refs.push(doc(db, "users", ownerId, "revenueEntries", row.rawRefs.entryId));
    }

    const linkedFiscalReceipt = state.fiscalReceipts.find((fr) => fr.id === attachmentId);
    let storagePathToDelete: string | undefined;
    try {
      if (linkedFiscalReceipt) {
        await updateDoc(doc(db, "users", ownerId, "fiscalReceipts", linkedFiscalReceipt.id), {
          linkedTransactionId: "",
          updatedAt: serverTimestamp(),
        });
        return;
      }

      await runTransaction(db, async (tx) => {
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        for (const s of snaps) {
          if (!s.exists()) continue;
          const prev = (s.data()["attachments"] as PaymentAttachmentRef[] | undefined) ?? [];
          const matched = prev.find((a) => a.id === attachmentId);
          if (matched?.storagePath) storagePathToDelete = matched.storagePath;
          const next = prev.filter((a) => a.id !== attachmentId);
          tx.update(s.ref, {
            attachments: next,
            updatedAt: serverTimestamp(),
          });
        }
      });
      if (storagePathToDelete) {
        try {
          await deleteObject(storageRef(storage, storagePathToDelete));
        } catch {
          // Ignore missing Storage object
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/attachments/${row.id}`);
    }
  };

  const savePersonalAgenda: OrionContextValue["savePersonalAgenda"] = async (record) => {
    const ownerId = requireUid();
    const id = record.id ? sanitizeId(record.id) : uid("ag");
    const path = `users/${ownerId}/personalAgenda/${id}`;
    const existing = record.id ? state.personalAgenda.find((r) => r.id === id) : undefined;
    const customDates = Array.isArray(record.customDates)
      ? Array.from(new Set(record.customDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort().slice(0, 120)
      : undefined;

    const payload = stripUndefined({
      kind: record.kind,
      title: clampStr(record.title, 160) || "Compromisso",
      startDate: record.startDate,
      time: clampStr(record.time, 10),
      endTime: record.endTime ? clampStr(record.endTime, 10) : undefined,
      breakRule: record.breakRule ? clampStr(record.breakRule, 120) : undefined,
      company: record.company ? clampStr(record.company, 140) : undefined,
      description: clampStr(record.description, 500),
      recurrence: record.recurrence,
      customDates: customDates && customDates.length > 0 ? customDates : undefined,
      favorite: Boolean(record.favorite),
      reminder: Boolean(record.reminder),
      reminderMinutesBefore:
        typeof record.reminderMinutesBefore === "number" && record.reminderMinutesBefore >= 0
          ? Math.min(43200, Math.trunc(record.reminderMinutesBefore))
          : undefined,
      completed: typeof record.completed === "boolean" ? record.completed : undefined,
      completedAt: record.completedAt ? clampStr(record.completedAt, 40) : undefined,
      linkedNoteId: record.linkedNoteId ? clampStr(record.linkedNoteId, 128) : undefined,
      linkedContactId: record.linkedContactId ? clampStr(record.linkedContactId, 128) : undefined,
      color: record.color ? clampStr(record.color, 20) : undefined,
      items: (record.items ?? []).slice(0, 30),
      updatedAt: serverTimestamp(),
    });

    try {
      if (existing) {
        await updateDoc(doc(db, "users", ownerId, "personalAgenda", id), payload);
      } else {
        await setDoc(doc(db, "users", ownerId, "personalAgenda", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      return id;
    } catch (err) {
      handleFirestoreError(
        err,
        existing ? OperationType.UPDATE : OperationType.CREATE,
        path,
      );
      return id;
    }
  };

  const deletePersonalAgenda: OrionContextValue["deletePersonalAgenda"] = async (id) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/personalAgenda/${id}`;
    try {
      await deleteDoc(doc(db, "users", ownerId, "personalAgenda", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const toggleAgendaCheck: OrionContextValue["toggleAgendaCheck"] = async (
    recordId,
    date,
    itemKey,
    done,
  ) => {
    const ownerId = requireUid();
    const checkKey = `${recordId}:${date}:${itemKey}`;
    const docId = sanitizeId(`${recordId}_${date}_${itemKey}`);
    const path = `users/${ownerId}/agendaChecks/${docId}`;
    const ref = doc(db, "users", ownerId, "agendaChecks", docId);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, { done, updatedAt: serverTimestamp() });
      } else {
        await setDoc(ref, {
          ownerId,
          checkKey: clampStr(checkKey, 180),
          done,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const saveAgendaOverride: OrionContextValue["saveAgendaOverride"] = async (override) => {
    const ownerId = requireUid();
    const id = override.id
      ? sanitizeId(override.id)
      : sanitizeId(`ovr_${override.sourceType}_${override.sourceId}_${override.occurrenceDate}`);
    const path = `users/${ownerId}/agendaOverrides/${id}`;
    const existing = state.agendaOverrides.find((o) => o.id === id);
    const nowIso = new Date().toISOString();
    const payload = stripUndefined({
      sourceType: override.sourceType,
      sourceId: clampStr(override.sourceId, 160),
      occurrenceDate: clampStr(override.occurrenceDate, 10),
      action: override.action,
      postponedToDate: override.postponedToDate ? clampStr(override.postponedToDate, 10) : undefined,
      postponedToTime: override.postponedToTime ? clampStr(override.postponedToTime, 10) : undefined,
      overrideTitle: override.overrideTitle ? clampStr(override.overrideTitle, 160) : undefined,
      overrideTime: override.overrideTime ? clampStr(override.overrideTime, 10) : undefined,
      overrideEndTime: override.overrideEndTime ? clampStr(override.overrideEndTime, 10) : undefined,
      overrideBreakRule: override.overrideBreakRule ? clampStr(override.overrideBreakRule, 120) : undefined,
      overrideCompany: override.overrideCompany ? clampStr(override.overrideCompany, 140) : undefined,
      overrideDescription: override.overrideDescription ? clampStr(override.overrideDescription, 500) : undefined,
      note: override.note ? clampStr(override.note, 300) : undefined,
      updatedAtIso: nowIso,
      updatedAt: serverTimestamp(),
    });
    try {
      if (existing) {
        const updateFields = stripUndefined({
          action: override.action,
          postponedToDate: override.postponedToDate ? clampStr(override.postponedToDate, 10) : undefined,
          postponedToTime: override.postponedToTime ? clampStr(override.postponedToTime, 10) : undefined,
          overrideTitle: override.overrideTitle ? clampStr(override.overrideTitle, 160) : undefined,
          overrideTime: override.overrideTime ? clampStr(override.overrideTime, 10) : undefined,
          overrideEndTime: override.overrideEndTime ? clampStr(override.overrideEndTime, 10) : undefined,
          overrideBreakRule: override.overrideBreakRule ? clampStr(override.overrideBreakRule, 120) : undefined,
          overrideCompany: override.overrideCompany ? clampStr(override.overrideCompany, 140) : undefined,
          overrideDescription: override.overrideDescription ? clampStr(override.overrideDescription, 500) : undefined,
          note: override.note ? clampStr(override.note, 300) : undefined,
          updatedAtIso: nowIso,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "users", ownerId, "agendaOverrides", id), updateFields);
      } else {
        await setDoc(doc(db, "users", ownerId, "agendaOverrides", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      return id;
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      return id;
    }
  };

  const clearAgendaOverride: OrionContextValue["clearAgendaOverride"] = async (overrideId) => {
    const ownerId = requireUid();
    const id = sanitizeId(overrideId);
    try {
      await deleteDoc(doc(db, "users", ownerId, "agendaOverrides", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/agendaOverrides/${id}`);
    }
  };

  const upsertContactCategory: OrionContextValue["upsertContactCategory"] = async (cat) => {
    const ownerId = requireUid();
    const id = cat.id ? sanitizeId(cat.id) : uid("cat");
    const path = `users/${ownerId}/contactCategories/${id}`;
    const existing = state.contactCategories.find((c) => c.id === id);
    const payload = {
      name: clampStr(cat.name, 80) || "Categoria",
      color: clampStr(cat.color || "#173d4a", 20),
      isCommercial: Boolean(cat.isCommercial),
      order: Math.min(1000, Math.max(0, Math.trunc(cat.order ?? 10))),
      updatedAt: serverTimestamp(),
    };
    try {
      if (existing) {
        await updateDoc(doc(db, "users", ownerId, "contactCategories", id), payload);
      } else {
        await setDoc(doc(db, "users", ownerId, "contactCategories", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      return id;
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      return id;
    }
  };

  const updateAgendaSettings: OrionContextValue["updateAgendaSettings"] = async (patch) => {
    const ownerId = requireUid();
    const id = "preferences";
    const ref = doc(db, "users", ownerId, "agendaSettings", id);
    const merged: AgendaSettings = {
      ...createDefaultAgendaSettings(),
      ...state.agendaSettings,
      ...patch,
    };
    const payload = stripUndefined({
      timeFormat: merged.timeFormat === "12h" ? "12h" : "24h",
      showSeconds: Boolean(merged.showSeconds),
      defaultSnoozeMinutes: Math.min(120, Math.max(1, Math.trunc(merged.defaultSnoozeMinutes || 5))),
      leapYearBirthdayRule: merged.leapYearBirthdayRule === "mar01" ? "mar01" : "feb28",
      shoppingHighlightColor: clampStr(merged.shoppingHighlightColor || "#fef08a", 20),
      notificationsEnabled: Boolean(merged.notificationsEnabled),
      alarmSoundDefault: Boolean(merged.alarmSoundDefault),
      weatherLocationName: clampStr(merged.weatherLocationName || "", 140),
      weatherLat: typeof merged.weatherLat === "number" ? merged.weatherLat : null,
      weatherLon: typeof merged.weatherLon === "number" ? merged.weatherLon : null,
      themeMode: merged.themeMode === "dark" ? "dark" : "light",
      hiddenDefaultCategoryIds: (merged.hiddenDefaultCategoryIds ?? []).slice(0, 20),
      hiddenDefaultSubcategoryIds: (merged.hiddenDefaultSubcategoryIds ?? []).slice(0, 40),
      updatedAt: serverTimestamp(),
    });
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/agendaSettings/${id}`);
    }
  };

  const deleteContactCategoryWithRemap: OrionContextValue["deleteContactCategoryWithRemap"] = async (
    categoryId,
    replacementCategoryId,
  ) => {
    const ownerId = requireUid();
    const contactsUsing = state.agendaContacts.filter((c) => c.categoryId === categoryId);
    if (contactsUsing.length > 0 && !replacementCategoryId) {
      throw new Error("Selecione uma categoria de destino antes de excluir.");
    }
    const batch = writeBatch(db);
    if (replacementCategoryId) {
      for (const c of contactsUsing) {
        batch.update(doc(db, "users", ownerId, "agendaContacts", c.id), {
          categoryId: clampStr(replacementCategoryId, 128),
          subcategoryId: deleteField(),
          updatedAt: serverTimestamp(),
        });
      }
    }
    const customSubs = state.contactSubcategories.filter((s) => s.categoryId === categoryId);
    for (const s of customSubs) {
      batch.delete(doc(db, "users", ownerId, "contactSubcategories", s.id));
    }
    const customCat = state.contactCategories.find((c) => c.id === categoryId);
    if (customCat) {
      batch.delete(doc(db, "users", ownerId, "contactCategories", categoryId));
    }
    try {
      await batch.commit();
      if (!customCat) {
        const hidden = Array.from(
          new Set([...(state.agendaSettings.hiddenDefaultCategoryIds ?? []), categoryId]),
        ).slice(0, 20);
        await updateAgendaSettings({ hiddenDefaultCategoryIds: hidden });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/contactCategories/${categoryId}`);
    }
  };

  const upsertContactSubcategory: OrionContextValue["upsertContactSubcategory"] = async (sub) => {
    const ownerId = requireUid();
    const id = sub.id ? sanitizeId(sub.id) : uid("sub");
    const path = `users/${ownerId}/contactSubcategories/${id}`;
    const existing = state.contactSubcategories.find((s) => s.id === id);
    const payload = {
      categoryId: clampStr(sub.categoryId, 128),
      name: clampStr(sub.name, 80) || "Subcategoria",
      color: clampStr(sub.color || "#b99555", 20),
      order: Math.min(1000, Math.max(0, Math.trunc(sub.order ?? 10))),
      updatedAt: serverTimestamp(),
    };
    try {
      if (existing) {
        await updateDoc(doc(db, "users", ownerId, "contactSubcategories", id), payload);
      } else {
        await setDoc(doc(db, "users", ownerId, "contactSubcategories", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      return id;
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      return id;
    }
  };

  const deleteContactSubcategory: OrionContextValue["deleteContactSubcategory"] = async (
    subcategoryId,
  ) => {
    const ownerId = requireUid();
    const batch = writeBatch(db);
    for (const c of state.agendaContacts) {
      if (c.subcategoryId === subcategoryId) {
        batch.update(doc(db, "users", ownerId, "agendaContacts", c.id), {
          subcategoryId: deleteField(),
          updatedAt: serverTimestamp(),
        });
      }
    }
    const isCustom = state.contactSubcategories.some((s) => s.id === subcategoryId);
    if (isCustom) {
      batch.delete(doc(db, "users", ownerId, "contactSubcategories", subcategoryId));
    }
    try {
      await batch.commit();
      if (!isCustom) {
        const hidden = Array.from(
          new Set([...(state.agendaSettings.hiddenDefaultSubcategoryIds ?? []), subcategoryId]),
        ).slice(0, 40);
        await updateAgendaSettings({ hiddenDefaultSubcategoryIds: hidden });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `users/${ownerId}/contactSubcategories/${subcategoryId}`,
      );
    }
  };

  const upsertAgendaContact: OrionContextValue["upsertAgendaContact"] = async (contact) => {
    const ownerId = requireUid();
    const id = contact.id ? sanitizeId(contact.id) : uid("cnt");
    const path = `users/${ownerId}/agendaContacts/${id}`;
    const existing = state.agendaContacts.find((c) => c.id === id);
    const cleanPhones = (contact.phones ?? [])
      .filter((p) => p.number && p.number.trim())
      .slice(0, 10)
      .map((p) => ({
        label: clampStr(p.label || "Celular", 30),
        number: clampStr(p.number, 40),
        isWhatsApp: Boolean(p.isWhatsApp),
      }));
    const cleanEmails = (contact.emails ?? [])
      .map((e) => clampStr(e, 160))
      .filter(Boolean)
      .slice(0, 10);

    const payload = stripUndefined({
      name: clampStr(contact.name, 140) || "Contato",
      nickname: contact.nickname ? clampStr(contact.nickname, 80) : undefined,
      birthDay:
        typeof contact.birthDay === "number" && contact.birthDay >= 1 && contact.birthDay <= 31
          ? Math.trunc(contact.birthDay)
          : null,
      birthMonth:
        typeof contact.birthMonth === "number" && contact.birthMonth >= 1 && contact.birthMonth <= 12
          ? Math.trunc(contact.birthMonth)
          : null,
      birthYear:
        typeof contact.birthYear === "number" && contact.birthYear >= 1900 && contact.birthYear <= 2100
          ? Math.trunc(contact.birthYear)
          : null,
      phones: cleanPhones,
      emails: cleanEmails,
      categoryId: clampStr(contact.categoryId || "cat-familia", 128),
      subcategoryId: contact.subcategoryId ? clampStr(contact.subcategoryId, 128) : undefined,
      categoryColor: contact.categoryColor ? clampStr(contact.categoryColor, 20) : undefined,
      subcategoryColor: contact.subcategoryColor ? clampStr(contact.subcategoryColor, 20) : undefined,
      relationship: contact.relationship ? clampStr(contact.relationship, 80) : undefined,
      company: contact.company ? clampStr(contact.company, 140) : undefined,
      profession: contact.profession ? clampStr(contact.profession, 120) : undefined,
      address: contact.address ? clampStr(contact.address, 220) : undefined,
      city: contact.city ? clampStr(contact.city, 100) : undefined,
      state: contact.state ? clampStr(contact.state.toUpperCase(), 4) : undefined,
      website: contact.website ? clampStr(contact.website, 220) : undefined,
      notes: contact.notes ? clampStr(contact.notes, 600) : undefined,
      birthdayReminderEnabled: Boolean(contact.birthdayReminderEnabled),
      birthdayReminderDaysBefore: Math.min(
        60,
        Math.max(0, Math.trunc(contact.birthdayReminderDaysBefore ?? 1)),
      ),
      notificationsEnabled: Boolean(contact.notificationsEnabled),
      updatedAt: serverTimestamp(),
    });

    try {
      if (existing) {
        const updatePayload: Record<string, unknown> = { ...payload };
        if (!contact.subcategoryId) updatePayload["subcategoryId"] = deleteField();
        if (!contact.nickname) updatePayload["nickname"] = deleteField();
        await updateDoc(doc(db, "users", ownerId, "agendaContacts", id), updatePayload);
      } else {
        await setDoc(doc(db, "users", ownerId, "agendaContacts", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      return id;
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      return id;
    }
  };

  const deleteAgendaContact: OrionContextValue["deleteAgendaContact"] = async (contactId) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "agendaContacts", contactId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/agendaContacts/${contactId}`);
    }
  };

  const upsertAgendaAlarm: OrionContextValue["upsertAgendaAlarm"] = async (alarm) => {
    const ownerId = requireUid();
    const id = alarm.id ? sanitizeId(alarm.id) : uid("alm");
    const path = `users/${ownerId}/agendaAlarms/${id}`;
    const existing = state.agendaAlarms.find((a) => a.id === id);
    const safeTime = /^\d{2}:\d{2}$/.test(alarm.time) ? alarm.time : "07:00";
    const repeatDays = Array.from(
      new Set((alarm.repeatDays ?? []).map((n) => Math.trunc(n)).filter((n) => n >= 0 && n <= 6)),
    ).sort();
    const payload = stripUndefined({
      name: clampStr(alarm.name, 120) || "Despertador",
      time: safeTime,
      repeatDays,
      soundEnabled: Boolean(alarm.soundEnabled),
      soundTone: alarm.soundTone ?? "chime",
      enabled: Boolean(alarm.enabled),
      snoozeUntilIso: alarm.snoozeUntilIso ? clampStr(alarm.snoozeUntilIso, 40) : null,
      lastTriggeredKey: alarm.lastTriggeredKey ? clampStr(alarm.lastTriggeredKey, 80) : null,
      updatedAt: serverTimestamp(),
    });
    try {
      if (existing) {
        await updateDoc(doc(db, "users", ownerId, "agendaAlarms", id), payload);
      } else {
        await setDoc(doc(db, "users", ownerId, "agendaAlarms", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      return id;
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      return id;
    }
  };

  const deleteAgendaAlarm: OrionContextValue["deleteAgendaAlarm"] = async (alarmId) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "agendaAlarms", alarmId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/agendaAlarms/${alarmId}`);
    }
  };

  const upsertAgendaNote: OrionContextValue["upsertAgendaNote"] = async (note) => {
    const ownerId = requireUid();
    const id = note.id ? sanitizeId(note.id) : uid("note");
    const path = `users/${ownerId}/agendaNotes/${id}`;
    const existing = state.agendaNotes.find((n) => n.id === id);
    const nowIso = new Date().toISOString();
    const cleanChecklist = (note.checklistItems ?? []).slice(0, 100).map((item, idx) => ({
      id: clampStr(item.id || `chk-${idx}`, 64),
      text: clampStr(item.text, 220),
      done: Boolean(item.done),
    }));
    const cleanStores = (note.stores ?? []).slice(0, 30).map((store, sIdx) => ({
      id: clampStr(store.id || `st-${sIdx}`, 64),
      name: clampStr(store.name || `Loja ${sIdx + 1}`, 100),
      ...(store.address ? { address: clampStr(store.address, 160) } : {}),
      ...(store.note ? { note: clampStr(store.note, 200) } : {}),
      items: (store.items ?? []).slice(0, 80).map((it, iIdx) => ({
        id: clampStr(it.id || `it-${iIdx}`, 64),
        description: clampStr(it.description || "Item", 140),
        quantity: Number.isFinite(it.quantity) && it.quantity > 0 ? Number(it.quantity) : 1,
        ...(it.unit ? { unit: clampStr(it.unit, 20) } : {}),
        unitPriceCents: Math.max(0, Math.trunc(Number(it.unitPriceCents) || 0)),
        purchased: Boolean(it.purchased),
      })),
    }));

    const payload = stripUndefined({
      type: note.type,
      title: clampStr(note.title, 160) || "Nova nota",
      color: clampStr(note.color || "#ffffff", 20),
      content: clampStr(note.content || "", 4000),
      checklistItems: cleanChecklist,
      stores: cleanStores,
      linkedAgendaEventId: note.linkedAgendaEventId ? clampStr(note.linkedAgendaEventId, 128) : null,
      linkedDate: note.linkedDate ? clampStr(note.linkedDate, 10) : null,
      updatedAtIso: nowIso,
      updatedAt: serverTimestamp(),
    });
    try {
      if (existing) {
        await updateDoc(doc(db, "users", ownerId, "agendaNotes", id), payload);
      } else {
        await setDoc(doc(db, "users", ownerId, "agendaNotes", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      return id;
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
      return id;
    }
  };

  const deleteAgendaNote: OrionContextValue["deleteAgendaNote"] = async (noteId) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "agendaNotes", noteId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/agendaNotes/${noteId}`);
    }
  };

  const sendNoteToCalendar: OrionContextValue["sendNoteToCalendar"] = async (noteId, input) => {
    const ownerId = requireUid();
    const note = state.agendaNotes.find((n) => n.id === noteId);
    if (!note) throw new Error("Nota não encontrada.");

    const eventId = note.linkedAgendaEventId
      ? sanitizeId(note.linkedAgendaEventId)
      : sanitizeId(`ag_note_${noteId}`);
    const safeDate = validIsoDate(input.date);
    const title = clampStr(input.title || note.title, 160) || "Nota da Agenda";
    const description =
      note.type === "free"
        ? clampStr(note.content, 500)
        : note.type === "checklist"
          ? clampStr(`${note.checklistItems.length} item(ns) na lista`, 500)
          : clampStr(`${note.stores.length} loja(s) na lista de compras`, 500);

    const existingEvent = state.personalAgenda.find((e) => e.id === eventId);
    const batch = writeBatch(db);
    const evRef = doc(db, "users", ownerId, "personalAgenda", eventId);
    const evPayload = stripUndefined({
      kind: note.type === "checklist" ? "tasks" : "event",
      title,
      startDate: safeDate,
      time: clampStr(input.time ?? existingEvent?.time ?? "09:00", 10),
      description,
      recurrence: "none",
      favorite: existingEvent?.favorite ?? false,
      reminder: input.reminder ?? true,
      linkedNoteId: noteId,
      color: note.color !== "#ffffff" ? note.color : undefined,
      items: existingEvent?.items ?? [],
      updatedAt: serverTimestamp(),
    });

    if (existingEvent) {
      batch.update(evRef, evPayload);
    } else {
      batch.set(evRef, {
        ownerId,
        ...evPayload,
        createdAt: serverTimestamp(),
      });
    }

    batch.update(doc(db, "users", ownerId, "agendaNotes", noteId), {
      linkedAgendaEventId: eventId,
      linkedDate: safeDate,
      updatedAtIso: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      return eventId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/personalAgenda/${eventId}`);
      return eventId;
    }
  };

  const addCalculatorHistory: OrionContextValue["addCalculatorHistory"] = async (entry) => {
    const ownerId = requireUid();
    const id = uid("calc");
    const path = `users/${ownerId}/calculatorHistory/${id}`;
    try {
      await setDoc(doc(db, "users", ownerId, "calculatorHistory", id), {
        ownerId,
        expression: clampStr(entry.expression, 200) || "0",
        result: clampStr(entry.result, 80) || "0",
        mode: entry.mode === "scientific" ? "scientific" : "normal",
        angleUnit: entry.angleUnit === "RAD" ? "RAD" : "DEG",
        createdAtIso: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const clearCalculatorHistory: OrionContextValue["clearCalculatorHistory"] = async () => {
    const ownerId = requireUid();
    try {
      const snap = await getDocs(
        query(collection(db, "users", ownerId, "calculatorHistory"), where("ownerId", "==", ownerId)),
      );
      if (snap.empty) return;
      for (let i = 0; i < snap.docs.length; i += 400) {
        const chunk = snap.docs.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/calculatorHistory`);
    }
  };

  const addShoppingItem: OrionContextValue["addShoppingItem"] = async (item) => {
    const ownerId = requireUid();
    const id = uid("sh");
    const path = `users/${ownerId}/shoppingList/${id}`;
    try {
      await setDoc(doc(db, "users", ownerId, "shoppingList", id), {
        ownerId,
        name: clampStr(item.name, 140),
        category: clampStr(item.category, 60),
        quantity: Math.min(10000, Math.max(1, Math.trunc(item.quantity))),
        unitPriceCents: Math.max(0, Math.trunc(item.unitPriceCents)),
        checked: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const toggleShoppingItem: OrionContextValue["toggleShoppingItem"] = async (id) => {
    const ownerId = requireUid();
    const current = state.shoppingList.find((i) => i.id === id);
    if (!current) return;
    const path = `users/${ownerId}/shoppingList/${id}`;
    try {
      await updateDoc(doc(db, "users", ownerId, "shoppingList", id), {
        checked: !current.checked,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const removeShoppingItem: OrionContextValue["removeShoppingItem"] = async (id) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/shoppingList/${id}`;
    try {
      await deleteDoc(doc(db, "users", ownerId, "shoppingList", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const addVehicle: OrionContextValue["addVehicle"] = async (vehicle) => {
    return upsertGarageVehicle(vehicle);
  };

  const upsertGarageVehicle: OrionContextValue["upsertGarageVehicle"] = async (vehicle) => {
    const ownerId = requireUid();
    const id = vehicle.id ? sanitizeId(vehicle.id) : uid("veh");
    const path = `users/${ownerId}/vehicles/${id}`;
    const existing = vehicle.id ? state.vehicles.find((v) => v.id === id) : undefined;
    const payload = stripUndefined({
      name: clampStr(vehicle.name || `${vehicle.brand ?? ""} ${vehicle.model}`.trim(), 100),
      plate: clampStr(vehicle.plate, 20).toUpperCase(),
      brand: vehicle.brand ? clampStr(vehicle.brand, 60) : undefined,
      model: clampStr(vehicle.model, 120),
      year: typeof vehicle.year === "number" ? Math.trunc(vehicle.year) : undefined,
      fuelType: vehicle.fuelType,
      odometerKm: Math.max(0, Number(vehicle.odometerKm) || 0),
      status: vehicle.status ?? "ATIVO",
      assignedDriverId: vehicle.assignedDriverId
        ? clampStr(vehicle.assignedDriverId, 128)
        : undefined,
      renavam: vehicle.renavam ? clampStr(vehicle.renavam, 30) : undefined,
      stateUf: vehicle.stateUf ? clampStr(vehicle.stateUf.toUpperCase(), 4) : undefined,
      tankCapacityLiters:
        typeof vehicle.tankCapacityLiters === "number" && vehicle.tankCapacityLiters > 0
          ? Number(vehicle.tankCapacityLiters)
          : undefined,
      fipeValue:
        typeof vehicle.fipeValue === "number" && vehicle.fipeValue >= 0
          ? Number(vehicle.fipeValue)
          : undefined,
      monthlyFixedCost:
        typeof vehicle.monthlyFixedCost === "number" && vehicle.monthlyFixedCost >= 0
          ? Number(vehicle.monthlyFixedCost)
          : undefined,
      notes: vehicle.notes ? clampStr(vehicle.notes, 400) : undefined,
    });

    try {
      if (existing) {
        await updateDoc(doc(db, "users", ownerId, "vehicles", id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, "users", ownerId, "vehicles", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      return id;
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const deleteGarageVehicle: OrionContextValue["deleteGarageVehicle"] = async (id) => {
    const ownerId = requireUid();
    const batch = writeBatch(db);
    for (const sub of [
      "garageFuelings",
      "garageMaintenances",
      "garageExpenses",
      "garageFines",
      "garageDocuments",
      "garageChecklists",
      "garageRoutes",
      "garageReminders",
      "fuelLogs",
    ] as const) {
      const snap = await getDocs(
        query(collection(db, "users", ownerId, sub), where("ownerId", "==", ownerId)),
      );
      for (const d of snap.docs) {
        if (d.data()["vehicleId"] === id) {
          batch.delete(d.ref);
        }
      }
    }
    batch.delete(doc(db, "users", ownerId, "vehicles", id));
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/vehicles/${id}`);
    }
  };

  const upsertGarageDriver: OrionContextValue["upsertGarageDriver"] = async (driver) => {
    const ownerId = requireUid();
    const id = driver.id ? sanitizeId(driver.id) : uid("drv");
    const path = `users/${ownerId}/garageDrivers/${id}`;
    const existing = driver.id ? state.garageDrivers.find((d) => d.id === id) : undefined;
    const payload = stripUndefined({
      name: clampStr(driver.name, 120),
      cnhNumber: clampStr(driver.cnhNumber, 20),
      cnhCategory: clampStr(driver.cnhCategory, 10),
      cnhExpiry: clampStr(driver.cnhExpiry, 10),
      phone: driver.phone ? clampStr(driver.phone, 30) : undefined,
      allowedVehicleIds: (driver.allowedVehicleIds ?? []).slice(0, 30),
      active: Boolean(driver.active),
    });

    try {
      if (existing) {
        await updateDoc(doc(db, "users", ownerId, "garageDrivers", id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, "users", ownerId, "garageDrivers", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const deleteGarageDriver: OrionContextValue["deleteGarageDriver"] = async (id) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/garageDrivers/${id}`;
    try {
      await deleteDoc(doc(db, "users", ownerId, "garageDrivers", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const addGarageFueling: OrionContextValue["addGarageFueling"] = async (fueling) => {
    const ownerId = requireUid();
    const id = uid("gf");
    const vehicle = state.vehicles.find((v) => v.id === fueling.vehicleId);
    if (!vehicle) throw new Error("Veículo inválido.");
    const batch = writeBatch(db);
    batch.set(
      doc(db, "users", ownerId, "garageFuelings", id),
      stripUndefined({
        ownerId,
        vehicleId: fueling.vehicleId,
        driverId: fueling.driverId ? clampStr(fueling.driverId, 128) : undefined,
        date: fueling.date,
        odometer: Math.max(0, Number(fueling.odometer)),
        fuelType: fueling.fuelType,
        quantity: Number(fueling.quantity),
        unitPrice: Number(fueling.unitPrice),
        totalCost: Number(fueling.totalCost),
        fullTank: Boolean(fueling.fullTank),
        stationName: fueling.stationName ? clampStr(fueling.stationName, 120) : undefined,
        nfceKey: fueling.nfceKey ? clampStr(fueling.nfceKey, 80) : undefined,
        notes: fueling.notes ? clampStr(fueling.notes, 300) : undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    if (fueling.odometer > vehicle.odometerKm) {
      batch.update(doc(db, "users", ownerId, "vehicles", vehicle.id), {
        odometerKm: Number(fueling.odometer),
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/garageFuelings/${id}`);
    }
  };

  const deleteGarageFueling: OrionContextValue["deleteGarageFueling"] = async (id) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "garageFuelings", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/garageFuelings/${id}`);
    }
  };

  const addGarageMaintenance: OrionContextValue["addGarageMaintenance"] = async (maint) => {
    const ownerId = requireUid();
    const id = uid("gm");
    const vehicle = state.vehicles.find((v) => v.id === maint.vehicleId);
    if (!vehicle) throw new Error("Veículo inválido.");
    const batch = writeBatch(db);
    batch.set(
      doc(db, "users", ownerId, "garageMaintenances", id),
      stripUndefined({
        ownerId,
        vehicleId: maint.vehicleId,
        driverId: maint.driverId ? clampStr(maint.driverId, 128) : undefined,
        type: maint.type,
        status: maint.status ?? "ABERTA",
        originChecklistId: maint.originChecklistId
          ? clampStr(maint.originChecklistId, 128)
          : undefined,
        date: maint.date,
        odometer: Math.max(0, Number(maint.odometer)),
        category: clampStr(maint.category, 100),
        providerName: maint.providerName ? clampStr(maint.providerName, 120) : undefined,
        partsCost: Math.max(0, Number(maint.partsCost)),
        laborCost: Math.max(0, Number(maint.laborCost)),
        totalCost: Math.max(0, Number(maint.totalCost)),
        notes: maint.notes ? clampStr(maint.notes, 400) : undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    if (maint.odometer > vehicle.odometerKm) {
      batch.update(doc(db, "users", ownerId, "vehicles", vehicle.id), {
        odometerKm: Number(maint.odometer),
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
      return id;
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `users/${ownerId}/garageMaintenances/${id}`,
      );
    }
  };

  const updateGarageMaintenanceStatus: OrionContextValue["updateGarageMaintenanceStatus"] = async (
    id,
    status,
  ) => {
    const ownerId = requireUid();
    try {
      await updateDoc(doc(db, "users", ownerId, "garageMaintenances", id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `users/${ownerId}/garageMaintenances/${id}`,
      );
    }
  };

  const deleteGarageMaintenance: OrionContextValue["deleteGarageMaintenance"] = async (id) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "garageMaintenances", id));
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `users/${ownerId}/garageMaintenances/${id}`,
      );
    }
  };

  const addGarageExpense: OrionContextValue["addGarageExpense"] = async (exp) => {
    const ownerId = requireUid();
    const id = uid("gexp");
    try {
      await setDoc(
        doc(db, "users", ownerId, "garageExpenses", id),
        stripUndefined({
          ownerId,
          vehicleId: exp.vehicleId,
          driverId: exp.driverId ? clampStr(exp.driverId, 128) : undefined,
          category: clampStr(exp.category, 80),
          date: exp.date,
          amount: Number(exp.amount),
          description: exp.description ? clampStr(exp.description, 240) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/garageExpenses/${id}`);
    }
  };

  const deleteGarageExpense: OrionContextValue["deleteGarageExpense"] = async (id) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "garageExpenses", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/garageExpenses/${id}`);
    }
  };

  const addGarageFine: OrionContextValue["addGarageFine"] = async (fine) => {
    const ownerId = requireUid();
    const id = uid("gfn");
    try {
      await setDoc(
        doc(db, "users", ownerId, "garageFines", id),
        stripUndefined({
          ownerId,
          vehicleId: fine.vehicleId,
          driverId: fine.driverId ? clampStr(fine.driverId, 128) : undefined,
          date: fine.date,
          time: fine.time ? clampStr(fine.time, 10) : undefined,
          infractionCode: clampStr(fine.infractionCode, 30),
          description: clampStr(fine.description, 200),
          location: fine.location ? clampStr(fine.location, 160) : undefined,
          points: Math.min(21, Math.max(0, Math.trunc(fine.points))),
          amount: Number(fine.amount),
          sneDiscountApplied: Boolean(fine.sneDiscountApplied),
          driverIndicationDeadline: fine.driverIndicationDeadline
            ? clampStr(fine.driverIndicationDeadline, 10)
            : undefined,
          status: fine.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/garageFines/${id}`);
    }
  };

  const updateGarageFineStatus: OrionContextValue["updateGarageFineStatus"] = async (
    id,
    status,
  ) => {
    const ownerId = requireUid();
    try {
      await updateDoc(doc(db, "users", ownerId, "garageFines", id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/garageFines/${id}`);
    }
  };

  const deleteGarageFine: OrionContextValue["deleteGarageFine"] = async (id) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "garageFines", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/garageFines/${id}`);
    }
  };

  const addGarageDocument: OrionContextValue["addGarageDocument"] = async (docItem) => {
    const ownerId = requireUid();
    const id = uid("gdoc");
    try {
      await setDoc(
        doc(db, "users", ownerId, "garageDocuments", id),
        stripUndefined({
          ownerId,
          vehicleId: docItem.vehicleId,
          docType: docItem.docType,
          referenceYear: Math.trunc(docItem.referenceYear),
          dueDate: docItem.dueDate,
          amount: Math.max(0, Number(docItem.amount)),
          stateUf: docItem.stateUf ? clampStr(docItem.stateUf.toUpperCase(), 4) : undefined,
          providerOrAuthority: docItem.providerOrAuthority
            ? clampStr(docItem.providerOrAuthority, 120)
            : undefined,
          policyOrCode: docItem.policyOrCode ? clampStr(docItem.policyOrCode, 120) : undefined,
          status: docItem.status,
          paidAt: docItem.paidAt ? clampStr(docItem.paidAt, 10) : undefined,
          autoGenerated: docItem.autoGenerated,
          notes: docItem.notes ? clampStr(docItem.notes, 300) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/garageDocuments/${id}`);
    }
  };

  const addGarageDocumentsBatch: OrionContextValue["addGarageDocumentsBatch"] = async (docs) => {
    if (docs.length === 0) return;
    const ownerId = requireUid();
    const batch = writeBatch(db);
    for (const item of docs) {
      const id = uid("gdoc");
      batch.set(
        doc(db, "users", ownerId, "garageDocuments", id),
        stripUndefined({
          ownerId,
          vehicleId: item.vehicleId,
          docType: item.docType,
          referenceYear: Math.trunc(item.referenceYear),
          dueDate: item.dueDate,
          amount: Math.max(0, Number(item.amount)),
          stateUf: item.stateUf ? clampStr(item.stateUf.toUpperCase(), 4) : undefined,
          providerOrAuthority: item.providerOrAuthority
            ? clampStr(item.providerOrAuthority, 120)
            : undefined,
          policyOrCode: item.policyOrCode ? clampStr(item.policyOrCode, 120) : undefined,
          status: item.status,
          autoGenerated: item.autoGenerated,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/garageDocuments`);
    }
  };

  const markGarageDocumentPaid: OrionContextValue["markGarageDocumentPaid"] = async (
    id,
    recordExpense = true,
  ) => {
    const ownerId = requireUid();
    const target = state.garageDocuments.find((d) => d.id === id);
    if (!target) return;
    const batch = writeBatch(db);
    const paidAt = todayBR();
    batch.update(doc(db, "users", ownerId, "garageDocuments", id), {
      status: "PAGO",
      paidAt,
      updatedAt: serverTimestamp(),
    });
    if (recordExpense && target.status !== "PAGO" && target.amount > 0) {
      const expId = uid("gexp");
      const labelMap: Record<GarageDocument["docType"], string> = {
        CRLV: "Licenciamento (CRLV-e)",
        IPVA: "IPVA",
        SEGURO: "Seguro Auto",
        VISTORIA: "Vistoria",
      };
      batch.set(doc(db, "users", ownerId, "garageExpenses", expId), {
        ownerId,
        vehicleId: target.vehicleId,
        category: labelMap[target.docType],
        date: paidAt,
        amount: target.amount,
        description: `${labelMap[target.docType]} ${target.referenceYear} (${target.providerOrAuthority ?? target.stateUf ?? "Garagem"})`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/garageDocuments/${id}`);
    }
  };

  const deleteGarageDocument: OrionContextValue["deleteGarageDocument"] = async (id) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "garageDocuments", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/garageDocuments/${id}`);
    }
  };

  const addGarageChecklist: OrionContextValue["addGarageChecklist"] = async (checklist, options) => {
    const ownerId = requireUid();
    const id = uid("gchk");
    const vehicle = state.vehicles.find((v) => v.id === checklist.vehicleId);
    if (!vehicle) throw new Error("Veículo inválido.");
    const failedItems = checklist.items.filter((i) => !i.compliant);
    const shouldCreateMaint = Boolean(options?.autoCreateMaintenance && failedItems.length > 0);
    const maintId = shouldCreateMaint ? uid("gm") : undefined;

    const batch = writeBatch(db);
    batch.set(
      doc(db, "users", ownerId, "garageChecklists", id),
      stripUndefined({
        ownerId,
        vehicleId: checklist.vehicleId,
        driverId: checklist.driverId ? clampStr(checklist.driverId, 128) : undefined,
        date: checklist.date,
        odometer: Math.max(0, Number(checklist.odometer)),
        items: checklist.items.slice(0, 25).map((item) =>
          stripUndefined({
            id: item.id,
            label: clampStr(item.label, 120),
            compliant: Boolean(item.compliant),
            note: item.note ? clampStr(item.note, 200) : undefined,
          }),
        ),
        hasIssues: failedItems.length > 0,
        generatedMaintenanceId: maintId,
        generalNotes: checklist.generalNotes ? clampStr(checklist.generalNotes, 400) : undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    if (shouldCreateMaint && maintId) {
      batch.set(doc(db, "users", ownerId, "garageMaintenances", maintId), {
        ownerId,
        vehicleId: checklist.vehicleId,
        type: "CORRETIVA",
        status: "ABERTA",
        originChecklistId: id,
        date: checklist.date,
        odometer: Math.max(0, Number(checklist.odometer)),
        category: "Revisão pós-checklist",
        partsCost: 0,
        laborCost: 0,
        totalCost: 0,
        notes: clampStr(
          `Itens não conformes: ${failedItems
            .map((i) => `${i.label}${i.note ? ` (${i.note})` : ""}`)
            .join("; ")}`,
          400,
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const updateVehFields: Record<string, unknown> = {};
    if (checklist.odometer > vehicle.odometerKm) {
      updateVehFields["odometerKm"] = Number(checklist.odometer);
    }
    if (options?.setVehicleInMaintenance && failedItems.length > 0) {
      updateVehFields["status"] = "MANUTENCAO";
    }
    if (Object.keys(updateVehFields).length > 0) {
      batch.update(doc(db, "users", ownerId, "vehicles", vehicle.id), {
        ...updateVehFields,
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/garageChecklists/${id}`);
    }
  };

  const addGarageRoute: OrionContextValue["addGarageRoute"] = async (route) => {
    const ownerId = requireUid();
    const id = uid("grt");
    const vehicle = state.vehicles.find((v) => v.id === route.vehicleId);
    if (!vehicle) throw new Error("Veículo inválido.");
    const distanceKm = Math.max(0, Number((route.endOdometer - route.startOdometer).toFixed(1)));
    const batch = writeBatch(db);
    batch.set(
      doc(db, "users", ownerId, "garageRoutes", id),
      stripUndefined({
        ownerId,
        vehicleId: route.vehicleId,
        driverId: route.driverId ? clampStr(route.driverId, 128) : undefined,
        date: route.date,
        origin: clampStr(route.origin, 120),
        destination: clampStr(route.destination, 120),
        startOdometer: Math.max(0, Number(route.startOdometer)),
        endOdometer: Math.max(0, Number(route.endOdometer)),
        distanceKm,
        estimatedKm:
          typeof route.estimatedKm === "number" && route.estimatedKm > 0
            ? Number(route.estimatedKm)
            : undefined,
        purpose: route.purpose ? clampStr(route.purpose, 160) : undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    if (route.endOdometer > vehicle.odometerKm) {
      batch.update(doc(db, "users", ownerId, "vehicles", vehicle.id), {
        odometerKm: Number(route.endOdometer),
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/garageRoutes/${id}`);
    }
  };

  const deleteGarageRoute: OrionContextValue["deleteGarageRoute"] = async (id) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "garageRoutes", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/garageRoutes/${id}`);
    }
  };

  const addGarageReminder: OrionContextValue["addGarageReminder"] = async (reminder) => {
    const ownerId = requireUid();
    const id = uid("grem");
    try {
      await setDoc(
        doc(db, "users", ownerId, "garageReminders", id),
        stripUndefined({
          ownerId,
          vehicleId: reminder.vehicleId,
          title: clampStr(reminder.title, 140),
          category: reminder.category,
          dueDate: reminder.dueDate ? clampStr(reminder.dueDate, 10) : undefined,
          dueOdometer:
            typeof reminder.dueOdometer === "number" && reminder.dueOdometer > 0
              ? Number(reminder.dueOdometer)
              : undefined,
          completed: false,
          notes: reminder.notes ? clampStr(reminder.notes, 300) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/garageReminders/${id}`);
    }
  };

  const toggleGarageReminder: OrionContextValue["toggleGarageReminder"] = async (id) => {
    const ownerId = requireUid();
    const current = state.garageReminders.find((r) => r.id === id);
    if (!current) return;
    const nextDone = !current.completed;
    try {
      await updateDoc(doc(db, "users", ownerId, "garageReminders", id), {
        completed: nextDone,
        completedAt: nextDone ? todayBR() : deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/garageReminders/${id}`);
    }
  };

  const deleteGarageReminder: OrionContextValue["deleteGarageReminder"] = async (id) => {
    const ownerId = requireUid();
    try {
      await deleteDoc(doc(db, "users", ownerId, "garageReminders", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}/garageReminders/${id}`);
    }
  };

  const addFuelLog: OrionContextValue["addFuelLog"] = async (log) => {
    const ownerId = requireUid();
    const id = uid("fuel");
    const vehicle = state.vehicles.find((v) => v.id === log.vehicleId);
    if (!vehicle) throw new Error("Selecione um veículo válido antes de abastecer.");
    const batch = writeBatch(db);

    batch.set(doc(db, "users", ownerId, "fuelLogs", id), {
      ownerId,
      vehicleId: log.vehicleId,
      date: log.date,
      liters: log.liters,
      totalCents: Math.max(0, Math.trunc(log.totalCents)),
      odometerKm: Math.max(0, Number(log.odometerKm)),
      fuelType: log.fuelType,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (log.odometerKm > vehicle.odometerKm) {
      batch.update(doc(db, "users", ownerId, "vehicles", vehicle.id), {
        odometerKm: log.odometerKm,
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${ownerId}/fuelLogs/${id}`);
    }
  };

  const addTrip: OrionContextValue["addTrip"] = async (trip) => {
    const ownerId = requireUid();
    const id = uid("trip");
    const path = `users/${ownerId}/trips/${id}`;
    try {
      await setDoc(doc(db, "users", ownerId, "trips", id), {
        ownerId,
        destination: clampStr(trip.destination, 140),
        startDate: trip.startDate,
        endDate: trip.endDate,
        budgetCents: Math.max(0, Math.trunc(trip.budgetCents)),
        spentCents: Math.max(0, Math.trunc(trip.spentCents)),
        notes: clampStr(trip.notes, 400),
        status: trip.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const updateTripStatus: OrionContextValue["updateTripStatus"] = async (id, status) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/trips/${id}`;
    try {
      await updateDoc(doc(db, "users", ownerId, "trips", id), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const saveFiscalReceipt: OrionContextValue["saveFiscalReceipt"] = async (receipt) => {
    const ownerId = requireUid();
    const id = receipt.id ? sanitizeId(receipt.id) : `nf-${crypto.randomUUID()}`;
    const path = `users/${ownerId}/fiscalReceipts/${id}`;
    const accessKey = extractAccessKey(receipt.accessKey);
    const dupe = state.fiscalReceipts.find(
      (n) =>
        n.id !== id &&
        ((accessKey && n.accessKey === accessKey) ||
          (receipt.fileHash && n.fileHash === receipt.fileHash)),
    );
    if (dupe) {
      throw new Error(
        accessKey && dupe.accessKey === accessKey
          ? "Esta chave de acesso já está cadastrada no sistema."
          : "Este arquivo (hash idêntico) já foi importado anteriormente.",
      );
    }

    const store = clampStr(receipt.store, 160);
    const items = (receipt.items ?? []).slice(0, 150).map((item) => {
      const desc = clampStr(item.description, 250) || "Item";
      const norm = normalizeProduct(item.normalizedName || desc, item.ean);
      return stripUndefined({
        ...(item.code ? { code: clampStr(item.code, 40) } : {}),
        ...(item.ean ? { ean: clampStr(item.ean, 20) } : {}),
        originalDescription: clampStr(item.originalDescription || desc, 250),
        description: desc,
        normalizedName: clampStr(item.normalizedName || norm.normalizedName, 250),
        normalizedKey: clampStr(item.normalizedKey || norm.normalizedKey, 160),
        ...(norm.brand || item.brand ? { brand: clampStr(item.brand || norm.brand, 60) } : {}),
        ...(norm.packSize || item.packSize
          ? { packSize: clampStr(item.packSize || norm.packSize, 30) }
          : {}),
        quantity: Math.max(0, Number(item.quantity) || 0),
        unit: clampStr(item.unit || "un", 12) || "un",
        unitPriceCents: Math.max(0, Math.round(Number(item.unitPriceCents) || 0)),
        ...(item.discountCents ? { discountCents: Math.max(0, Math.round(item.discountCents)) } : {}),
        totalCents: Math.max(0, Math.round(Number(item.totalCents) || 0)),
      });
    });

    const kind = receipt.kind === "geral" ? suggestReceiptKind(store, receipt.items) : receipt.kind;
    const archiveCategory = clampStr(
      receipt.archiveCategory || classifyArchiveCategory(store, kind, receipt.items),
      60,
    );
    const folderPath = clampStr(
      receipt.folderPath || buildArchiveFolderPath(receipt.issuedAt, archiveCategory),
      120,
    );
    const totalCents =
      items.length > 0 && receipt.totalCents <= 0
        ? items.reduce((a, i) => a + Number(i["totalCents"] || 0), 0)
        : Math.max(0, Math.round(receipt.totalCents || 0));

    const processingStatus =
      receipt.processingStatus ?? (items.length > 0 ? "complete" : "partial");

    const existing = state.fiscalReceipts.find((n) => n.id === id);

    const payload = stripUndefined({
      id,
      ownerId,
      kind,
      docType: receipt.docType ?? "nfce_65",
      uf: receipt.uf ? clampStr(receipt.uf, 4) : undefined,
      store,
      cnpj: clampStr(receipt.cnpj, 30),
      emitterAddress: receipt.emitterAddress ? clampStr(receipt.emitterAddress, 220) : undefined,
      issuedAt: receipt.issuedAt,
      issuedTime: receipt.issuedTime ? clampStr(receipt.issuedTime, 10) : undefined,
      accessKey,
      number: clampStr(receipt.number, 30),
      series: clampStr(receipt.series, 20),
      paymentMethod: clampStr(receipt.paymentMethod, 80),
      discountCents:
        typeof receipt.discountCents === "number" && receipt.discountCents > 0
          ? Math.round(receipt.discountCents)
          : undefined,
      totalCents,
      items,
      archiveCategory,
      folderPath,
      storagePath: receipt.storagePath ? clampStr(receipt.storagePath, 400) : undefined,
      fileName: receipt.fileName ? clampStr(receipt.fileName, 160) : undefined,
      fileMimeType: receipt.fileMimeType ? clampStr(receipt.fileMimeType, 80) : undefined,
      fileHash: receipt.fileHash ? clampStr(receipt.fileHash, 80) : undefined,
      documentUrl: receipt.documentUrl ? clampStr(receipt.documentUrl, 1000) : undefined,
      sourceUrl: receipt.sourceUrl ? clampStr(receipt.sourceUrl, 1000) : undefined,
      linkedTransactionId: receipt.linkedTransactionId
        ? clampStr(receipt.linkedTransactionId, 128)
        : undefined,
      processingStatus,
      processingError: receipt.processingError
        ? clampStr(receipt.processingError, 300)
        : undefined,
      sourceOrigin: receipt.sourceOrigin ?? "manual",
      lowConfidenceFields: Array.isArray(receipt.lowConfidenceFields)
        ? receipt.lowConfidenceFields.slice(0, 20).map((f) => clampStr(f, 50))
        : undefined,
      warranty: receipt.warranty
        ? stripUndefined({
            productName: receipt.warranty.productName
              ? clampStr(receipt.warranty.productName, 160)
              : undefined,
            serialNumber: receipt.warranty.serialNumber
              ? clampStr(receipt.warranty.serialNumber, 80)
              : undefined,
            warrantyMonths:
              typeof receipt.warranty.warrantyMonths === "number"
                ? Math.max(0, Math.trunc(receipt.warranty.warrantyMonths))
                : undefined,
            warrantyEndsAt: receipt.warranty.warrantyEndsAt
              ? clampStr(receipt.warranty.warrantyEndsAt, 10)
              : undefined,
            agendaRecordId: receipt.warranty.agendaRecordId
              ? clampStr(receipt.warranty.agendaRecordId, 128)
              : undefined,
            notes: receipt.warranty.notes ? clampStr(receipt.warranty.notes, 300) : undefined,
          })
        : undefined,
      updatedAt: serverTimestamp(),
      ...(existing ? {} : { createdAt: serverTimestamp() }),
    });

    try {
      if (existing) {
        const updatePayload = { ...payload };
        delete updatePayload["ownerId"];
        await updateDoc(doc(db, "users", ownerId, "fiscalReceipts", id), updatePayload);
      } else {
        await setDoc(doc(db, "users", ownerId, "fiscalReceipts", id), payload);
      }
      return id;
    } catch (err) {
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const deleteFiscalReceipt: OrionContextValue["deleteFiscalReceipt"] = async (note) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/fiscalReceipts/${note.id}`;
    try {
      await deleteDoc(doc(db, "users", ownerId, "fiscalReceipts", note.id));
      const targetStorage = note.storagePath || note.documentUrl;
      if (targetStorage) {
        try {
          await deleteObject(storageRef(storage, targetStorage));
        } catch {
          // Ignore already removed storage objects
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const createWarrantyAgendaAlert: OrionContextValue["createWarrantyAgendaAlert"] = async (
    receipt,
  ) => {
    const ownerId = requireUid();
    const endDate = receipt.warranty?.warrantyEndsAt;
    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error("Defina a data final da garantia antes de criar o alerta na Agenda.");
    }
    const agendaId = receipt.warranty?.agendaRecordId || `ag-gar-${sanitizeId(receipt.id)}`;
    const productLabel =
      receipt.warranty?.productName ||
      receipt.items?.[0]?.description ||
      `Aquisição em ${receipt.store}`;

    await savePersonalAgenda({
      id: agendaId,
      kind: "appointment",
      title: clampStr(`Fim da garantia: ${productLabel}`, 160),
      startDate: endDate,
      time: "09:00",
      description: clampStr(
        `Loja: ${receipt.store} · NF ${receipt.number || receipt.accessKey || receipt.id}${
          receipt.warranty?.serialNumber ? ` · Série: ${receipt.warranty.serialNumber}` : ""
        }`,
        500,
      ),
      recurrence: "none",
      favorite: true,
      reminder: true,
      items: [
        { key: "check-1", description: "Conferir funcionamento antes do vencimento" },
        { key: "check-2", description: "Nota fiscal arquivada no Órion" },
      ],
    });

    await updateDoc(doc(db, "users", ownerId, "fiscalReceipts", receipt.id), {
      warranty: stripUndefined({
        ...receipt.warranty,
        agendaRecordId: agendaId,
      }),
      updatedAt: serverTimestamp(),
    });

    return agendaId;
  };

  const toggleWatchlistTicker: OrionContextValue["toggleWatchlistTicker"] = async (symbol) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}`;
    const next = state.watchlistTickers.includes(symbol)
      ? state.watchlistTickers.filter((t) => t !== symbol)
      : [...state.watchlistTickers, symbol].slice(0, 50);
    try {
      await updateDoc(doc(db, "users", ownerId), {
        watchlistTickers: next,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const exportBackupJson = () => JSON.stringify(state, null, 2);

  const importBackupJson: OrionContextValue["importBackupJson"] = async (jsonText) => {
    const ownerId = requireUid();
    const parsed = JSON.parse(jsonText) as Partial<OrionState>;
    const batch = writeBatch(db);

    if (parsed.pixRecipient || parsed.profile) {
      batch.update(doc(db, "users", ownerId), {
        ...(parsed.profile
          ? {
              name: clampStr(parsed.profile.name, 120) || state.profile.name,
              city: clampStr(parsed.profile.city, 100),
              state: clampStr(parsed.profile.state, 4),
              selectedLogoId: VALID_LOGOS.includes(parsed.profile.selectedLogoId)
                ? parsed.profile.selectedLogoId
                : state.profile.selectedLogoId,
            }
          : {}),
        ...(parsed.pixRecipient
          ? {
              pixRecipient: {
                key: clampStr(parsed.pixRecipient.key, 160),
                name: clampStr(parsed.pixRecipient.name, 120),
                state: clampStr(parsed.pixRecipient.state, 4),
                city: clampStr(parsed.pixRecipient.city, 100),
              },
            }
          : {}),
        ...(Array.isArray(parsed.watchlistTickers)
          ? { watchlistTickers: parsed.watchlistTickers.slice(0, 50) }
          : {}),
        updatedAt: serverTimestamp(),
      });
    }

    for (const b of parsed.banks ?? []) {
      const id = sanitizeId(b.id || uid("bank"));
      batch.set(doc(db, "users", ownerId, "banks", id), {
        ownerId,
        institution: clampStr(b.institution, 80),
        name: clampStr(b.name, 80),
        accountType: b.accountType,
        number: clampStr(b.number, 20),
        balanceCents: Math.trunc(b.balanceCents),
        color: clampStr(b.color || "#173d4a", 20),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const item of parsed.shoppingList ?? []) {
      const id = sanitizeId(item.id || uid("sh"));
      batch.set(doc(db, "users", ownerId, "shoppingList", id), {
        ownerId,
        name: clampStr(item.name, 140),
        category: clampStr(item.category, 60),
        quantity: Math.max(1, Math.trunc(item.quantity)),
        unitPriceCents: Math.max(0, Math.trunc(item.unitPriceCents)),
        checked: Boolean(item.checked),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/import`);
    }
  };

  const executeOrionImport: OrionContextValue["executeOrionImport"] = async (
    plan,
    conflictStrategy,
    onProgress,
  ) => {
    const ownerId = requireUid();
    if (!user?.emailVerified) {
      throw new Error("Conta Google não verificada para gravar dados na nuvem.");
    }

    const eligibleWrites = plan.writes.filter((w) => {
      if (w.blockedByMissingParent) return false;
      if (w.action === "insert") return true;
      return conflictStrategy === "overwrite_with_json";
    });

    const phase1Writes = eligibleWrites.filter((w) => w.phase === 1);
    const phase2Writes = eligibleWrites.filter((w) => w.phase === 2);

    const BATCH_LIMIT = 400;
    const totalToWrite = phase1Writes.length + phase2Writes.length;
    let completed = 0;
    let batchesCommitted = 0;
    let phasesCommitted = 0;

    const toCreatePayload = (w: PlannedDocWrite<{ id: string }>): Record<string, unknown> => {
      const raw = { ...w.doc } as Record<string, unknown>;
      delete raw["id"];
      if (w.collectionName === "revenueContracts") {
        raw["contractDate"] = raw["createdAt"];
        delete raw["createdAt"];
      }
      return stripUndefined({
        ownerId,
        ...raw,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    };

    const toUpdatePayload = (w: PlannedDocWrite<{ id: string }>): Record<string, unknown> => {
      const raw = { ...w.doc } as Record<string, unknown>;
      const allowedKeys = CONFLICT_MUTABLE_KEYS[w.collectionName] ?? [];
      const patch: Record<string, unknown> = {};
      for (const k of allowedKeys) {
        if (k in raw && raw[k] !== undefined) {
          patch[k] = raw[k];
        }
      }
      patch["updatedAt"] = serverTimestamp();
      return patch;
    };

    const commitPhase = async (phaseNum: 1 | 2, list: Array<PlannedDocWrite<{ id: string }>>) => {
      if (list.length === 0) return;
      for (let i = 0; i < list.length; i += BATCH_LIMIT) {
        const chunk = list.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        for (const w of chunk) {
          const ref = doc(db, "users", ownerId, w.collectionName, w.doc.id);
          if (w.action === "insert") {
            batch.set(ref, toCreatePayload(w));
          } else {
            batch.update(ref, toUpdatePayload(w));
          }
        }
        await batch.commit();
        batchesCommitted++;
        completed += chunk.length;
        onProgress?.({ phase: phaseNum, completed, total: totalToWrite });
      }
      phasesCommitted++;
    };

    try {
      await commitPhase(1, phase1Writes);
      await commitPhase(2, phase2Writes);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerId}/orionImport`);
    }

    const insertedCount = eligibleWrites.filter((w) => w.action === "insert").length;
    const conflictsUpdated = eligibleWrites.filter((w) => w.action === "conflict").length;
    const conflictsPreserved =
      conflictStrategy === "keep_existing" ? plan.totals.conflicts : 0;

    return {
      inserted: insertedCount,
      alreadyExists: plan.totals.alreadyExists,
      conflictsUpdated,
      conflictsPreserved,
      unlinkedCount: plan.totals.unlinked,
      skippedEmptyModules: plan.emptyModulesSkipped.length,
      phasesCommitted,
      batchesCommitted,
      importedAt: new Date().toISOString(),
    };
  };

  const clearAllUserData: OrionContextValue["clearAllUserData"] = async () => {
    const ownerId = requireUid();
    try {
      for (const sub of SUBCOLLECTIONS) {
        const snap = await getDocs(
          query(collection(db, "users", ownerId, sub), where("ownerId", "==", ownerId)),
        );
        if (snap.empty) continue;
        for (let i = 0; i < snap.docs.length; i += 400) {
          const chunk = snap.docs.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await updateDoc(doc(db, "users", ownerId), {
        watchlistTickers: [],
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${ownerId}`);
    }
  };

  return (
    <OrionContext.Provider
      value={{
        user,
        authReady,
        workspaceLoading,
        state,
        signInWithGoogle,
        signOutUser,
        updateProfile,
        updateSelectedLogo,
        updatePixRecipient,
        addBankAccount,
        addCreditCard,
        saveCardOverride,
        clearCardOverride,
        addQuickMovement,
        addRevenueSource,
        receiveRevenueEntry,
        correctRevenueEvent,
        reverseRevenueEvent,
        createRevenueContract,
        updateContractStatus,
        updateAnnualCell,
        addAnnualCreditor,
        saveAnnualHistorySnapshot,
        payMonthlyBill,
        payPayableInstallment,
        correctPaymentEvent,
        reversePaymentEvent,
        addMonthlyBill,
        uploadHistoryAttachment,
        attachToHistoryRow,
        removeAttachmentFromHistoryRow,
        savePersonalAgenda,
        deletePersonalAgenda,
        toggleAgendaCheck,
        saveAgendaOverride,
        clearAgendaOverride,
        upsertContactCategory,
        deleteContactCategoryWithRemap,
        upsertContactSubcategory,
        deleteContactSubcategory,
        upsertAgendaContact,
        deleteAgendaContact,
        upsertAgendaAlarm,
        deleteAgendaAlarm,
        upsertAgendaNote,
        deleteAgendaNote,
        sendNoteToCalendar,
        addCalculatorHistory,
        clearCalculatorHistory,
        updateAgendaSettings,
        addShoppingItem,
        toggleShoppingItem,
        removeShoppingItem,
        addVehicle,
        upsertGarageVehicle,
        deleteGarageVehicle,
        upsertGarageDriver,
        deleteGarageDriver,
        addGarageFueling,
        deleteGarageFueling,
        addGarageMaintenance,
        updateGarageMaintenanceStatus,
        deleteGarageMaintenance,
        addGarageExpense,
        deleteGarageExpense,
        addGarageFine,
        updateGarageFineStatus,
        deleteGarageFine,
        addGarageDocument,
        markGarageDocumentPaid,
        deleteGarageDocument,
        addGarageDocumentsBatch: addGarageDocumentsBatch,
        addGarageChecklist,
        addGarageRoute,
        deleteGarageRoute,
        addGarageReminder,
        toggleGarageReminder,
        deleteGarageReminder,
        addFuelLog,
        addTrip,
        updateTripStatus,
        saveFiscalReceipt,
        deleteFiscalReceipt,
        createWarrantyAgendaAlert,
        toggleWatchlistTicker,
        exportBackupJson,
        importBackupJson,
        executeOrionImport,
        clearAllUserData,
      }}
    >
      {children}
    </OrionContext.Provider>
  );
}
