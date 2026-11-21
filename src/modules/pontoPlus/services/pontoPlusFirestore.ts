import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "@/lib/firebase";
import type {
  FamilyHolder,
  LoyaltyAccount,
  PointTransaction,
} from "../types";
import { sanitizeId } from "../utils/formatters";

function createUniqueId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeId(`${prefix}_${Date.now()}_${rand}`);
}

export function subscribePontoPlusPortfolio(
  uid: string,
  callbacks: {
    onHolders: (items: FamilyHolder[]) => void;
    onAccounts: (items: LoyaltyAccount[]) => void;
    onTransactions: (items: PointTransaction[]) => void;
    onError: (err: Error) => void;
  },
): () => void {
  const holdersQ = query(
    collection(db, "users", uid, "loyaltyHolders"),
    where("ownerId", "==", uid),
  );
  const accountsQ = query(
    collection(db, "users", uid, "loyaltyAccounts"),
    where("ownerId", "==", uid),
  );
  const txQ = query(
    collection(db, "users", uid, "pointTransactions"),
    where("ownerId", "==", uid),
  );

  const unsub1 = onSnapshot(
    holdersQ,
    (snap) => {
      callbacks.onHolders(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FamilyHolder, "id">),
        })),
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/loyaltyHolders`);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    },
  );

  const unsub2 = onSnapshot(
    accountsQ,
    (snap) => {
      callbacks.onAccounts(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LoyaltyAccount, "id">),
        })),
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/loyaltyAccounts`);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    },
  );

  const unsub3 = onSnapshot(
    txQ,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<PointTransaction, "id">),
      }));
      items.sort((a, b) => b.date.localeCompare(a.date));
      callbacks.onTransactions(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/pointTransactions`);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    },
  );

  return () => {
    unsub1();
    unsub2();
    unsub3();
  };
}

export async function createLoyaltyHolderDoc(
  uid: string,
  input: Omit<FamilyHolder, "id" | "ownerId">,
): Promise<FamilyHolder> {
  const id = createUniqueId("holder");
  const safeName = (input.name.trim() || "Titular").slice(0, 80);
  const payload = {
    ownerId: uid,
    name: safeName,
    relationship: input.relationship,
    cpfMasked: input.cpfMasked.slice(0, 20),
    notes: input.notes.slice(0, 200),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, "users", uid, "loyaltyHolders", id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/loyaltyHolders/${id}`);
  }

  return {
    id,
    ownerId: uid,
    name: safeName,
    relationship: input.relationship,
    cpfMasked: payload.cpfMasked,
    notes: payload.notes,
  };
}

export async function deleteLoyaltyHolderDoc(uid: string, holderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "users", uid, "loyaltyHolders", holderId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/loyaltyHolders/${holderId}`);
  }
}

export async function createLoyaltyAccountDoc(
  uid: string,
  input: Omit<LoyaltyAccount, "id" | "ownerId">,
  todayDate: string,
  options?: { autoHolderName?: string },
): Promise<void> {
  const id = createUniqueId("lacc");
  const batch = writeBatch(db);

  let resolvedHolderId = input.holderId;
  let resolvedHolderName = input.holderName;

  if (!resolvedHolderId || resolvedHolderId === "__AUTO_HOLDER__") {
    const newHolderId = createUniqueId("holder");
    resolvedHolderId = newHolderId;
    resolvedHolderName = (options?.autoHolderName || input.holderName || "Titular Principal")
      .trim()
      .slice(0, 80);
    batch.set(doc(db, "users", uid, "loyaltyHolders", newHolderId), {
      ownerId: uid,
      name: resolvedHolderName,
      relationship: "Titular",
      cpfMasked: "",
      notes: "Criado automaticamente ao cadastrar a primeira conta.",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const safeBalance = Math.max(0, Math.round(input.balance));
  const safeExpiring = Math.max(0, Math.round(input.expiringPoints));
  const safeAvgCpm = Math.max(0, Number(input.avgCpm.toFixed(2)));
  const safeCpfsUsed = Math.min(50, Math.max(0, Math.round(input.cpfsUsed)));
  const safeCpfLimit = Math.min(50, Math.max(0, Math.round(input.cpfLimit)));

  batch.set(doc(db, "users", uid, "loyaltyAccounts", id), {
    ownerId: uid,
    holderId: resolvedHolderId,
    holderName: (resolvedHolderName || "Titular").slice(0, 80),
    programId: input.programId.slice(0, 40),
    programName: input.programName.slice(0, 60),
    category: input.category,
    accountNumber: input.accountNumber.slice(0, 40),
    tier: input.tier.slice(0, 40),
    balance: safeBalance,
    expiringPoints: safeExpiring,
    expirationDate: input.expirationDate.slice(0, 20),
    avgCpm: safeAvgCpm,
    cpfsUsed: safeCpfsUsed,
    cpfLimit: safeCpfLimit,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (safeBalance > 0) {
    const txId = createUniqueId("ptx");
    batch.set(doc(db, "users", uid, "pointTransactions", txId), {
      ownerId: uid,
      accountId: id,
      programName: input.programName.slice(0, 60),
      holderName: (resolvedHolderName || "Titular").slice(0, 80),
      type: "acumulo",
      points: safeBalance,
      description: `Saldo inicial importado - ${input.programName}`.slice(0, 140),
      date: todayDate,
      cpm: safeAvgCpm,
      totalBrl: Number(((safeBalance / 1000) * safeAvgCpm).toFixed(2)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/loyaltyAccounts/${id}`);
  }
}

