import { useCallback, useEffect, useState } from "react";
import { useOrion } from "@/store/orionContext";
import type {
  FamilyHolder,
  LoyaltyAccount,
  PointTransaction,
} from "../types";
import {
  addPointTransactionBatch,
  createLoyaltyAccountDoc,
  createLoyaltyHolderDoc,
  deleteLoyaltyAccountDoc,
  deleteLoyaltyHolderDoc,
  subscribePontoPlusPortfolio,
  updateLoyaltyAccountDoc,
} from "../services/pontoPlusFirestore";
import { getTodayISO } from "../utils/formatters";

export function usePontoPlusPortfolio() {
  const { user, state } = useOrion();
  const [holders, setHolders] = useState<FamilyHolder[]>([]);
  const [accounts, setAccounts] = useState<LoyaltyAccount[]>([]);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setHolders([]);
      setAccounts([]);
      setTransactions([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    setErrorMsg(null);
    let settled = false;

    const unsub = subscribePontoPlusPortfolio(user.uid, {
      onHolders: (items) => {
        setHolders(items);
        if (!settled) {
          settled = true;
          setDataLoading(false);
        }
      },
      onAccounts: (items) => {
        setAccounts(items);
        if (!settled) {
          settled = true;
          setDataLoading(false);
        }
      },
      onTransactions: (items) => {
        setTransactions(items);
        if (!settled) {
          settled = true;
          setDataLoading(false);
        }
      },
      onError: (err) => {
        setErrorMsg(err.message || "Erro ao sincronizar carteira de pontos.");
        setDataLoading(false);
      },
    });

    return () => unsub();
  }, [user?.uid]);

  const addHolder = useCallback(
    async (input: Omit<FamilyHolder, "id" | "ownerId">) => {
      if (!user?.uid) throw new Error("Usuário não autenticado.");
      return createLoyaltyHolderDoc(user.uid, input);
    },
    [user?.uid],
  );

  const removeHolder = useCallback(
    async (holderId: string) => {
      if (!user?.uid) throw new Error("Usuário não autenticado.");
      await deleteLoyaltyHolderDoc(user.uid, holderId);
    },
    [user?.uid],
  );

  const addAccount = useCallback(
    async (input: Omit<LoyaltyAccount, "id" | "ownerId">) => {
      if (!user?.uid) throw new Error("Usuário não autenticado.");
      const today = getTodayISO();
      const autoHolderName =
        state.profile?.name || user.displayName || user.email?.split("@")[0] || "Titular Principal";
      await createLoyaltyAccountDoc(user.uid, input, today, { autoHolderName });
    },
    [user?.uid, user?.displayName, user?.email, state.profile?.name],
  );

  const editAccount = useCallback(
    async (
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
    ) => {
      if (!user?.uid) throw new Error("Usuário não autenticado.");
      await updateLoyaltyAccountDoc(user.uid, accountId, patch);
    },
    [user?.uid],
  );

  const removeAccount = useCallback(
    async (accountId: string) => {
      if (!user?.uid) throw new Error("Usuário não autenticado.");
      await deleteLoyaltyAccountDoc(user.uid, accountId);
    },
    [user?.uid],
  );

  const addTransaction = useCallback(
    async (
      account: LoyaltyAccount,
      txInput: Omit<PointTransaction, "id" | "ownerId" | "accountId" | "programName" | "holderName">,
      incrementCpfs = 0,
    ) => {
      if (!user?.uid) throw new Error("Usuário não autenticado.");
      await addPointTransactionBatch(user.uid, account, txInput, incrementCpfs);
    },
    [user?.uid],
  );

  return {
    userKey: user?.uid || "guest",
    holders,
    accounts,
    transactions,
    dataLoading,
    errorMsg,
    addHolder,
    removeHolder,
    addAccount,
    editAccount,
    removeAccount,
    addTransaction,
  };
}
