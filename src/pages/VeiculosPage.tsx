import { useState } from "react";
import {
  Bell,
  CarFront,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  Plus,
  ReceiptText,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { GarageProvider } from "@/modules/garagem/context/GarageContext";
import { useGarage } from "@/modules/garagem/context/garageContext";
import { DriverFormModal } from "@/modules/garagem/components/DriverFormModal";
import { QuickEntryModal } from "@/modules/garagem/components/QuickEntryModal";
import { ReminderFormModal } from "@/modules/garagem/components/ReminderFormModal";
import { VehicleFormModal } from "@/modules/garagem/components/VehicleFormModal";
import { ChecklistsPage } from "@/modules/garagem/pages/ChecklistsPage";
import { DashboardPage } from "@/modules/garagem/pages/DashboardPage";
import { DocumentsDebtsPage } from "@/modules/garagem/pages/DocumentsDebtsPage";
import { LedgerPage } from "@/modules/garagem/pages/LedgerPage";
import { RoutesRemindersPage } from "@/modules/garagem/pages/RoutesRemindersPage";
import { VehiclesDriversPage } from "@/modules/garagem/pages/VehiclesDriversPage";
import type {
  GarageTab,
  PersonalDriver,
  PersonalVehicle,
} from "@/modules/garagem/types/garage.types";

const GARAGE_TABS: Array<{
  id: GarageTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "Resumo", icon: LayoutDashboard },
  { id: "veiculos", label: "Veículos & CNH", icon: CarFront },
  { id: "lancamentos", label: "Abastecimentos & Gastos", icon: ReceiptText },
  { id: "documentos", label: "IPVA, Seguro & Multas", icon: FileCheck2 },
  { id: "checklists", label: "Checklists", icon: ClipboardCheck },
  { id: "percursos", label: "Viagens & Lembretes", icon: Bell },
];

function GaragemWorkspace() {
  const {
    snapshot,
    activeTab,
    setActiveTab,
    selectedVehicleFilter,
    setSelectedVehicleFilter,
    openQuickEntry,
  } = useGarage();

  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<PersonalVehicle | null>(null);
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<PersonalDriver | null>(null);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);

  const openNewVehicle = () => {
    setEditingVehicle(null);
    setVehicleModalOpen(true);
  };

  const openEditVehicle = (v: PersonalVehicle) => {
    setEditingVehicle(v);
    setVehicleModalOpen(true);
  };

  const openNewDriver = () => {
    setEditingDriver(null);
    setDriverModalOpen(true);
  };

  const openEditDriver = (d: PersonalDriver) => {
    setEditingDriver(d);
    setDriverModalOpen(true);
  };

  return (
    <AppShell
      title="Garagem & Viagens"
      subtitle="Controle pessoal de veículos, consumo real (km/L), revisões, IPVA/FIPE, multas e roteiros"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {snapshot.vehicles.length > 0 && (
            <select
              value={selectedVehicleFilter}
              onChange={(e) => setSelectedVehicleFilter(e.target.value)}
              aria-label="Filtrar por veículo"
              className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-semibold text-[#0c1928]"
            >
              <option value="TODOS">Todos os veículos ({snapshot.vehicles.length})</option>
              {snapshot.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.model}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => openQuickEntry("abastecimento")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#173d4a] bg-white px-3 text-xs font-semibold text-[#173d4a] hover:bg-[#edf1f3] whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Novo Registro
          </button>
          <button
            type="button"
            onClick={openNewVehicle}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928] whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Novo Veículo
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Sub-navigation bar */}
        <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-[#dce2e6] bg-white p-1.5">
          {GARAGE_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? "bg-[#173d4a] text-white"
                    : "text-[#52616a] hover:bg-[#f7f8fa] hover:text-[#0c1928]"
                }`}
              >
                <tab.icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "dashboard" && <DashboardPage onRequestNewVehicle={openNewVehicle} />}
        {activeTab === "veiculos" && (
          <VehiclesDriversPage
            onNewVehicle={openNewVehicle}
            onEditVehicle={openEditVehicle}
            onNewDriver={openNewDriver}
            onEditDriver={openEditDriver}
          />
        )}
        {activeTab === "lancamentos" && <LedgerPage />}
        {activeTab === "documentos" && <DocumentsDebtsPage />}
        {activeTab === "checklists" && <ChecklistsPage />}
        {activeTab === "percursos" && (
          <RoutesRemindersPage onNewReminder={() => setReminderModalOpen(true)} />
        )}
      </div>

      {/* Modals */}
      <VehicleFormModal
        open={vehicleModalOpen}
        onClose={() => setVehicleModalOpen(false)}
        editingVehicle={editingVehicle}
      />
      <DriverFormModal
        open={driverModalOpen}
        onClose={() => setDriverModalOpen(false)}
        editingDriver={editingDriver}
      />
      <ReminderFormModal
        open={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
      />
      <QuickEntryModal />
    </AppShell>
  );
}

export function VeiculosPage() {
  return (
    <GarageProvider>
      <GaragemWorkspace />
    </GarageProvider>
  );
}
