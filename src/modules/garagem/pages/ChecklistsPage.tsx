import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { todayBR } from "@/lib/domain/money";
import { useGarage } from "../context/garageContext";
import type { ChecklistItemResult } from "../types/garage.types";
import {
  checkDriverAndVehicleCompliance,
  formatDateBR,
  formatKm,
} from "../utils/garage.calculations";

const DEFAULT_CHECKLIST_ITEMS: Array<{ id: string; label: string }> = [
  { id: "i1", label: "Calibragem e estado dos pneus (incluindo estepe)" },
  { id: "i2", label: "Faróis, lanternas, setas e luzes de freio" },
  { id: "i3", label: "Nível de óleo do motor e fluido de arrefecimento" },
  { id: "i4", label: "Sistema de freios e freio de estacionamento" },
  { id: "i5", label: "Para-brisa, palhetas, água do limpador e retrovisores" },
  { id: "i6", label: "CRLV-e digital, CNH válida e triângulo/macaco" },
];

export const ChecklistsPage: React.FC = () => {
  const { snapshot, selectedVehicleFilter, addChecklist } = useGarage();
  const defaultVehId =
    selectedVehicleFilter !== "TODOS"
      ? selectedVehicleFilter
      : snapshot.vehicles[0]?.id ?? "";

  const [vehicleId, setVehicleId] = useState(defaultVehId);
  const [driverId, setDriverId] = useState(snapshot.drivers[0]?.id ?? "");
  const [date, setDate] = useState(todayBR());
  const [odometer, setOdometer] = useState("0");
  const [generalNotes, setGeneralNotes] = useState("");
  const [autoCreateMaintenance, setAutoCreateMaintenance] = useState(true);
  const [setVehicleInMaintenance, setSetVehicleInMaintenance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ChecklistItemResult[]>(() =>
    DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item, compliant: true })),
  );
  const [expandedId, setExpandedId] = useState<string | null>(
    snapshot.checklists[0]?.id ?? null,
  );

  useEffect(() => {
    const veh = snapshot.vehicles.find((v) => v.id === vehicleId) ?? snapshot.vehicles[0];
    if (veh) {
      if (!vehicleId) setVehicleId(veh.id);
      setOdometer(String(veh.currentOdometer));
      if (veh.assignedDriverId) setDriverId(veh.assignedDriverId);
    }
  }, [vehicleId, snapshot.vehicles]);

  useEffect(() => {
    if (selectedVehicleFilter !== "TODOS") {
      setVehicleId(selectedVehicleFilter);
    }
  }, [selectedVehicleFilter]);

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles],
  );
  const driverMap = useMemo(
    () => new Map(snapshot.drivers.map((d) => [d.id, d])),
    [snapshot.drivers],
  );

  const filteredHistory = useMemo(() => {
    return snapshot.checklists
      .filter((c) => selectedVehicleFilter === "TODOS" || c.vehicleId === selectedVehicleFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [snapshot.checklists, selectedVehicleFilter]);

  const compliance = useMemo(
    () =>
      checkDriverAndVehicleCompliance(
        vehicleMap.get(vehicleId),
        driverMap.get(driverId),
        snapshot,
        date,
      ),
    [vehicleMap, driverMap, vehicleId, driverId, snapshot, date],
  );

  const hasIssues = items.some((it) => !it.compliant);

  const setItemCompliant = (itemId: string, compliant: boolean) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, compliant } : it)));
  };

  const setItemNote = (itemId: string, note: string) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, note } : it)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) {
      toast.error("Cadastre e selecione um veículo antes de salvar o checklist.");
      return;
    }
    setSubmitting(true);
    try {
      await addChecklist(
        {
          vehicleId,
          driverId: driverId || undefined,
          date,
          odometer: Number(odometer) || 0,
          items,
          hasIssues,
          generalNotes: generalNotes.trim() || undefined,
        },
        {
          autoCreateMaintenance: hasIssues && autoCreateMaintenance,
          setVehicleInMaintenance: hasIssues && setVehicleInMaintenance,
        },
      );
      setItems(DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item, compliant: true })));
      setGeneralNotes("");
      toast.success(
        hasIssues && autoCreateMaintenance
          ? "Checklist salvo e revisão corretiva aberta automaticamente."
          : "Checklist pré-viagem registrado.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Inspection Form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-4 rounded-2xl border border-[#dce2e6] bg-white p-5"
      >
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-[#173d4a]" />
          <div>
            <h2 className="text-base font-bold text-[#0c1928]">Checklist Pré-Viagem Pessoal</h2>
            <p className="text-xs text-[#52616a]">
              Conferência rápida antes de pegar a estrada ou após revisão
            </p>
          </div>
        </div>

        {compliance.warnings.length > 0 && (
          <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="size-4 text-amber-700" /> Pontos de atenção antes de sair
            </div>
            {compliance.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#52616a]">Veículo *</label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
            >
              <option value="">Selecione...</option>
              {snapshot.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.model}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#52616a]">Data *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-xs"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#52616a]">Hodômetro (km)</label>
            <input
              type="number"
              min={0}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
            />
          </div>
        </div>

        {snapshot.drivers.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#52616a]">
              Condutor (opcional)
            </label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
            >
              <option value="">Não informado</option>
              {snapshot.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border p-3 ${
                item.compliant ? "border-[#edf1f3] bg-[#f7f8fa]" : "border-amber-200 bg-amber-50/70"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#0c1928]">{item.label}</span>
                <div className="inline-flex rounded-lg border border-[#dce2e6] bg-white p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setItemCompliant(item.id, true)}
                    className={`rounded-md px-2.5 py-1 ${
                      item.compliant ? "bg-emerald-600 text-white" : "text-[#52616a]"
                    }`}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemCompliant(item.id, false)}
                    className={`rounded-md px-2.5 py-1 ${
                      !item.compliant ? "bg-amber-600 text-white" : "text-[#52616a]"
                    }`}
                  >
                    Atenção
                  </button>
                </div>
              </div>
              {!item.compliant && (
                <input
                  value={item.note ?? ""}
                  onChange={(e) => setItemNote(item.id, e.target.value)}
                  placeholder="Descreva o problema (ex.: Pneu traseiro direito baixo)..."
                  className="mt-2 h-8 w-full rounded-lg border border-amber-300 bg-white px-2.5 text-xs"
                />
              )}
            </div>
          ))}
        </div>

        {hasIssues && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
            <label className="flex items-center gap-2 font-semibold text-amber-900">
              <input
                type="checkbox"
                checked={autoCreateMaintenance}
                onChange={(e) => setAutoCreateMaintenance(e.target.checked)}
                className="size-4 accent-[#173d4a]"
              />
              Abrir manutenção em aberto automaticamente para itens com atenção
            </label>
            <label className="flex items-center gap-2 font-semibold text-amber-900">
              <input
                type="checkbox"
                checked={setVehicleInMaintenance}
                onChange={(e) => setSetVehicleInMaintenance(e.target.checked)}
                className="size-4 accent-[#173d4a]"
              />
              Alterar status do veículo para &quot;Em revisão&quot;
            </label>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-[#52616a]">
            Observações gerais
          </label>
          <textarea
            rows={2}
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            placeholder="Notas opcionais da vistoria..."
            className="w-full rounded-lg border border-[#cbd3d8] p-2.5 text-xs"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || snapshot.vehicles.length === 0}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-50"
        >
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          Salvar Checklist
        </button>
      </form>

      {/* History */}
      <div className="space-y-3 rounded-2xl border border-[#dce2e6] bg-white p-5">
        <h3 className="text-base font-bold text-[#0c1928]">Histórico de Inspeções</h3>
        {filteredHistory.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#52616a]">
            Nenhum checklist pré-viagem salvo ainda.
          </p>
        ) : (
          <div className="space-y-2.5">
            {filteredHistory.map((chk) => {
              const veh = vehicleMap.get(chk.vehicleId);
              const isOpen = expandedId === chk.id;
              return (
                <div
                  key={chk.id}
                  className="overflow-hidden rounded-xl border border-[#edf1f3] bg-[#f7f8fa]"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : chk.id)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {chk.hasIssues ? (
                        <AlertTriangle className="size-4 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      )}
                      <div>
                        <div className="font-bold text-[#0c1928]">
                          {veh?.plate ?? "Veículo"} · {formatDateBR(chk.date)}
                        </div>
                        <div className="text-[#52616a]">
                          {formatKm(chk.odometer)} · {chk.items.filter((i) => i.compliant).length}/
                          {chk.items.length} OK
                        </div>
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="size-4 text-[#52616a]" />
                    ) : (
                      <ChevronDown className="size-4 text-[#52616a]" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="space-y-1.5 border-t border-[#edf1f3] bg-white px-4 py-3 text-xs">
                      {chk.items.map((it) => (
                        <div key={it.id} className="flex items-start justify-between gap-2">
                          <span className={it.compliant ? "text-[#0c1928]" : "font-semibold text-amber-800"}>
                            {it.label}
                            {it.note ? ` — ${it.note}` : ""}
                          </span>
                          <span
                            className={`shrink-0 font-semibold ${
                              it.compliant ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {it.compliant ? "OK" : "Atenção"}
                          </span>
                        </div>
                      ))}
                      {chk.generalNotes && (
                        <p className="pt-1 text-[11px] text-[#52616a]">Nota: {chk.generalNotes}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
