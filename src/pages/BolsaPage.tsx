import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Search, Star, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { B3_STOCKS, stockName, suggestStocks } from "@/lib/domain/b3";
import { useOrion } from "@/store/orionContext";

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
}

interface CurrencyQuote {
  code: string;
  name: string;
  bid: number;
  ask: number;
  pctChange: number;
  high: number;
  low: number;
}

interface ChartPoint {
  hour: string;
  price: number;
}

const FEATURED = ["PETR4", "VALE3", "ITUB4", "BPAC11", "BBAS3", "WEGE3", "PRIO3", "EMBJ3"];

const brlFmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function PctChange({ value }: { value: number }) {
  const cls = value > 0 ? "text-[#16a34a]" : value < 0 ? "text-[#dc2626]" : "text-[#52616a]";
  return (
    <span className={`tabular-nums text-xs font-semibold ${cls}`}>
      {value > 0 ? "▲ " : value < 0 ? "▼ " : ""}
      {Math.abs(value).toFixed(2).replace(".", ",")}%
    </span>
  );
}

export function BolsaPage() {
  const { state, toggleWatchlistTicker } = useOrion();
  const [tab, setTab] = useState<"stocks" | "currencies">("stocks");
  const [stocks, setStocks] = useState<StockQuote[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyQuote[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [stocksSource, setStocksSource] = useState<string>("");
  const [currenciesSource, setCurrenciesSource] = useState<string>("");
  const [stocksError, setStocksError] = useState<string>("");
  const [currenciesError, setCurrenciesError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("PETR4");
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [brlConverter, setBrlConverter] = useState("1000");

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const [sResp, cResp] = await Promise.all([
        fetch("/api/quotes/stocks"),
        fetch("/api/quotes/currencies"),
      ]);

      if (sResp.ok) {
        const sData = (await sResp.json()) as { stocks?: StockQuote[]; source?: string };
        setStocks(sData.stocks ?? []);
        setStocksSource(sData.source ?? "B3 ao vivo");
        setStocksError("");
      } else {
        const err = (await sResp.json().catch(() => ({}))) as { error?: string };
        setStocks([]);
        setStocksError(err.error ?? "Cotações B3 indisponíveis no momento.");
      }

      if (cResp.ok) {
        const cData = (await cResp.json()) as { currencies?: CurrencyQuote[]; source?: string };
        setCurrencies(cData.currencies ?? []);
        setCurrenciesSource(cData.source ?? "Câmbio & Cripto ao vivo");
        setCurrenciesError("");
      } else {
        const err = (await cResp.json().catch(() => ({}))) as { error?: string };
        setCurrencies([]);
        setCurrenciesError(err.error ?? "Cotações de moedas indisponíveis no momento.");
      }

      setUpdatedAt(new Date().toLocaleTimeString("pt-BR"));
    } catch {
      setStocksError("Falha de conexão com o servidor de cotações.");
      setCurrenciesError("Falha de conexão com o servidor de moedas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSelectedChart = useCallback(async (symbol: string) => {
    setChartLoading(true);
    try {
      const resp = await fetch(`/api/quotes/stock/${encodeURIComponent(symbol)}`);
      if (!resp.ok) {
        setChartPoints([]);
        return;
      }
      const data = (await resp.json()) as { points?: ChartPoint[] };
      setChartPoints(data.points ?? []);
    } catch {
      setChartPoints([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuotes();
    const id = setInterval(() => void loadQuotes(), 30_000);
    return () => clearInterval(id);
  }, [loadQuotes]);

  useEffect(() => {
    void loadSelectedChart(selectedSymbol);
  }, [selectedSymbol, loadSelectedChart]);

  const featured = useMemo(
    () => FEATURED.flatMap((sym) => stocks.filter((s) => s.symbol === sym)),
    [stocks],
  );
  const watchlistStocks = useMemo(
    () => stocks.filter((s) => state.watchlistTickers.includes(s.symbol)),
    [stocks, state.watchlistTickers],
  );
  const gainers = useMemo(
    () =>
      [...stocks]
        .filter((s) => s.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 8),
    [stocks],
  );
  const losers = useMemo(
    () =>
      [...stocks]
        .filter((s) => s.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 8),
    [stocks],
  );

  const suggestions = useMemo(() => suggestStocks(search), [search]);
  const selectedStock = useMemo(
    () => stocks.find((s) => s.symbol === selectedSymbol) ?? stocks[0],
    [stocks, selectedSymbol],
  );

  const convertValue = Number(brlConverter.replace(",", ".")) || 0;
  const activeSource = tab === "stocks" ? stocksSource : currenciesSource;

  return (
    <AppShell
      title="Bolsa de Valores & Moedas"
      subtitle={
        updatedAt
          ? `Atualizado às ${updatedAt} · ${activeSource || "Mercado ao vivo"} (${stocks.length}/${B3_STOCKS.length} ativos B3)`
          : "Consultando mercado em tempo real..."
      }
      actions={
        <button
          type="button"
          onClick={() => {
            void loadQuotes();
            void loadSelectedChart(selectedSymbol);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#f0f3f5] whitespace-nowrap"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar ao vivo
        </button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-[#edf1f3] p-1">
            <button
              type="button"
              onClick={() => setTab("stocks")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold ${
                tab === "stocks" ? "bg-white text-[#0c1928] shadow-xs" : "text-[#52616a]"
              }`}
            >
              Ações B3
            </button>
            <button
              type="button"
              onClick={() => setTab("currencies")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold ${
                tab === "currencies" ? "bg-white text-[#0c1928] shadow-xs" : "text-[#52616a]"
              }`}
            >
              Moedas & Cripto
            </button>
          </div>
        </div>

        {tab === "stocks" ? (
          <>
            {stocksError && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-xs text-[#dc2626]">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{stocksError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadQuotes()}
                  className="rounded-lg bg-white px-3 py-1.5 font-semibold text-[#dc2626] ring-1 ring-[#fecaca]"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[#52616a]" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                placeholder="Buscar ação da B3 (ex.: PETR4, Itaú, WEGE3)..."
                className="h-11 w-full rounded-xl border border-[#cbd3d8] bg-white pr-4 pl-11 text-sm"
              />
              {dropdownOpen && suggestions.length > 0 && (
                <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-lg">
                  {suggestions.map((s) => {
                    const live = stocks.find((x) => x.symbol === s.symbol);
                    return (
                      <li key={s.symbol}>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setSelectedSymbol(s.symbol);
                            setSearch("");
                            setDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-[#f7f8fa]"
                        >
                          <span>
                            <b className="text-[#0c1928]">{s.symbol}</b>{" "}
                            <span className="text-[#52616a]">{s.name}</span>
                          </span>
                          {live && (
                            <span className="tabular-nums flex items-center gap-2">
                              <b>{brlFmt(live.price)}</b>
                              <PctChange value={live.changePercent} />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Watchlist Favorites */}
            {watchlistStocks.length > 0 && (
              <section className="rounded-xl border border-[#dce2e6] bg-white p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-[#52616a] uppercase">
                  <Star className="size-3.5 fill-[#b99555] text-[#b99555]" /> Seus Ativos Monitorados
                </div>
                <div className="flex flex-wrap gap-2">
                  {watchlistStocks.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      onClick={() => setSelectedSymbol(s.symbol)}
                      className={`tabular-nums inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                        selectedSymbol === s.symbol
                          ? "border-[#173d4a] bg-[#f2f6f7]"
                          : "border-[#dce2e6] bg-white hover:bg-[#f7f8fa]"
                      }`}
                    >
                      <b className="text-[#0c1928]">{s.symbol}</b>
                      <span>{brlFmt(s.price)}</span>
                      <PctChange value={s.changePercent} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Selected Ticker Detail + Real Intraday Chart */}
            {selectedStock && (
              <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-[#0c1928]">
                        {selectedStock.symbol} · {stockName(selectedStock.symbol)}
                      </h2>
                      <button
                        type="button"
                        onClick={() => void toggleWatchlistTicker(selectedStock.symbol)}
                        aria-label="Favoritar ativo"
                        className="rounded-md p-1 text-[#b99555] hover:bg-[#f7f8fa]"
                      >
                        <Star
                          className="size-4"
                          fill={
                            state.watchlistTickers.includes(selectedStock.symbol)
                              ? "#B99555"
                              : "none"
                          }
                        />
                      </button>
                    </div>
                    <div className="mt-1 flex items-baseline gap-3">
                      <span className="tabular-nums text-2xl font-extrabold text-[#0c1928]">
                        {brlFmt(selectedStock.price)}
                      </span>
                      <PctChange value={selectedStock.changePercent} />
                    </div>
                  </div>
                  <div className="tabular-nums flex gap-6 text-xs text-[#52616a]">
                    <div>
                      <div>Máxima</div>
                      <div className="font-semibold text-[#0c1928]">
                        {brlFmt(selectedStock.high)}
                      </div>
                    </div>
                    <div>
                      <div>Mínima</div>
                      <div className="font-semibold text-[#0c1928]">
                        {brlFmt(selectedStock.low)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-52 w-full">
                  {chartLoading ? (
                    <div className="flex h-full items-center justify-center text-xs text-[#52616a]">
                      Carregando pregão real de {selectedStock.symbol}...
                    </div>
                  ) : chartPoints.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-[#52616a]">
                      Sem série intradia real disponível para {selectedStock.symbol} no momento.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartPoints}>
                        <defs>
                          <linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#173d4a" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#173d4a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#edf1f3" vertical={false} />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 11, fill: "#52616a" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          tick={{ fontSize: 11, fill: "#52616a" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => `R$ ${v.toFixed(2)}`}
                        />
                        <Tooltip formatter={(v: number) => brlFmt(v)} />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke="#173d4a"
                          strokeWidth={2}
                          fill="url(#stockFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>
            )}

            {/* 3 Market Columns */}
            {stocks.length > 0 && (
              <section className="grid gap-5 lg:grid-cols-3">
                {[
                  { title: "Em destaque", icon: Star, items: featured },
                  { title: "Maiores altas", icon: TrendingUp, items: gainers },
                  { title: "Maiores quedas", icon: TrendingDown, items: losers },
                ].map((col) => (
                  <div key={col.title} className="rounded-xl border border-[#dce2e6] bg-white p-4">
                    <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-[#0c1928]">
                      <col.icon className="size-4 text-[#173d4a]" />
                      {col.title}
                    </h3>
                    {col.items.length === 0 ? (
                      <p className="py-6 text-center text-xs text-[#52616a]">
                        Nenhum papel nesta faixa agora.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#edf1f3]">
                        {col.items.map((s) => (
                          <button
                            key={s.symbol}
                            type="button"
                            onClick={() => setSelectedSymbol(s.symbol)}
                            className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-[#f7f8fa]"
                          >
                            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf1f3] text-xs font-bold text-[#173d4a]">
                              {s.symbol.slice(0, 2)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-[#0c1928]">{s.symbol}</div>
                              <div className="truncate text-xs text-[#52616a]">{s.name}</div>
                            </div>
                            <div className="text-right">
                              <div className="tabular-nums text-sm font-bold text-[#0c1928]">
                                {brlFmt(s.price)}
                              </div>
                              <PctChange value={s.changePercent} />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        ) : (
          <div className="space-y-6">
            {currenciesError && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-xs text-[#dc2626]">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{currenciesError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadQuotes()}
                  className="rounded-lg bg-white px-3 py-1.5 font-semibold text-[#dc2626] ring-1 ring-[#fecaca]"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            <div className="rounded-xl border border-[#dce2e6] bg-white p-5">
              <label className="mb-1.5 block text-xs font-semibold text-[#52616a]">
                Conversor rápido a partir de Reais (BRL)
              </label>
              <input
                value={brlConverter}
                onChange={(e) => setBrlConverter(e.target.value)}
                className="tabular-nums h-10 w-48 rounded-lg border border-[#cbd3d8] px-3 text-sm font-semibold"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {currencies.map((c) => {
                const converted = c.bid > 0 ? convertValue / c.bid : 0;
                return (
                  <div key={c.code} className="rounded-xl border border-[#dce2e6] bg-white p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-semibold text-[#52616a]">{c.code} / BRL</div>
                        <div className="text-lg font-bold text-[#0c1928]">{c.name}</div>
                      </div>
                      <PctChange value={c.pctChange} />
                    </div>
                    <div className="tabular-nums mt-3 text-2xl font-extrabold text-[#173d4a]">
                      {c.bid < 1 ? `R$ ${c.bid.toFixed(4).replace(".", ",")}` : brlFmt(c.bid)}
                    </div>
                    <div className="tabular-nums mt-2 border-t border-[#edf1f3] pt-2 text-xs text-[#52616a]">
                      R$ {convertValue.toLocaleString("pt-BR")} ≈{" "}
                      <b className="text-[#0c1928]">
                        {converted.toFixed(c.code === "BTC" ? 6 : 2)} {c.code}
                      </b>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
