import { useEffect, useState, type ReactNode } from "react";
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
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { auth, db, googleProvider, handleFirestoreError, OperationType } from "@/lib/firebase";
import { OrionContext, type OrionContextValue } from "@/store/orionContext";
import {
  createEmptyOrionState,
  type AnnualCellState,
  type AnnualExpenseKind,
  type AnnualExpenseRow,
  type AnnualExpenseSource,
  type AnnualYearRecord,
  type BankAccount,
  type BrandLogoId,
  type CardMonthSnapshot,
  type CardMonthSnapshotTransaction,
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
  type PersonalAgendaRecord,
  type PixRecipient,
  type RevenueContract,
  type RevenueEntry,
  type RevenueEvent,
  type RevenueEventSnapshot,
  type RevenueSource,
  type ShoppingItem,
  type TripPlan,
  type VehicleRecord,
  type WalletTransaction,
} from "@/types/orion";
import type { PlannedDocWrite } from "@/lib/domain/orionImporter";
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
  "payableContracts",
  "payableInstallments",
  "personalAgenda",
  "agendaChecks",
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
] as const;

const CONFLICT_MUTABLE_KEYS: Record<PlannedDocWrite<{ id: string }>["collectionName"], string[]> = {
  annualYears: ["sourceName", "archivedAt", "sourceRecordId"],
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
};

export function OrionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [state, setState] = useState<OrionState>(() => createEmptyOrionState());

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
          ...(typeof d["accountId"] === "string" || d["accountId"] === null
            ? { accountId: d["accountId"] as string | null }
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
          beforeData: (d["beforeData"] as RevenueEventSnapshot | null) ?? null,
          afterData: (d["afterData"] as RevenueEventSnapshot | null) ?? null,
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
          ...(typeof d["note"] === "string" ? { note: d["note"] } : {}),
          ...(typeof d["sourceRecordId"] === "string"
            ? { sourceRecordId: d["sourceRecordId"] }
            : {}),
        }),
        (monthlyBills) => setState((prev) => ({ ...prev, monthlyBills })),
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
          description: String(d["description"] ?? ""),
          recurrence: (d["recurrence"] as PersonalAgendaRecord["recurrence"]) ?? "none",
          favorite: Boolean(d["favorite"]),
          reminder: Boolean(d["reminder"]),
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

    try {
      await batch.commit();
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
  ) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/revenueEntries/${entryId}`;
    try {
      await updateDoc(
        doc(db, "users", ownerId, "revenueEntries", entryId),
        stripUndefined({
          receivedCents: Math.max(0, Math.trunc(receivedCents)),
          receivedDate,
          note: note !== undefined ? clampStr(note, 300) : undefined,
          ...(accountId !== undefined ? { accountId } : {}),
          updatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
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

  const updateAnnualCell: OrionContextValue["updateAnnualCell"] = async (rowId, monthKey, cell) => {
    const ownerId = requireUid();
    const row = state.annualExpenses.find((r) => r.id === rowId);
    if (!row) return;
    const period = `${row.year}-${monthKey}`;
    const nextMonths = { ...row.months, [monthKey]: stripUndefined(cell) };
    const batch = writeBatch(db);

    batch.update(doc(db, "users", ownerId, "annualExpenses", rowId), {
      months: nextMonths,
      updatedAt: serverTimestamp(),
    });

    for (const b of state.monthlyBills) {
      if (b.sourceAnnualId === rowId && b.period === period) {
        batch.update(
          doc(db, "users", ownerId, "monthlyBills", b.id),
          stripUndefined({
            expectedCents: Math.max(0, Math.trunc(cell.expectedCents ?? 0)),
            paidCents: cell.paidCents !== null ? Math.trunc(cell.paidCents) : null,
            paidDate: cell.paidDate,
            isSettled: cell.isSettled,
            note: cell.note !== undefined ? clampStr(cell.note, 300) : undefined,
            updatedAt: serverTimestamp(),
          }),
        );
      }
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/annualExpenses/${rowId}`);
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
  ) => {
    const ownerId = requireUid();
    const target = state.monthlyBills.find((b) => b.id === billId);
    const batch = writeBatch(db);

    batch.update(
      doc(db, "users", ownerId, "monthlyBills", billId),
      stripUndefined({
        paidCents: Math.max(0, Math.trunc(paidCents)),
        paidDate,
        isSettled,
        note: note !== undefined ? clampStr(note, 300) : undefined,
        ...(accountId !== undefined ? { accountId } : {}),
        updatedAt: serverTimestamp(),
      }),
    );

    if (target?.sourceAnnualId) {
      const row = state.annualExpenses.find((r) => r.id === target.sourceAnnualId);
      if (row) {
        const monthKey = target.period.slice(5, 7);
        const prev = row.months[monthKey] ?? {
          expectedCents: target.expectedCents,
          paidCents: null,
          paidDate: null,
          isSettled: false,
        };
        batch.update(doc(db, "users", ownerId, "annualExpenses", row.id), {
          months: {
            ...row.months,
            [monthKey]: stripUndefined({
              ...prev,
              paidCents: Math.max(0, Math.trunc(paidCents)),
              paidDate,
              isSettled,
              ...(note !== undefined ? { note: clampStr(note, 300) } : {}),
            }),
          },
          updatedAt: serverTimestamp(),
        });
      }
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ownerId}/monthlyBills/${billId}`);
    }
  };

  const payPayableInstallment: OrionContextValue["payPayableInstallment"] = async (
    installmentId,
    paidCents,
    paidDate,
    isSettled,
    note,
    accountId,
  ) => {
    const ownerId = requireUid();
    const path = `users/${ownerId}/payableInstallments/${installmentId}`;
    try {
      await updateDoc(
        doc(db, "users", ownerId, "payableInstallments", installmentId),
        stripUndefined({
          paidCents: Math.max(0, Math.trunc(paidCents)),
          paidDate,
          isSettled,
          note: note !== undefined ? clampStr(note, 300) : undefined,
          ...(accountId !== undefined ? { accountId } : {}),
          updatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
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
          dueDate: bill.dueDate,
          expectedCents: Math.max(0, Math.trunc(bill.expectedCents)),
          paidDate: null,
          paidCents: null,
          isSettled: false,
          sourceAnnualId: bill.sourceAnnualId,
          note: bill.note ? clampStr(bill.note, 300) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const savePersonalAgenda: OrionContextValue["savePersonalAgenda"] = async (record) => {
    const ownerId = requireUid();
    const id = record.id ?? uid("ag");
    const path = `users/${ownerId}/personalAgenda/${id}`;
    const payload = stripUndefined({
      kind: record.kind,
      title: clampStr(record.title, 160),
      startDate: record.startDate,
      time: clampStr(record.time, 10),
      endTime: record.endTime ? clampStr(record.endTime, 10) : undefined,
      description: clampStr(record.description, 500),
      recurrence: record.recurrence,
      favorite: record.favorite,
      reminder: record.reminder,
      items: record.items.slice(0, 30),
      updatedAt: serverTimestamp(),
    });

    try {
      if (record.id) {
        await updateDoc(doc(db, "users", ownerId, "personalAgenda", id), payload);
      } else {
        await setDoc(doc(db, "users", ownerId, "personalAgenda", id), {
          ownerId,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        record.id ? OperationType.UPDATE : OperationType.CREATE,
        path,
      );
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
        createRevenueContract,
        updateContractStatus,
        updateAnnualCell,
        addAnnualCreditor,
        payMonthlyBill,
        payPayableInstallment,
        addMonthlyBill,
        savePersonalAgenda,
        deletePersonalAgenda,
        toggleAgendaCheck,
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
