import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { todayBR } from "@/lib/domain/money";
import { useGarage } from "../context/garageContext";
import { documentObligationSchema } from "../schemas/garage.schemas";
import type {
  DocumentType,
  FipeConsultationResponse,
  FineStatus,
} from "../types/garage.types";
import {
  documentTypeLabel,
  evaluateDocumentStatus,
  evaluateDriverCtbPoints,
  formatDateBR,
  formatReaisBRL,
  getEffectiveFineAmount,
  getLicensePlateDueInfo,
} from "../utils/garage.calculations";

export const DocumentsDebtsPage: React.FC = () => {
  const {
    snapshot,
    selectedVehicleFilter,
    openQuickEntry,
    updateFineStatus,
    deleteFine,
    addDocumentObligation,
    markDocumentPaid,
    deleteDocumentObligation,
    generateCalendarForVehicles,
  } = useGarage();

  const currentYear = new Date().getFullYear();
  const defaultVehicle =
    snapshot.vehicles.find((v) => v.id === selectedVehicleFilter) ?? snapshot.vehicles[0];

  // Consulta Placa + FIPE Real (BrasilAPI) - sem placa hardcoded
  const [plateInput, setPlateInput] = useState(defaultVehicle?.plate ?? "");
  const [ufInput, setUfInput] = useState(defaultVehicle?.stateUf ?? "DF");
  const [fipeCodeInput, setFipeCodeInput] = useState("");
  const [consulting, setConsulting] = useState(false);
  const [fipeResult, setFipeResult] = useState<FipeConsultationResponse | null>(null);

  // Filtros e criação manual de Documento/Seguro
  const [docTypeFilter, setDocTypeFilter] = useState<"TODOS" | DocumentType>("TODOS");
  const [docStatusFilter, setDocStatusFilter] = useState<"TODOS" | "PENDENTE" | "PAGO">("TODOS");
  const [showNewDocForm, setShowNewDocForm] = useState(false);
  const [newDocVehicleId, setNewDocVehicleId] = useState(defaultVehicle?.id ?? "");
  const [newDocType, setNewDocType] = useState<DocumentType>("IPVA");
  const [newDocYear, setNewDocYear] = useState(String(currentYear));
  const [newDocDueDate, setNewDocDueDate] = useState(todayBR());
  const [newDocAmount, setNewDocAmount] = useState("");
  const [newDocProvider, setNewDocProvider] = useState("");
  const [newDocCode, setNewDocCode] = useState("");
  const [generatingCal, setGeneratingCal] = useState(false);

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles],
  );
  const driverMap = useMemo(
    () => new Map(snapshot.drivers.map((d) => [d.id, d])),
    [snapshot.drivers],
  );

  const filteredDocuments = useMemo(() => {
    return snapshot.documents
      .filter((d) => selectedVehicleFilter === "TODOS" || d.vehicleId === selectedVehicleFilter)
      .filter((d) => docTypeFilter === "TODOS" || d.docType === docTypeFilter)
      .filter((d) => {
        if (docStatusFilter === "TODOS") return true;
        if (docStatusFilter === "PAGO") return d.status === "PAGO" || d.status === "ISENTO";
        return d.status === "PENDENTE";
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [snapshot.documents, selectedVehicleFilter, docTypeFilter, docStatusFilter]);

  const filteredFines = useMemo(() => {
    return snapshot.fines
      .filter((f) => selectedVehicleFilter === "TODOS" || f.vehicleId === selectedVehicleFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [snapshot.fines, selectedVehicleFilter]);

  const platePreview = useMemo(() => {
    if (!plateInput.trim()) return null;
    return getLicensePlateDueInfo(plateInput, ufInput || "DF", currentYear);
  }, [plateInput, ufInput, currentYear]);

  const handleConsultFipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateInput.trim() && !fipeCodeInput.trim()) {
      toast.info("Informe a placa e/ou código FIPE para consultar.");
      return;
    }
    setConsulting(true);
    try {
      const resp = await fetch("/api/garagem/fipe-consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: plateInput.trim().toUpperCase(),
          stateUf: ufInput.trim().toUpperCase() || "DF",
          fipeCode: fipeCodeInput.trim() || undefined,
        }),
      });
      const data = (await resp.json()) as FipeConsultationResponse;
      setFipeResult(data);
      if (data.fipePriceRecord) {
        toast.success("Cotação FIPE atualizada via BrasilAPI.");
      } else {
        toast.info("Referência FIPE e calendário da placa carregados.");
      }
    } catch {
      toast.error("Falha ao consultar Tabela FIPE.");
    } finally {
      setConsulting(false);
    }
  };

  const handleGenerateCalendar = async () => {
    if (snapshot.vehicles.length === 0) {
      toast.error("Cadastre ao menos um veículo antes de gerar o calendário.");
      return;
    }
    setGeneratingCal(true);
    try {
      const createdCount = await generateCalendarForVehicles(currentYear);
      if (createdCount === 0) {
        toast.info(`Todos os veículos ativos já possuem IPVA e CRLV-e ${currentYear} cadastrados.`);
      } else {
        toast.success(`${createdCount} obrigações de IPVA e CRLV-e ${currentYear} geradas.`);
      }
    } finally {
      setGeneratingCal(false);
    }
  };

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetVehId = newDocVehicleId || defaultVehicle?.id || "";
    const parsed = documentObligationSchema.safeParse({
      vehicleId: targetVehId,
      docType: newDocType,
      referenceYear: Number(newDocYear),
      dueDate: newDocDueDate,
      amount: Number(newDocAmount) || 0,
      stateUf: vehicleMap.get(targetVehId)?.stateUf ?? ufInput,
      providerOrAuthority: newDocProvider || undefined,
      policyOrCode: newDocCode || undefined,
      status: "PENDENTE",
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os dados do documento.");
      return;
    }

    await addDocumentObligation(parsed.data);
    setShowNewDocForm(false);
    setNewDocAmount("");
    setNewDocProvider("");
    setNewDocCode("");
    toast.success("Obrigação adicionada à agenda do veículo.");
  };

  return (
    <div className="space-y-6">
      {/* Real FIPE & Plate Calendar Consultation */}
      <section className="rounded-2xl border border-[#dce2e6] bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#0c1928]">
              Consulta Tabela FIPE (BrasilAPI) & Calendário por Placa
            </h2>
            <p className="text-xs text-[#52616a]">
              Consulte referência FIPE real e datas de licenciamento pelo final da placa
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerateCalendar()}
            disabled={generatingCal || snapshot.vehicles.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#173d4a] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0c1928] disabled:opacity-50"
          >
            {generatingCal ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CalendarClock className="size-3.5" />
            )}
            Gerar IPVA & CRLV-e {currentYear}
          </button>
        </div>

        <form onSubmit={(e) => void handleConsultFipe(e)} className="grid gap-2.5 sm:grid-cols-4">
          <input
            value={plateInput}
            onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
            placeholder="Placa (ex.: ABC1D23)"
            className="h-9 rounded-lg border border-[#cbd3d8] px-3 text-xs font-semibold uppercase"
          />
          <input
            maxLength={2}
            value={ufInput}
            onChange={(e) => setUfInput(e.target.value.toUpperCase())}
            placeholder="UF (ex.: DF, SP)"
            className="h-9 rounded-lg border border-[#cbd3d8] px-3 text-xs uppercase"
          />
          <input
            value={fipeCodeInput}
            onChange={(e) => setFipeCodeInput(e.target.value)}
            placeholder="Código FIPE (opcional, ex.: 001494-0)"
            className="h-9 rounded-lg border border-[#cbd3d8] px-3 text-xs"
          />
          <button
            type="submit"
            disabled={consulting}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#173d4a] bg-[#f7f8fa] px-3 text-xs font-semibold text-[#173d4a] hover:bg-[#173d4a] hover:text-white disabled:opacity-60"
          >
            {consulting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            Consultar FIPE
          </button>
        </form>

        {(platePreview || fipeResult) && (
          <div className="mt-4 grid gap-3 rounded-xl border border-[#edf1f3] bg-[#f7f8fa] p-4 sm:grid-cols-2">
            {platePreview && (
              <div className="text-xs">
                <div className="font-bold text-[#0c1928]">
                  Calendário Estimado · Final {platePreview.finalDigit} ({platePreview.stateUf})
                </div>
                <div className="mt-1 text-[#52616a]">
                  IPVA cota única: <strong className="text-[#0c1928]">{formatDateBR(platePreview.ipvaDueDate)}</strong> ({platePreview.ipvaMonthLabel})
                </div>
                <div className="text-[#52616a]">
                  CRLV-e limite: <strong className="text-[#0c1928]">{formatDateBR(platePreview.crlvDueDate)}</strong> ({platePreview.crlvMonthLabel})
                </div>
              </div>
            )}
            {fipeResult && (
              <div className="text-xs">
                <div className="font-bold text-[#173d4a]">
                  {fipeResult.fipePriceRecord
                    ? `${fipeResult.fipePriceRecord.marca} ${fipeResult.fipePriceRecord.modelo} (${fipeResult.fipePriceRecord.anoModelo})`
                    : `Tabela FIPE · ${fipeResult.fipeReferenceMonth ?? "Referência oficial"}`}
                </div>
                {fipeResult.fipePriceRecord?.valor ? (
                  <div className="tabular-nums mt-1 text-base font-bold text-[#0c1928]">
                    {fipeResult.fipePriceRecord.valor}
                  </div>
                ) : (
                  <div className="mt-1 text-[#52616a]">{fipeResult.notice}</div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Documents & Insurance Table */}
      <section className="rounded-2xl border border-[#dce2e6] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-[#173d4a]" />
            <h2 className="text-base font-bold text-[#0c1928]">
              IPVA, Licenciamento (CRLV-e), Seguro & Vistorias
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value as typeof docTypeFilter)}
              className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs"
            >
              <option value="TODOS">Todos os tipos</option>
              <option value="IPVA">IPVA</option>
              <option value="CRLV">CRLV-e</option>
              <option value="SEGURO">Seguro Auto</option>
              <option value="VISTORIA">Vistoria</option>
            </select>
            <select
              value={docStatusFilter}
              onChange={(e) => setDocStatusFilter(e.target.value as typeof docStatusFilter)}
              className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs"
            >
              <option value="TODOS">Todos status</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="PAGO">Quitados</option>
            </select>
            <button
              type="button"
              onClick={() => setShowNewDocForm((v) => !v)}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              <Plus className="size-3.5" /> Nova Apólice / Taxa
            </button>
          </div>
        </div>

        {showNewDocForm && (
          <form
            onSubmit={(e) => void handleCreateDoc(e)}
            className="mb-4 grid gap-2.5 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-4 sm:grid-cols-6"
          >
            <select
              value={newDocVehicleId || defaultVehicle?.id || ""}
              onChange={(e) => setNewDocVehicleId(e.target.value)}
              className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs"
              required
            >
              <option value="">Veículo...</option>
              {snapshot.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate}
                </option>
              ))}
            </select>
            <select
              value={newDocType}
              onChange={(e) => setNewDocType(e.target.value as DocumentType)}
              className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs"
            >
              <option value="IPVA">IPVA</option>
              <option value="CRLV">Licenciamento (CRLV-e)</option>
              <option value="SEGURO">Seguro Auto</option>
              <option value="VISTORIA">Vistoria</option>
            </select>
            <input
              type="date"
              value={newDocDueDate}
              onChange={(e) => {
                setNewDocDueDate(e.target.value);
                setNewDocYear(e.target.value.slice(0, 4));
              }}
              className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs"
              required
            />
            <input
              type="number"
              step="0.01"
              value={newDocAmount}
              onChange={(e) => setNewDocAmount(e.target.value)}
              placeholder="Valor R$"
              className="tabular-nums h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
              required
            />
            <input
              value={newDocProvider}
              onChange={(e) => setNewDocProvider(e.target.value)}
              placeholder="Seguradora / Detran"
              className="h-9 rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-xs"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              Salvar
            </button>
          </form>
        )}

        {filteredDocuments.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#52616a]">
            Nenhum documento ou apólice cadastrada ainda. Use &quot;Gerar IPVA & CRLV-e&quot; ou adicione seu Seguro Auto.
          </p>
        ) : (
          <div className="divide-y divide-[#edf1f3]">
            {filteredDocuments.map((docItem) => {
              const veh = vehicleMap.get(docItem.vehicleId);
              const ev = evaluateDocumentStatus(docItem);
              return (
                <div
                  key={docItem.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#0c1928] px-2 py-0.5 text-[10px] font-bold text-white">
                        {veh?.plate ?? "Veículo"}
                      </span>
                      <span className="font-bold text-[#0c1928]">
                        {documentTypeLabel(docItem.docType)} ({docItem.referenceYear})
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          ev.status === "PAGO"
                            ? "bg-emerald-50 text-emerald-700"
                            : ev.status === "VENCIDO"
                              ? "bg-red-50 text-red-700"
                              : ev.status === "ATENCAO"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-[#f7f8fa] text-[#52616a]"
                        }`}
                      >
                        {ev.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[#52616a]">
                      Vencimento: {formatDateBR(docItem.dueDate)}
                      {docItem.providerOrAuthority ? ` · ${docItem.providerOrAuthority}` : ""}
                      {docItem.notes ? ` · ${docItem.notes}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-sm font-bold text-[#0c1928]">
                      {formatReaisBRL(docItem.amount)}
                    </span>
                    {docItem.status === "PENDENTE" && (
                      <button
                        type="button"
                        onClick={() => {
                          void markDocumentPaid(docItem.id, true);
                          toast.success("Documento quitado e lançado nos gastos.");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="size-3.5" /> Quitar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void deleteDocumentObligation(docItem.id);
                        toast.success("Obrigação removida.");
                      }}
                      aria-label="Excluir obrigação"
                      className="rounded-lg p-1.5 text-[#52616a] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Fines & CTB Art. 261 Scoring */}
      <section className="rounded-2xl border border-[#dce2e6] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" />
            <div>
              <h2 className="text-base font-bold text-[#0c1928]">Multas & Pontuação CNH (CTB Art. 261)</h2>
              <p className="text-xs text-[#52616a]">
                Cálculo automático SNE (-40%) e acompanhamento do limite de pontos em 12 meses
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openQuickEntry("multa")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce2e6] bg-white px-3.5 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa]"
          >
            <Plus className="size-3.5" /> Registrar Multa
          </button>
        </div>

        {/* Driver points strip */}
        {snapshot.drivers.length > 0 && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {snapshot.drivers.map((drv) => {
              const summary = evaluateDriverCtbPoints(drv, snapshot.fines);
              return (
                <div
                  key={drv.id}
                  className="rounded-xl border border-[#edf1f3] bg-[#f7f8fa] p-3 text-xs"
                >
                  <div className="font-bold text-[#0c1928]">{drv.name}</div>
                  <div className="tabular-nums mt-1 text-[#52616a]">
                    <strong className="text-[#0c1928]">
                      {summary.points12m}/{summary.maxAllowedPoints} pts
                    </strong>{" "}
                    em 12 meses ({summary.activeFinesCount} autuações)
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredFines.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#52616a]">
            Nenhuma multa registrada na garagem.
          </p>
        ) : (
          <div className="divide-y divide-[#edf1f3]">
            {filteredFines.map((fine) => {
              const veh = vehicleMap.get(fine.vehicleId);
              const drv = fine.driverId ? driverMap.get(fine.driverId) : undefined;
              const effective = getEffectiveFineAmount(fine);
              return (
                <div
                  key={fine.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#0c1928] px-2 py-0.5 text-[10px] font-bold text-white">
                        {veh?.plate ?? "Veículo"}
                      </span>
                      <span className="font-bold text-[#0c1928]">
                        {fine.infractionCode} · {fine.points} pts
                      </span>
                      <span className="text-[#52616a]">{formatDateBR(fine.date)}</span>
                      {fine.sneDiscountApplied && (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          SNE -40%
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[#52616a]">
                      {fine.description}
                      {drv ? ` · Condutor: ${drv.name}` : ""}
                      {fine.location ? ` · ${fine.location}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-sm font-bold text-[#0c1928]">
                      {formatReaisBRL(effective)}
                    </span>
                    <select
                      value={fine.status}
                      onChange={(e) =>
                        void updateFineStatus(fine.id, e.target.value as FineStatus)
                      }
                      className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs font-semibold"
                    >
                      <option value="PENDENTE">Pendente</option>
                      <option value="INDICADO">Condutor indicado</option>
                      <option value="PAGA">Paga</option>
                      <option value="RECORRIDA">Em recurso / Anulada</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteFine(fine.id);
                        toast.success("Multa removida.");
                      }}
                      aria-label="Excluir multa"
                      className="rounded-lg p-1.5 text-[#52616a] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