export async function updateLoyaltyAccountDoc(
  uid: string,
  accountId: string,
  patch: Partial<
    Pick<
      LoyaltyAccount,
      | "accountNumber"
      | "tier"
      | "cpfLimit"
      | "cpfsUsed"
      | "expiringPoints"
      | "expirationDate"
      | "avgCpm"
      | "balance"
      | "holderId"
      | "holderName"
    >
  >,
): Promise<void> {
  const sanitizedPatch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (patch.accountNumber !== undefined) sanitizedPatch["accountNumber"] = patch.accountNumber.slice(0, 40);
  if (patch.tier !== undefined) sanitizedPatch["tier"] = patch.tier.slice(0, 40);
  if (patch.cpfLimit !== undefined) sanitizedPatch["cpfLimit"] = Math.min(50, Math.max(0, Math.round(patch.cpfLimit)));
  if (patch.cpfsUsed !== undefined) sanitizedPatch["cpfsUsed"] = Math.min(50, Math.max(0, Math.round(patch.cpfsUsed)));
  if (patch.expiringPoints !== undefined) sanitizedPatch["expiringPoints"] = Math.max(0, Math.round(patch.expiringPoints));
  if (patch.expirationDate !== undefined) sanitizedPatch["expirationDate"] = patch.expirationDate.slice(0, 20);
  if (patch.avgCpm !== undefined) sanitizedPatch["avgCpm"] = Math.max(0, Number(patch.avgCpm.toFixed(2)));
  if (patch.balance !== undefined) sanitizedPatch["balance"] = Math.max(0, Math.round(patch.balance));
  if (patch.holderId !== undefined) sanitizedPatch["holderId"] = patch.holderId;
  if (patch.holderName !== undefined) sanitizedPatch["holderName"] = patch.holderName.slice(0, 80);

  try {
    await updateDoc(doc(db, "users", uid, "loyaltyAccounts", accountId), sanitizedPatch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/loyaltyAccounts/${accountId}`);
  }
}

export async function deleteLoyaltyAccountDoc(uid: string, accountId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "users", uid, "loyaltyAccounts", accountId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/loyaltyAccounts/${accountId}`);
  }
}

export async function addPointTransactionBatch(
  uid: string,
  account: LoyaltyAccount,
  txInput: Omit<PointTransaction, "id" | "ownerId" | "accountId" | "programName" | "holderName">,
  incrementCpfs = 0,
): Promise<void> {
  const txId = createUniqueId("ptx");
  const batch = writeBatch(db);

  const signedPoints = Math.round(txInput.points);
  const newBalance = Math.max(0, Math.round(account.balance + signedPoints));

  let newAvgCpm = account.avgCpm;
  if (signedPoints > 0 && txInput.totalBrl > 0 && newBalance > 0) {
    const oldValue = (account.balance / 1000) * account.avgCpm;
    const totalCost = oldValue + txInput.totalBrl;
    newAvgCpm = (totalCost / newBalance) * 1000;
  }

  batch.set(doc(db, "users", uid, "pointTransactions", txId), {
    ownerId: uid,
    accountId: account.id,
    programName: account.programName.slice(0, 60),
    holderName: account.holderName.slice(0, 80),
    type: txInput.type,
    points: signedPoints,
    description: txInput.description.slice(0, 140),
    date: txInput.date.slice(0, 20),
    cpm: Math.max(0, Number(txInput.cpm.toFixed(2))),
    totalBrl: Math.max(0, Number(txInput.totalBrl.toFixed(2))),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, "users", uid, "loyaltyAccounts", account.id), {
    balance: newBalance,
    expiringPoints:
      signedPoints < 0
        ? Math.max(0, account.expiringPoints + signedPoints)
        : account.expiringPoints,
    expirationDate: account.expirationDate,
    avgCpm: Math.max(0, Number(newAvgCpm.toFixed(2))),
    cpfsUsed: Math.min(50, Math.max(0, account.cpfsUsed + incrementCpfs)),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/pointTransactions/${txId}`);
  }
}
