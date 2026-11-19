import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CarFront,
  Fuel,
  Loader2,
  MapPin,
  QrCode,
  ReceiptText,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { todayBR } from "@/lib/domain/money";
import { useGarage } from "../context/garageContext";
import {
  fineSchema,
  fuelingSchema,
  maintenanceSchema,
  personalExpenseSchema,
  routeTripSchema,
} from "../schemas/garage.schemas";
import type { FineStatus, FuelType, MaintenanceType, QuickEntryKind } from "../types/garage.types";
import {
  formatReaisBRL,
  getFuelUnit,
  parseNfceQrPayload,
  suggestDriverForDate,
} from "../utils/garage.calculations";

const ENTRY_TABS: Array<{ id: QuickEntryKind; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "abastecimento", label: "Abastecimento", icon: Fuel },
  { id: "manutencao", label: "Manutenção", icon: Wrench },
  { id: "gasto", label: "Gasto Geral", icon: ReceiptText },
  { id: "multa", label: "Multa CTB", icon: AlertTriangle },
  { id: "percurso", label: "Percurso (km)", icon: MapPin },
];

const PERSONAL_EXPENSE_CATEGORIES = [
  "Pedágio / Tag Sem Parar",
  "Estacionamento",
  "Lava-rápido / Estética",
  "Seguro Auto",
  "IPVA / Licenciamento",
  "Acessórios / Equipamentos",
  "Outros gastos",
];

