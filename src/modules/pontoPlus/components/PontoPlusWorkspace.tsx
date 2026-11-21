import { useState } from "react";
import {
  ArrowLeftRight,
  Award,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Users,
} from "lucide-react";
import { usePontoPlusPortfolio } from "../hooks/usePontoPlusPortfolio";
import { useExpirationNotifications } from "../hooks/useExpirationNotifications";
import type { AppSection, LoyaltyAccount } from "../types";
import { AccountModal } from "./AccountModal";
import { DashboardView } from "./DashboardView";
import { ExpirationToastStack } from "./ExpirationToastStack";
import { LedgerView } from "./LedgerView";
import { NotificationCenter } from "./NotificationCenter";
import { ProgramsView } from "./ProgramsView";
import { TransactionModal } from "./TransactionModal";
import { TransfersFamilyView } from "./TransfersFamilyView";

export function PontoPlusWorkspace() {
  const {
    userKey,
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
  } = usePontoPlusPortfolio();

  const [activeSection, setActiveSection] = useState<AppSection>("dashboard");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<LoyaltyAccount | null>(null);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txDefaultAccountId, setTxDefaultAccountId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const notificationsEnabled = userKey !== "guest" && !dataLoading;

  const {
    notifications,
    unreadCount,
    liveToasts,
    thresholdDays,
    dismissedCount,
    setThresholdDays,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    dismissToast,
    resetDismissed,
  } = useExpirationNotifications(userKey, accounts, notificationsEnabled);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const navItems: Array<{
    id: AppSection;
    label: string;
    icon: typeof LayoutDashboard;
  }> = [
    { id: "dashboard", label: "Visão Geral", icon: LayoutDashboard },
    { id: "programs", label: "Programas", icon: Award },
    { id: "family", label: "Familiares & CPFs", icon: Users },
    { id: "ledger", label: "Extrato", icon: ReceiptText },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar integrada do Ponto Plus dentro do módulo Viagens */}
      <div className="bg-white border border-[#dce2e6] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#f4f6f8] p-1 rounded-xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? "bg-[#173d4a] text-white shadow-xs"
                    : "text-[#52616a] hover:text-[#0c1928] hover:bg-white/70"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            thresholdDays={thresholdDays}
            dismissedCount={dismissedCount}
            onChangeThreshold={setThresholdDays}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onDismiss={dismissNotification}
            onResetDismissed={resetDismissed}
            onViewPrograms={() => setActiveSection("programs")}
            onEditAccount={(acc) => {
              setEditingAccount(acc);
              setAccountModalOpen(true);
            }}
          />

          <button
            type="button"
            onClick={() => {
              setTxDefaultAccountId(accounts[0]?.id || null);
              setTxModalOpen(true);
            }}
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0c1928] bg-white border border-[#cbd3d8] rounded-lg hover:bg-[#f7f8fa] disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Lançamento</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingAccount(null);
              setAccountModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#173d4a] rounded-lg hover:bg-[#0c1928] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Conta</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {dataLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((k) => (
              <div
                key={k}
                className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse"
              />
            ))}
          </div>
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {activeSection === "dashboard" && (
            <DashboardView
              accounts={accounts}
              holders={holders}
              transactions={transactions}
              onNavigate={setActiveSection}
              onOpenNewAccount={() => {
                setEditingAccount(null);
                setAccountModalOpen(true);
              }}
              onEditAccount={(acc) => {
                setEditingAccount(acc);
                setAccountModalOpen(true);
              }}
            />
          )}

          {activeSection === "programs" && (
            <ProgramsView
              accounts={accounts}
              holders={holders}
              onOpenNewAccount={() => {
                setEditingAccount(null);
                setAccountModalOpen(true);
              }}
              onEditAccount={(acc) => {
                setEditingAccount(acc);
                setAccountModalOpen(true);
              }}
              onDeleteAccount={async (id) => {
                await removeAccount(id);
                notify("Conta removida da carteira.");
              }}
              onOpenNewTx={(accId) => {
                setTxDefaultAccountId(accId);
                setTxModalOpen(true);
              }}
            />
          )}

          {activeSection === "family" && (
            <TransfersFamilyView
              accounts={accounts}
              holders={holders}
              onAddHolder={async (input) => {
                await addHolder(input);
              }}
              onDeleteHolder={removeHolder}
              onNotify={notify}
            />
          )}

          {activeSection === "ledger" && (
            <LedgerView
              transactions={transactions}
              accounts={accounts}
              onNotify={notify}
            />
          )}
        </>
      )}

      <AccountModal
        open={accountModalOpen}
        editingAccount={editingAccount}
        holders={holders}
        onClose={() => {
          setAccountModalOpen(false);
          setEditingAccount(null);
        }}
        onSaveNew={async (input) => {
          await addAccount(input);
          notify(`${input.programName} conectado à sua carteira.`);
        }}
        onSaveEdit={async (id, patch) => {
          await editAccount(id, patch);
          notify("Dados da conta atualizados.");
        }}
      />

      <TransactionModal
        open={txModalOpen}
        accounts={accounts}
        defaultAccountId={txDefaultAccountId}
        onClose={() => setTxModalOpen(false)}
        onSave={async (acc, tx, cpfs) => {
          await addTransaction(acc, tx, cpfs);
          notify("Lançamento registrado no extrato.");
        }}
      />

      <ExpirationToastStack
        toasts={liveToasts}
        hasActionToast={Boolean(toastMsg)}
        onDismissToast={(sig) => {
          markAsRead(sig);
          dismissToast(sig);
        }}
        onInspectAccount={(acc, sig) => {
          markAsRead(sig);
          dismissToast(sig);
          setEditingAccount(acc);
          setAccountModalOpen(true);
        }}
      />

      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 max-w-sm bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-lg shadow-lg border border-slate-800"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
