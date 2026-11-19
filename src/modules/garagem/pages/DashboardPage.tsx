import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CarFront,
  Download,
  Fuel,
  Gauge,
  Plus,
  Route,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { todayBR } from "@/lib/domain/money";
import { useGarage } from "../context/garageContext";
import {
  type PeriodFilter,
  buildMonthlyCostSeries,
  computeFlexRecommendation,
  computeGarageKpis,
  detectConsumptionAnomalies,
  evaluateCnhStatus,
  evaluateDocumentStatus,
  evaluateReminderStatus,
  formatDateBR,
  formatKm,
  formatNumberBR,
  formatReaisBRL,
} from "../utils/garage.calculations";
import { downloadGarageReportPdf } from "../utils/garage.pdf";

interface DashboardPageProps {
  onRequestNewVehicle: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onRequestNewVehicle }) => {
  const { snapshot, selectedVehicleFilter, openQuickEntry, setActiveTab } = useGarage();
  const [period, setPeriod] = useState<PeriodFilter>("90D");
  const [exportingPdf, setExportingPdf] = useState(false);

  // Calculadora Flex Pessoal
  const [ethanolPrice, setEthanolPrice] = useState("4.09");
  const [gasolinePrice, setGasolinePrice] = useState("6.19");
  const [flexRatio, setFlexRatio] = useState("0.70");

  const kpis = useMemo(
    () => computeGarageKpis(snapshot, selectedVehicleFilter, period),
    [snapshot, selectedVehicleFilter, period],
  );

  const monthlySeries = useMemo(
    () => buildMonthlyCostSeries(snapshot, selectedVehicleFilter),
    [snapshot, selectedVehicleFilter],
  );

  const consumptionTrend = useMemo(() => {
    return snapshot.fuelings
      .filter(
        (f) =>
          (selectedVehicleFilter === "TODOS" || f.vehicleId === selectedVehicleFilter) &&
          typeof f.calculatedAvg === "number" &&
          f.calculatedAvg > 0,
      )
      .slice(0, 12)
      .reverse()
      .map((f) => ({
        label: formatDateBR(f.date).slice(0, 5),
        kmPorUnidade: f.calculatedAvg ?? 0,
      }));
  }, [snapshot.fuelings, selectedVehicleFilter]);

  const anomalies = useMemo(
    () => detectConsumptionAnomalies(snapshot.fuelings, selectedVehicleFilter),
    [snapshot.fuelings, selectedVehicleFilter],
  );

  const flexResult = useMemo(
    () =>
      computeFlexRecommendation(
        Number(ethanolPrice.replace(",", ".")),
        Number(gasolinePrice.replace(",", ".")),
        Number(flexRatio.replace(",", ".")) || 0.7,
      ),
    [ethanolPrice, gasolinePrice, flexRatio],
  );

  const alerts = useMemo(() => {
    const today = todayBR();
    const list: Array<{ id: string; level: "VENCIDO" | "ATENCAO"; title: string; detail: string; tab: "documentos" | "percursos" | "veiculos" | "lancamentos" }> = [];

    for (const anom of anomalies.slice(0, 3)) {
      const veh = snapshot.vehicles.find((v) => v.id === anom.vehicleId);
      list.push({
        id: `anom-${anom.fuelingId}`,
        level: "ATENCAO",
        title: `Queda de rendimento · ${veh?.plate ?? "Veículo"}`,
        detail: `${formatNumberBR(anom.actualAvg, 2)} km/L em ${formatDateBR(anom.date)} (-${anom.dropPercent}% vs sua média ${formatNumberBR(anom.baselineAvg, 2)})`,
        tab: "lancamentos",
      });
    }

    for (const doc of snapshot.documents) {
      if (selectedVehicleFilter !== "TODOS" && doc.vehicleId !== selectedVehicleFilter) continue;
      const ev = evaluateDocumentStatus(doc, today);
      if (ev.status === "VENCIDO" || ev.status === "ATENCAO") {
        const veh = snapshot.vehicles.find((v) => v.id === doc.vehicleId);
        list.push({
          id: `doc-${doc.id}`,
          level: ev.status,
          title: `${doc.docType} ${doc.referenceYear} · ${veh?.plate ?? ""}`,
          detail: `${ev.label} · ${formatReaisBRL(doc.amount)}`,
          tab: "documentos",
        });
      }
    }

    for (const rem of snapshot.reminders) {
      if (rem.completed) continue;
      if (selectedVehicleFilter !== "TODOS" && rem.vehicleId !== selectedVehicleFilter) continue;
      const veh = snapshot.vehicles.find((v) => v.id === rem.vehicleId);
      const ev = evaluateReminderStatus(rem, veh, today);
      if (ev.status === "VENCIDO" || ev.status === "ATENCAO") {
        list.push({
          id: `rem-${rem.id}`,
          level: ev.status,
          title: `${rem.title} · ${veh?.plate ?? ""}`,
          detail: ev.reason,
          tab: "percursos",
        });
      }
    }

    for (const drv of snapshot.drivers) {
      if (!drv.active) continue;
      const ev = evaluateCnhStatus(drv, today);
      if (ev.status === "VENCIDO" || ev.status === "ATENCAO") {
        list.push({
          id: `cnh-${drv.id}`,
          level: ev.status,
          title: `CNH ${drv.name}`,
          detail: ev.label,
          tab: "veiculos",
        });
      }
    }

    return list;
  }, [anomalies, snapshot, selectedVehicleFilter]);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await downloadGarageReportPdf(snapshot, selectedVehicleFilter, period);
      toast.success("Relatório PDF gerado.");
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  if (snapshot.vehicles.length === 0) {
    return (
      <div className="rounded-2xl border border-[#dce2e6] bg-white p-10 text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#edf1f3] text-[#173d4a]">
          <CarFront className="size-7" />
        </div>
        <h2 className="text-xl font-bold text-[#0c1928]">Sua Garagem Pessoal está vazia</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#52616a]">
          Cadastre seu carro ou moto para acompanhar consumo real (km/L), revisões preventivas,
          vencimento de IPVA/CRLV, multas, tabela FIPE e viagens pessoais.
        </p>
        <button
          type="button"
          onClick={onRequestNewVehicle}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#173d4a] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0c1928]"
        >
          <Plus className="size-4" /> Cadastrar meu primeiro veículo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period filter + PDF button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[#dce2e6] bg-white p-1">
          {(["30D", "90D", "ANO", "TODOS"] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === p ? "bg-[#173d4a] text-white" : "text-[#52616a] hover:text-[#0c1928]"
              }`}
            >
              {p === "30D"
                ? "30 dias"
                : p === "90D"
                  ? "90 dias"
                  : p === "ANO"
                    ? "Este ano"
                    : "Tudo"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleExportPdf()}
          disabled={exportingPdf}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#dce2e6] bg-white px-3.5 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f7f8fa] disabled:opacity-60"
        >
          <Download className="size-3.5 text-[#173d4a]" />
          {exportingPdf ? "Gerando PDF..." : "Exportar Relatório PDF"}
        </button>
      </div>

      {/* 4 KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#52616a]">
            <span>Gasto no Período</span>
            <Fuel className="size-4 text-[#173d4a]" />
          </div>
          <div className="tabular-nums mt-2 text-2xl font-bold text-[#0c1928]">
            {formatReaisBRL(kpis.totalCost)}
          </div>
          <p className="mt-1 text-xs text-[#52616a]">
            Combustível: {formatReaisBRL(kpis.fuelCost)} · Manut.:{" "}
            {formatReaisBRL(kpis.maintenanceCost)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#52616a]">
            <span>Custo por Quilômetro</span>
            <Route className="size-4 text-[#b99555]" />
          </div>
          <div className="tabular-nums mt-2 text-2xl font-bold text-[#0c1928]">
            {kpis.costPerKm > 0 ? `${formatReaisBRL(kpis.costPerKm)}/km` : "—"}
          </div>
          <p className="mt-1 text-xs text-[#52616a]">
            {kpis.totalDistanceKm > 0
              ? `Sobre ${formatKm(kpis.totalDistanceKm)} rodados`
              : "Registre 2+ hodômetros para apurar"}
          </p>
        </div>

        <div className="rounded-2xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#52616a]">
            <span>Consumo Médio</span>
            <Gauge className="size-4 text-[#16a34a]" />
          </div>
          <div className="tabular-nums mt-2 text-2xl font-bold text-[#0c1928]">
            {kpis.avgConsumption > 0 ? `${formatNumberBR(kpis.avgConsumption, 2)} km/L` : "—"}
          </div>
          <p className="mt-1 text-xs text-[#52616a]">
            Cálculo tanque cheio a tanque cheio
          </p>
        </div>

        <div className="rounded-2xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#52616a]">
            <span>Impostos, Seguro & Outros</span>
            <Wrench className="size-4 text-[#173d4a]" />
          </div>
          <div className="tabular-nums mt-2 text-2xl font-bold text-[#0c1928]">
            {formatReaisBRL(kpis.otherExpenseCost)}
          </div>
          <p className="mt-1 text-xs text-[#52616a]">
            {kpis.activeVehiclesCount} em uso · {kpis.maintenanceVehiclesCount} em revisão
          </p>
        </div>
      </div>

      {/* Charts + Flex Calculator & Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly expenses BarChart */}
        <div className="rounded-2xl border border-[#dce2e6] bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#0c1928]">Evolução Mensal de Gastos</h3>
              <p className="text-xs text-[#52616a]">Combustível, manutenções e demais despesas</p>
            </div>
            <button
              type="button"
              onClick={() => openQuickEntry("abastecimento")}
              className="inline-flex items-center gap-1 rounded-lg bg-[#edf1f3] px-3 py-1.5 text-xs font-semibold text-[#173d4a] hover:bg-[#dce2e6]"
            >
              <Plus className="size-3.5" /> Abastecer
            </button>
          </div>
          {monthlySeries.length === 0 ? (
            <div className="flex h-60 items-center justify-center text-xs text-[#52616a]">
              Sem lançamentos no escopo selecionado ainda.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf1f3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#52616a" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#52616a" }} />
                  <Tooltip
                    formatter={(value) => formatReaisBRL(Number(value ?? 0))}
                    contentStyle={{
                      borderRadius: "12px",
                      borderColor: "#dce2e6",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar
                    dataKey="abastecimento"
                    name="Combustível"
                    stackId="a"
                    fill="#173d4a"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="manutencao"
                    name="Manutenções"
                    stackId="a"
                    fill="#b99555"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="despesas"
                    name="Impostos / Outros"
                    stackId="a"
                    fill="#64748b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Flex Fuel Calculator */}
        <div className="space-y-4 rounded-2xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#b99555]" />
            <h3 className="text-sm font-bold text-[#0c1928]">Calculadora Flex na Bomba</h3>
          </div>
          <p className="text-xs text-[#52616a]">
            Compare os preços do posto para descobrir qual combustível rende mais no bolso.
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#52616a]">
                Etanol (R$)
              </label>
              <input
                value={ethanolPrice}
                onChange={(e) => setEthanolPrice(e.target.value)}
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#52616a]">
                Gasolina (R$)
              </label>
              <input
                value={gasolinePrice}
                onChange={(e) => setGasolinePrice(e.target.value)}
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#52616a]">
                Paridade
              </label>
              <select
                value={flexRatio}
                onChange={(e) => setFlexRatio(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-1.5 text-xs"
              >
                <option value="0.70">70% padrão</option>
                <option value="0.72">72% flex novo</option>
                <option value="0.75">75% turbo</option>
              </select>
            </div>
          </div>

          {flexResult && (
            <div
              className={`rounded-xl border p-3.5 ${
                flexResult.recommended === "ETANOL"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-[#dce2e6] bg-[#f7f8fa]"
              }`}
            >
              <div className="text-xs font-semibold text-[#52616a]">
                Relação atual:{" "}
                <span className="tabular-nums font-bold text-[#0c1928]">
                  {formatNumberBR(flexResult.ratioPercent, 1)}%
                </span>
              </div>
              <div className="mt-1 text-sm font-bold text-[#173d4a]">
                Compensa abastecer com{" "}
                {flexResult.recommended === "ETANOL" ? "ETANOL" : "GASOLINA"}
              </div>
              <div className="mt-0.5 text-[11px] text-[#52616a]">
                Vantagem estimada de {formatNumberBR(flexResult.savingsPercent, 1)}% por km rodado.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Consumption trend + Active Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#dce2e6] bg-white p-5">
          <h3 className="text-sm font-bold text-[#0c1928]">Curva de Rendimento (km/L)</h3>
          <p className="mb-4 text-xs text-[#52616a]">
            Últimos abastecimentos de tanque cheio registrados
          </p>
          {consumptionTrend.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-xs text-[#52616a]">
              Registre ao menos 2 abastecimentos com tanque cheio para exibir a curva de km/L.
            </div>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={consumptionTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf1f3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#52616a" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#52616a" }} />
                  <Tooltip
                    formatter={(val) => [`${formatNumberBR(Number(val ?? 0), 2)} km/L`, "Média"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="kmPorUnidade"
                    stroke="#173d4a"
                    fill="#173d4a"
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#dce2e6] bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#0c1928]">Alertas & Vencimentos Ativos</h3>
              <p className="text-xs text-[#52616a]">
                Revisões, documentos, CNH e anomalias de consumo
              </p>
            </div>
            <span className="tabular-nums rounded-lg bg-[#edf1f3] px-2.5 py-1 text-xs font-bold text-[#173d4a]">
              {alerts.length}
            </span>
          </div>

          {alerts.length === 0 ? (
            <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-[#dce2e6] text-xs text-[#52616a]">
              Tudo em ordem! Nenhum vencimento ou anomalia pendente.
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {alerts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveTab(a.tab)}
                  className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                    a.level === "VENCIDO"
                      ? "border-red-200 bg-red-50 hover:bg-red-100/70"
                      : "border-amber-200 bg-amber-50 hover:bg-amber-100/70"
                  }`}
                >
                  <AlertTriangle
                    className={`mt-0.5 size-4 shrink-0 ${
                      a.level === "VENCIDO" ? "text-red-600" : "text-amber-600"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#0c1928]">{a.title}</div>
                    <div className="mt-0.5 text-[11px] text-[#52616a]">{a.detail}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