export const QuickEntryModal: React.FC = () => {
  const {
    snapshot,
    selectedVehicleFilter,
    isQuickEntryOpen,
    quickEntryKind,
    openQuickEntry,
    closeQuickEntry,
    addFueling,
    addMaintenance,
    addExpense,
    addFine,
    addRoute,
  } = useGarage();

  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [date, setDate] = useState(todayBR());
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fueling state
  const [fuelOdometer, setFuelOdometer] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("GASOLINA");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [fullTank, setFullTank] = useState(true);
  const [stationName, setStationName] = useState("");
  const [nfceRaw, setNfceRaw] = useState("");
  const [fuelNotes, setFuelNotes] = useState("");

  // Maintenance state
  const [maintType, setMaintType] = useState<MaintenanceType>("PREVENTIVA");
  const [maintOdometer, setMaintOdometer] = useState("");
  const [maintCategory, setMaintCategory] = useState("");
  const [providerName, setProviderName] = useState("");
  const [partsCost, setPartsCost] = useState("0");
  const [laborCost, setLaborCost] = useState("0");
  const [maintNotes, setMaintNotes] = useState("");

  // Expense state
  const [expCategory, setExpCategory] = useState(PERSONAL_EXPENSE_CATEGORIES[0]!);
  const [expAmount, setExpAmount] = useState("");
  const [expDescription, setExpDescription] = useState("");

  // Fine state
  const [infractionCode, setInfractionCode] = useState("");
  const [fineDescription, setFineDescription] = useState("");
  const [fineLocation, setFineLocation] = useState("");
  const [finePoints, setFinePoints] = useState("4");
  const [fineAmount, setFineAmount] = useState("");
  const [sneDiscount, setSneDiscount] = useState(true);
  const [fineStatus, setFineStatus] = useState<FineStatus>("PENDENTE");

  // Route state
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [startOdometer, setStartOdometer] = useState("");
  const [endOdometer, setEndOdometer] = useState("");
  const [estimatedKm, setEstimatedKm] = useState("");
  const [purpose, setPurpose] = useState("");

  useEffect(() => {
    if (!isQuickEntryOpen) return;
    const defaultVeh =
      snapshot.vehicles.find((v) => v.id === selectedVehicleFilter) ?? snapshot.vehicles[0];
    setVehicleId(defaultVeh?.id ?? "");
    setDriverId(defaultVeh?.assignedDriverId ?? snapshot.drivers[0]?.id ?? "");
    setDate(todayBR());
    setFuelOdometer(defaultVeh ? String(defaultVeh.currentOdometer) : "");
    setFuelType(defaultVeh?.fuelType === "FLEX" ? "GASOLINA" : defaultVeh?.fuelType ?? "GASOLINA");
    setMaintOdometer(defaultVeh ? String(defaultVeh.currentOdometer) : "");
    setStartOdometer(defaultVeh ? String(defaultVeh.currentOdometer) : "");
    setEndOdometer("");
    setQuantity("");
    setUnitPrice("");
    setTotalCost("");
    setFullTank(true);
    setStationName("");
    setNfceRaw("");
    setFuelNotes("");
    setMaintCategory("");
    setProviderName("");
    setPartsCost("0");
    setLaborCost("0");
    setMaintNotes("");
    setExpAmount("");
    setExpDescription("");
    setInfractionCode("");
    setFineDescription("");
    setFineLocation("");
    setFinePoints("4");
    setFineAmount("");
    setOrigin("");
    setDestination("");
    setEstimatedKm("");
    setPurpose("");
    setErrorMsg(null);
  }, [isQuickEntryOpen, selectedVehicleFilter, snapshot.vehicles, snapshot.drivers]);

  if (!isQuickEntryOpen) return null;

  const selectedVehicle = snapshot.vehicles.find((v) => v.id === vehicleId);

  const handleVehicleChange = (nextId: string) => {
    setVehicleId(nextId);
    const v = snapshot.vehicles.find((item) => item.id === nextId);
    if (v) {
      setFuelOdometer(String(v.currentOdometer));
      setMaintOdometer(String(v.currentOdometer));
      setStartOdometer(String(v.currentOdometer));
      setFuelType(v.fuelType === "FLEX" ? "GASOLINA" : v.fuelType);
      if (v.assignedDriverId) setDriverId(v.assignedDriverId);
    }
  };

  const handleParseNfce = () => {
    const parsed = parseNfceQrPayload(nfceRaw);
    if (!parsed) {
      toast.error("Não foi possível reconhecer uma chave NFC-e de 44 dígitos ou link SEFAZ.");
      return;
    }
    setNfceRaw(parsed.nfceKey);
    if (parsed.totalCost) {
      setTotalCost(String(parsed.totalCost));
      const qtyNum = Number(quantity);
      if (qtyNum > 0) {
        setUnitPrice((parsed.totalCost / qtyNum).toFixed(3));
      }
    }
    if (parsed.date) setDate(parsed.date);
    if (parsed.stationName) setStationName(parsed.stationName);
    toast.success("Dados extraídos do QR Code NFC-e.");
  };

  const updateFuelCalculations = (nextQty: string, nextUnit: string, nextTotal: string) => {
    setQuantity(nextQty);
    setUnitPrice(nextUnit);
    setTotalCost(nextTotal);
    const q = Number(nextQty);
    const u = Number(nextUnit);
    if (q > 0 && u > 0 && nextTotal === "") {
      setTotalCost((q * u).toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!vehicleId) {
      setErrorMsg("Cadastre e selecione um veículo antes de lançar registros.");
      return;
    }

    setSubmitting(true);
    try {
      if (quickEntryKind === "abastecimento") {
        const q = Number(quantity);
        const u = Number(unitPrice);
        const t = totalCost ? Number(totalCost) : q > 0 && u > 0 ? Number((q * u).toFixed(2)) : 0;
        const resolvedUnit = u > 0 ? u : q > 0 && t > 0 ? Number((t / q).toFixed(3)) : 0;

        const parsed = fuelingSchema.safeParse({
          vehicleId,
          driverId: driverId || undefined,
          date,
          odometer: fuelOdometer,
          fuelType,
          quantity: q,
          unitPrice: resolvedUnit,
          totalCost: t,
          fullTank,
          stationName: stationName || undefined,
          nfceKey: nfceRaw || undefined,
          notes: fuelNotes || undefined,
        });
        if (!parsed.success) {
          setErrorMsg(parsed.error.issues[0]?.message ?? "Dados do abastecimento inválidos.");
          return;
        }
        await addFueling(parsed.data);
        toast.success("Abastecimento salvo na garagem.");
      } else if (quickEntryKind === "manutencao") {
        const parts = Number(partsCost) || 0;
        const labor = Number(laborCost) || 0;
        const parsed = maintenanceSchema.safeParse({
          vehicleId,
          driverId: driverId || undefined,
          type: maintType,
          status: "CONCLUIDA",
          date,
          odometer: maintOdometer,
          category: maintCategory,
          providerName: providerName || undefined,
          partsCost: parts,
          laborCost: labor,
          totalCost: Number((parts + labor).toFixed(2)),
          notes: maintNotes || undefined,
        });
        if (!parsed.success) {
          setErrorMsg(parsed.error.issues[0]?.message ?? "Dados da manutenção inválidos.");
          return;
        }
        await addMaintenance({
          ...parsed.data,
          status: "CONCLUIDA",
          totalCost: Number((parts + labor).toFixed(2)),
        });
        toast.success("Manutenção registrada.");
      } else if (quickEntryKind === "gasto") {
        const parsed = personalExpenseSchema.safeParse({
          vehicleId,
          driverId: driverId || undefined,
          category: expCategory,
          date,
          amount: expAmount,
          description: expDescription || undefined,
        });
        if (!parsed.success) {
          setErrorMsg(parsed.error.issues[0]?.message ?? "Dados do gasto inválidos.");
          return;
        }
        await addExpense(parsed.data);
        toast.success("Gasto registrado.");
      } else if (quickEntryKind === "multa") {
        const suggestedDriver =
          driverId || suggestDriverForDate(snapshot, vehicleId, date) || undefined;
        const parsed = fineSchema.safeParse({
          vehicleId,
          driverId: suggestedDriver,
          date,
          infractionCode,
          description: fineDescription,
          location: fineLocation || undefined,
          points: finePoints,
          amount: fineAmount,
          sneDiscountApplied: sneDiscount,
          status: fineStatus,
        });
        if (!parsed.success) {
          setErrorMsg(parsed.error.issues[0]?.message ?? "Dados da multa inválidos.");
          return;
        }
        await addFine(parsed.data);
        toast.success("Multa registrada.");
      } else if (quickEntryKind === "percurso") {
        const parsed = routeTripSchema.safeParse({
          vehicleId,
          driverId: driverId || undefined,
          date,
          origin,
          destination,
          startOdometer,
          endOdometer,
          estimatedKm: estimatedKm ? Number(estimatedKm) : undefined,
          purpose: purpose || undefined,
        });
        if (!parsed.success) {
          setErrorMsg(parsed.error.issues[0]?.message ?? "Dados do percurso inválidos.");
          return;
        }
        await addRoute(parsed.data);
        toast.success("Percurso registrado e hodômetro atualizado.");
      }

      closeQuickEntry();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao salvar lançamento.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#dce2e6] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#edf1f3] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-[#edf1f3] text-[#173d4a]">
              <CarFront className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0c1928]">Novo Registro da Garagem</h2>
              <p className="text-xs text-[#52616a]">
                Escolha o tipo de movimentação pessoal do seu veículo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeQuickEntry}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-[#52616a] hover:bg-[#f0f3f5]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-[#edf1f3] bg-[#f7f8fa] px-6 py-2.5">
          {ENTRY_TABS.map((t) => {
            const active = quickEntryKind === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  openQuickEntry(t.id);
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#173d4a] text-white"
                    : "border border-[#dce2e6] bg-white text-[#52616a] hover:text-[#0c1928]"
                }`}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 overflow-y-auto p-6">
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
              {errorMsg}
            </div>
          )}

          {snapshot.vehicles.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              Cadastre ao menos um veículo na garagem antes de lançar registros.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                  Veículo *
                </label>
                <select
                  value={vehicleId}
                  onChange={(e) => handleVehicleChange(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs font-semibold"
                >
                  {snapshot.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.brand} {v.model} ({v.currentOdometer.toLocaleString("pt-BR")} km)
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
            </div>
          )}

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
                    {d.name} (CNH {d.cnhCategory})
                  </option>
                ))}
              </select>
            </div>
          )}

          {quickEntryKind === "abastecimento" && (
            <div className="space-y-3.5">
              <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#173d4a]">
                  <QrCode className="size-3.5" /> Extrair de Link NFC-e ou Chave (44 dígitos)
                </label>
                <div className="flex gap-2">
                  <input
                    value={nfceRaw}
                    onChange={(e) => setNfceRaw(e.target.value)}
                    placeholder="Cole a URL do QR Code da nota fiscal ou a chave..."
                    className="h-8 flex-1 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleParseNfce}
                    className="h-8 rounded-lg border border-[#173d4a] px-3 text-xs font-semibold text-[#173d4a] hover:bg-[#173d4a] hover:text-white"
                  >
                    Ler NFC-e
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Hodômetro (km) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={fuelOdometer}
                    onChange={(e) => setFuelOdometer(e.target.value)}
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Combustível *
                  </label>
                  <select
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value as FuelType)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  >
                    <option value="GASOLINA">Gasolina</option>
                    <option value="ETANOL">Etanol</option>
                    <option value="DIESEL">Diesel S10</option>
                    <option value="GNV">GNV</option>
                    <option value="ELETRICO">Elétrico (kWh)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Qtd ({getFuelUnit(fuelType)}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={quantity}
                    onChange={(e) => updateFuelCalculations(e.target.value, unitPrice, "")}
                    placeholder="Ex.: 42.5"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Preço Unit. (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min={0.01}
                    value={unitPrice}
                    onChange={(e) => updateFuelCalculations(quantity, e.target.value, "")}
                    placeholder="Ex.: 5.99"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Valor Total (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    placeholder="Calculado automático"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Posto / Rede
                  </label>
                  <input
                    value={stationName}
                    onChange={(e) => setStationName(e.target.value)}
                    placeholder="Opcional"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-[#0c1928]">
                <input
                  type="checkbox"
                  checked={fullTank}
                  onChange={(e) => setFullTank(e.target.checked)}
                  className="size-4 accent-[#173d4a]"
                />
                Tanque completo (necessário para calcular média km/{getFuelUnit(fuelType)})
              </label>
              {selectedVehicle && selectedVehicle.currentOdometer > 0 && (
                <p className="text-[11px] text-[#52616a]">
                  Último hodômetro registrado no veículo:{" "}
                  {selectedVehicle.currentOdometer.toLocaleString("pt-BR")} km
                </p>
              )}
            </div>
          )}

          {quickEntryKind === "manutencao" && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">Tipo *</label>
                  <select
                    value={maintType}
                    onChange={(e) => setMaintType(e.target.value as MaintenanceType)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  >
                    <option value="PREVENTIVA">Preventiva / Revisão</option>
                    <option value="CORRETIVA">Corretiva / Reparo</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Serviço / Item *
                  </label>
                  <input
                    value={maintCategory}
                    onChange={(e) => setMaintCategory(e.target.value)}
                    placeholder="Ex.: Troca de óleo e filtros"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Hodômetro (km) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={maintOdometer}
                    onChange={(e) => setMaintOdometer(e.target.value)}
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Peças (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={partsCost}
                    onChange={(e) => setPartsCost(e.target.value)}
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Mão de Obra (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={laborCost}
                    onChange={(e) => setLaborCost(e.target.value)}
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Oficina / Mecânico
                  </label>
                  <input
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    placeholder="Opcional"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-[#f7f8fa] px-3 py-2 text-xs font-semibold text-[#173d4a]">
                Total da manutenção:{" "}
                <span className="tabular-nums">
                  {formatReaisBRL((Number(partsCost) || 0) + (Number(laborCost) || 0))}
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                  Observações
                </label>
                <textarea
                  rows={2}
                  value={maintNotes}
                  onChange={(e) => setMaintNotes(e.target.value)}
                  placeholder="Garantia de peças, próxima troca recomendada..."
                  className="w-full rounded-lg border border-[#cbd3d8] p-2.5 text-xs"
                />
              </div>
            </div>
          )}

          {quickEntryKind === "gasto" && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Categoria *
                  </label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  >
                    {PERSONAL_EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Valor (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="Ex.: 45.00"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                  Descrição
                </label>
                <input
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  placeholder="Ex.: Pedágio ida/volta viagem, estacionamento shopping..."
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                />
              </div>
            </div>
          )}

          {quickEntryKind === "multa" && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Código CTB *
                  </label>
                  <input
                    value={infractionCode}
                    onChange={(e) => setInfractionCode(e.target.value)}
                    placeholder="Ex.: 745-50"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Pontos CNH *
                  </label>
                  <select
                    value={finePoints}
                    onChange={(e) => setFinePoints(e.target.value)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  >
                    <option value="3">3 pts (Leve)</option>
                    <option value="4">4 pts (Média)</option>
                    <option value="5">5 pts (Grave)</option>
                    <option value="7">7 pts (Gravíssima)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Valor Nominal (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={fineAmount}
                    onChange={(e) => setFineAmount(e.target.value)}
                    placeholder="130.16"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Descrição *
                  </label>
                  <input
                    value={fineDescription}
                    onChange={(e) => setFineDescription(e.target.value)}
                    placeholder="Ex.: Transitar até 20% acima da velocidade"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">Status</label>
                  <select
                    value={fineStatus}
                    onChange={(e) => setFineStatus(e.target.value as FineStatus)}
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
                  >
                    <option value="PENDENTE">Pendente</option>
                    <option value="PAGA">Paga</option>
                    <option value="RECORRIDA">Em recurso / Anulada</option>
                    <option value="INDICADO">Condutor indicado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#52616a]">Local</label>
                <input
                  value={fineLocation}
                  onChange={(e) => setFineLocation(e.target.value)}
                  placeholder="Rodovia / Via / Radar"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-[#0c1928]">
                <input
                  type="checkbox"
                  checked={sneDiscount}
                  onChange={(e) => setSneDiscount(e.target.checked)}
                  className="size-4 accent-[#173d4a]"
                />
                Aplicar desconto SNE (-40% na Carteira Digital de Trânsito)
              </label>
            </div>
          )}

          {quickEntryKind === "percurso" && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Origem *
                  </label>
                  <input
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="Ex.: Casa / Brasília"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Destino *
                  </label>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Ex.: Pirenópolis - GO"
                    className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Km Inicial *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={startOdometer}
                    onChange={(e) => setStartOdometer(e.target.value)}
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Km Final *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={endOdometer}
                    onChange={(e) => setEndOdometer(e.target.value)}
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                    Km Estimado (GPS)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={estimatedKm}
                    onChange={(e) => setEstimatedKm(e.target.value)}
                    placeholder="Opcional"
                    className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#52616a]">
                  Motivo / Observação
                </label>
                <input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Passeio de fim de semana, deslocamento diário..."
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[#edf1f3] pt-4">
            <button
              type="button"
              onClick={closeQuickEntry}
              className="h-9 rounded-lg border border-[#dce2e6] px-4 text-xs font-semibold text-[#52616a]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || snapshot.vehicles.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
