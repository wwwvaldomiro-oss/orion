import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PluggyConnect } from "react-pluggy-connect";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { CheckCircle2, Link2, RefreshCw, Settings, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { fetchApiJson } from "@/lib/apiClient";
import { db } from "@/lib/firebase";
import { useOrion } from "@/store/orionContext";

const PLUGGY_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeCredential(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

type SlotId = "1" | "2";
type StorageMode = "firestore-admin" | "server-preview-vault";

type PluggySlotStatus = {
  slot: SlotId;
  configured: boolean;
  itemIds: string[];
  updatedAt: string | null;
};

type SyncedPayload = {
  banks: Array<{
    id: string;
    institution: string;
    name: string;
    accountType: "CHECKING" | "SAVINGS";
    number: string;
    balanceCents: number;
    color: string;
    sourceRecordId: string;
  }>;
  cards: Array<{
    id: string;
    institution: string;
    name: string;
    brand: "VISA" | "MASTERCARD" | "ELO" | "AMEX" | "HIPERCARD" | "OTHER";
    number: string;
    creditLimitCents: number;
    availableCents: number;
    closingDay: number;
    dueDay: number;
    sourceRecordId: string;
  }>;
  transactions: Array<{
    id: string;
    accountId: string;
    accountType: "BANK" | "CREDIT";
    accountName: string;
    institution: string;
    description: string;
    amountCents: number;
    date: string;
    category: string;
  }>;
};

async function persistSyncedPayloadToClientFirestore(
  ownerId: string,
  payload: SyncedPayload,
): Promise<void> {
  for (const bank of payload.banks) {
    const ref = doc(db, "users", ownerId, "banks", bank.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        institution: bank.institution,
        name: bank.name,
        accountType: bank.accountType,
        number: bank.number,
        balanceCents: bank.balanceCents,
        color: bank.color,
        sourceRecordId: bank.sourceRecordId,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId,
        institution: bank.institution,
        name: bank.name,
        accountType: bank.accountType,
        number: bank.number,
        balanceCents: bank.balanceCents,
        color: bank.color,
        sourceRecordId: bank.sourceRecordId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  for (const card of payload.cards) {
    const ref = doc(db, "users", ownerId, "cards", card.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        institution: card.institution,
        name: card.name,
        brand: card.brand,
        number: card.number,
        creditLimitCents: card.creditLimitCents,
        availableCents: card.availableCents,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        sourceRecordId: card.sourceRecordId,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId,
        institution: card.institution,
        name: card.name,
        brand: card.brand,
        number: card.number,
        creditLimitCents: card.creditLimitCents,
        availableCents: card.availableCents,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        sourceRecordId: card.sourceRecordId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  for (const tx of payload.transactions) {
    const ref = doc(db, "users", ownerId, "transactions", tx.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        description: tx.description,
        amountCents: tx.amountCents,
        date: tx.date,
        category: tx.category,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId,
        accountId: tx.accountId,
        accountType: tx.accountType,
        accountName: tx.accountName,
        institution: tx.institution,
        description: tx.description,
        amountCents: tx.amountCents,
        date: tx.date,
        category: tx.category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }
}

export function PluggySettings() {
  const { user } = useOrion();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode | null>(null);
  const [slots, setSlots] = useState<PluggySlotStatus[]>([
    { slot: "1", configured: false, itemIds: [], updatedAt: null },
    { slot: "2", configured: false, itemIds: [], updatedAt: null },
  ]);

  const [credentials, setCredentials] = useState<Record<SlotId, { clientId: string; clientSecret: string }>>({
    "1": { clientId: "", clientSecret: "" },
    "2": { clientId: "", clientSecret: "" },
  });
  const [savingSlot, setSavingSlot] = useState<SlotId | null>(null);
  const [syncingSlot, setSyncingSlot] = useState<SlotId | null>(null);
  const [connectingSlot, setConnectingSlot] = useState<SlotId | null>(null);
  const [connectWidget, setConnectWidget] = useState<{ slot: SlotId; token: string } | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!user) throw new Error("Faça login com sua conta Google antes de configurar o Pluggy.");
    const token = await user.getIdToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, [user]);

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setServerError(null);
    try {
      const headers = await authHeaders();
      const data = await fetchApiJson<{
        slots?: PluggySlotStatus[];
        storageMode?: StorageMode;
      }>("/api/pluggy/status", {
        headers,
      });
      if (Array.isArray(data.slots)) {
        setSlots(data.slots);
      }
      if (data.storageMode) {
        setStorageMode(data.storageMode);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível carregar o status do Pluggy.";
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, user]);

  useEffect(() => {
    if (open && user) {
      void fetchStatus();
    }
  }, [open, user, fetchStatus]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function saveSlotConfig(slot: SlotId, e: React.FormEvent) {
    e.preventDefault();
    const creds = credentials[slot];
    const cleanClientId = normalizeCredential(creds.clientId);
    const cleanClientSecret = normalizeCredential(creds.clientSecret);
    if (!cleanClientId || !cleanClientSecret) {
      toast.error("Informe Client ID e Client Secret.");
      return;
    }
    if (!PLUGGY_UUID_REGEX.test(cleanClientId)) {
      const msg = PLUGGY_UUID_REGEX.test(cleanClientSecret)
        ? "Client ID e Client Secret parecem estar invertidos: no Meu Pluggy, o Client ID é um UUID (ex.: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."
        : "Client ID inválido: no painel Meu Pluggy, o Client ID precisa ser um UUID válido (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).";
      setServerError(msg);
      toast.error(msg);
      return;
    }
    setSavingSlot(slot);
    setServerError(null);
    try {
      const headers = await authHeaders();
      const res = await fetchApiJson<{ ok?: boolean; storageMode?: StorageMode }>(
        `/api/pluggy/${slot}/config`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            clientId: cleanClientId,
            clientSecret: cleanClientSecret,
          }),
        },
      );
      if (res.storageMode) setStorageMode(res.storageMode);
      setCredentials((prev) => ({ ...prev, [slot]: { clientId: "", clientSecret: "" } }));
      toast.success(`Credenciais de Meu Pluggy ${slot} validadas e salvas com segurança.`);
      await fetchStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar configuração.";
      setServerError(msg);
      toast.error(msg);
    } finally {
      setSavingSlot(null);
    }
  }

  async function openConnect(slot: SlotId) {
    setConnectingSlot(slot);
    setServerError(null);
    try {
      const headers = await authHeaders();
      const data = await fetchApiJson<{ connectToken?: string }>(
        `/api/pluggy/${slot}/connect-token`,
        {
          method: "POST",
          headers,
        },
      );
      if (!data.connectToken) {
        throw new Error("Não foi possível gerar token de conexão Pluggy.");
      }
      setConnectWidget({ slot, token: data.connectToken });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar Pluggy Connect.";
      setServerError(msg);
      toast.error(msg);
    } finally {
      setConnectingSlot(null);
    }
  }

  async function registerConnectedItem(slot: SlotId, itemId: string) {
    try {
      const headers = await authHeaders();
      const res = await fetchApiJson<{ ok?: boolean; storageMode?: StorageMode }>(
        `/api/pluggy/${slot}/item`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ itemId }),
        },
      );
      if (res.storageMode) setStorageMode(res.storageMode);
      toast.success("Instituição vinculada. Clique em Sincronizar agora para buscar contas e extrato.");
      await fetchStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao registrar instituição.";
      setServerError(msg);
      toast.error(msg);
    }
  }

  async function syncSlot(slot: SlotId) {
    if (!user) return;
    setSyncingSlot(slot);
    setServerError(null);
    try {
      const headers = await authHeaders();
      const data = await fetchApiJson<{
        ok?: boolean;
        accounts?: number;
        transactions?: number;
        persistedOnServer?: boolean;
        storageMode?: StorageMode;
        syncedPayload?: SyncedPayload;
      }>(`/api/pluggy/${slot}/sync`, {
        method: "POST",
        headers,
      });
      if (data.storageMode) setStorageMode(data.storageMode);
      if (data.persistedOnServer === false && data.syncedPayload) {
        await persistSyncedPayloadToClientFirestore(user.uid, data.syncedPayload);
      }
      toast.success(
        `Sincronização Pluggy ${slot} concluída: ${data.accounts ?? 0} conta(s) e ${data.transactions ?? 0} movimentação(ões).`,
      );
      await fetchStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro na sincronização Pluggy.";
      setServerError(msg);
      toast.error(msg);
    } finally {
      setSyncingSlot(null);
    }
  }

  const modalNode =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pluggy-modal-title"
            className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0c1928]/65 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          >
            <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[88dvh] sm:rounded-xl">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#edf1f3] px-5 py-4">
                <div>
                  <h3 id="pluggy-modal-title" className="text-base font-semibold text-[#0c1928] sm:text-lg">
                    Open Finance · Conexões Pluggy
                  </h3>
                  <p className="mt-0.5 text-xs text-[#52616a]">
                    Credenciais independentes criptografadas no servidor. Sincronização manual que
                    preserva contas e cartões manuais e não quita obrigações automaticamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar configurações Pluggy"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-6">
                {storageMode === "server-preview-vault" && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    Modo Preview Ativo: suas credenciais Pluggy ficam criptografadas apenas nesta
                    instância do servidor (sem exposição no navegador), enquanto suas contas,
                    cartões e movimentações sincronizadas são gravadas diretamente no seu Firestore.
                  </div>
                )}

                {serverError && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {serverError}
                  </div>
                )}

                <div className="rounded-lg border border-[#dce2e6] bg-[#f7f8fa] px-3 py-2 text-[11px] text-[#52616a]">
                  No painel Meu Pluggy, copie o <strong>Client ID</strong> (formato UUID:{" "}
                  <span className="font-mono">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</span>) no
                  primeiro campo e o <strong>Client Secret</strong> no segundo campo.
                </div>

                {slots.map((slotInfo) => {
                  const slot = slotInfo.slot;
                  const form = credentials[slot];
                  const isSaving = savingSlot === slot;
                  const isSyncing = syncingSlot === slot;
                  const isConnecting = connectingSlot === slot;

                  return (
                    <div
                      key={slot}
                      className="space-y-3 rounded-xl border border-[#dce2e6] bg-[#fafbfc] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-4 text-[#173d4a]" />
                          <span className="text-sm font-semibold text-[#0c1928]">
                            Meu Pluggy {slot}
                          </span>
                          {slotInfo.configured ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <CheckCircle2 className="size-3" /> Configurado
                            </span>
                          ) : (
                            <span className="rounded-full bg-[#e6ecef] px-2 py-0.5 text-[11px] font-semibold text-[#52616a]">
                              Não configurado
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[#52616a]">
                          {slotInfo.itemIds.length} instituição(ões) vinculada(s)
                        </span>
                      </div>

                      <form
                        onSubmit={(e) => void saveSlotConfig(slot, e)}
                        className="grid gap-2.5 sm:grid-cols-5"
                      >
                        <input
                          value={form.clientId}
                          onChange={(e) =>
                            setCredentials((prev) => ({
                              ...prev,
                              [slot]: { ...prev[slot], clientId: e.target.value },
                            }))
                          }
                          placeholder="Client ID (UUID)"
                          autoCapitalize="none"
                          autoCorrect="off"
                          autoComplete="off"
                          spellCheck={false}
                          className="h-10 rounded-lg border border-[#cbd3d8] bg-white px-3 font-mono text-xs sm:col-span-2"
                        />
                        <input
                          type="password"
                          value={form.clientSecret}
                          onChange={(e) =>
                            setCredentials((prev) => ({
                              ...prev,
                              [slot]: { ...prev[slot], clientSecret: e.target.value },
                            }))
                          }
                          placeholder="Client Secret"
                          autoCapitalize="none"
                          autoCorrect="off"
                          autoComplete="off"
                          spellCheck={false}
                          className="h-10 rounded-lg border border-[#cbd3d8] bg-white px-3 text-xs sm:col-span-2"
                        />
                        <button
                          type="submit"
                          disabled={isSaving || loading}
                          className="h-10 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-50"
                        >
                          {isSaving ? "Validando..." : slotInfo.configured ? "Atualizar" : "Salvar"}
                        </button>
                      </form>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={!slotInfo.configured || isConnecting}
                          onClick={() => void openConnect(slot)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] disabled:opacity-50"
                        >
                          <Link2 className="size-3.5 text-[#173d4a]" />
                          {isConnecting ? "Abrindo..." : "Conectar instituição"}
                        </button>

                        <button
                          type="button"
                          disabled={!slotInfo.configured || slotInfo.itemIds.length === 0 || isSyncing}
                          onClick={() => void syncSlot(slot)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-50"
                        >
                          <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                          {isSyncing ? "Sincronizando..." : "Sincronizar agora"}
                        </button>

                        {slotInfo.updatedAt && (
                          <span className="ml-auto text-[11px] text-[#52616a]">
                            Atualizado em{" "}
                            {new Date(slotInfo.updatedAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const connectWidgetNode =
    connectWidget && typeof document !== "undefined"
      ? createPortal(
          <PluggyConnect
            connectToken={connectWidget.token}
            language="pt"
            onSuccess={(payload) => {
              const targetSlot = connectWidget.slot;
              setConnectWidget(null);
              if (payload?.item?.id) {
                void registerConnectedItem(targetSlot, payload.item.id);
              }
            }}
            onError={(err) => {
              toast.error(err?.message || "Erro no widget Pluggy Connect.");
              setConnectWidget(null);
            }}
            onClose={() => setConnectWidget(null)}
          />,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Configurações Pluggy Open Finance"
        title="Configurar Open Finance (Pluggy)"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] whitespace-nowrap"
      >
        <Settings className="size-3.5 text-[#173d4a]" /> Pluggy
      </button>

      {modalNode}
      {connectWidgetNode}
    </>
  );
}
