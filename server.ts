import financeIntegrationRouter from "./serverIntegrations.ts";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { B3_STOCKS, stockName } from "./src/lib/domain/b3.ts";

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use("/api", financeIntegrationRouter);

app.use(
  "/api",
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? Number((err as { status?: number }).status)
        : 400;
    const message =
      err instanceof Error ? err.message : "Requisição JSON inválida na API.";
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  },
);

const PORT = Number(process.env["PORT"] || 3000);
const IS_PROD = process.env["NODE_ENV"] === "production";
const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json",
};

interface CachedEntry<T> {
  expiresAt: number;
  data: T;
}

const cache = new Map<string, CachedEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs: number) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 6000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...DEFAULT_HEADERS,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} em ${url}`);
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface TradingViewScanRow {
  s: string;
  d: Array<string | number | null>;
}

interface TradingViewScanResponse {
  totalCount?: number;
  data?: TradingViewScanRow[];
}

interface LiveStockQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  marketTime: number | null;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

async function fetchYahooChart(yahooSymbol: string, interval = "5m", range = "1d") {
  const hosts = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
  let lastError: Error | null = null;
  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;
    try {
      const json = await fetchJsonWithTimeout<YahooChartResponse>(url, {}, 5500);
      const res = json.chart?.result?.[0];
      if (!res?.meta || typeof res.meta.regularMarketPrice !== "number") {
        throw new Error(`Sem dados de pregão para ${yahooSymbol}`);
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error(`Falha ao consultar histórico de ${yahooSymbol}`);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/quotes/stocks", async (_req, res) => {
  const cached = getCached<{ stocks: LiveStockQuote[]; source: string; fetchedAt: string }>("stocks");
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const tickers = B3_STOCKS.map((s) => `BMFBOVESPA:${s.symbol}`);
    const scan = await fetchJsonWithTimeout<TradingViewScanResponse>(
      "https://scanner.tradingview.com/brazil/scan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: { tickers },
          columns: ["name", "description", "close", "change", "high", "low", "volume"],
        }),
      },
      6000,
    );

    const bySymbol = new Map<string, LiveStockQuote>();
    for (const row of scan.data ?? []) {
      const [rawName, , rawClose, rawChange, rawHigh, rawLow, rawVol] = row.d;
      const symbol = String(rawName || row.s.replace(/^BMFBOVESPA:/, "")).toUpperCase();
      const price = typeof rawClose === "number" ? Number(rawClose.toFixed(2)) : NaN;
      if (!Number.isFinite(price) || price <= 0) continue;

      const changePercent = typeof rawChange === "number" ? Number(rawChange.toFixed(2)) : 0;
      const high = typeof rawHigh === "number" && rawHigh > 0 ? Number(rawHigh.toFixed(2)) : price;
      const low = typeof rawLow === "number" && rawLow > 0 ? Number(rawLow.toFixed(2)) : price;
      const volume = typeof rawVol === "number" && rawVol >= 0 ? rawVol : 0;

      bySymbol.set(symbol, {
        symbol,
        name: stockName(symbol),
        price,
        changePercent,
        high,
        low,
        volume,
        marketTime: Math.floor(Date.now() / 1000),
      });
    }

    const stocks = B3_STOCKS.map((s) => bySymbol.get(s.symbol)).filter(
      (item): item is LiveStockQuote => Boolean(item),
    );

    if (stocks.length === 0) {
      res.status(424).json({
        error: "Não foi possível obter cotações reais da B3 no momento. Tente novamente em instantes.",
      });
      return;
    }

    const payload = {
      stocks,
      source: "TradingView · B3 (tempo real)",
      fetchedAt: new Date().toISOString(),
    };
    setCached("stocks", payload, 20_000);
    res.json(payload);
  } catch (err) {
    res.status(424).json({
      error: err instanceof Error ? err.message : "Falha ao consultar cotações reais da B3.",
    });
  }
});

interface B3FluctuationResponse {
  BizSts?: { cd?: string };
  TradgFlr?: {
    scty?: {
      lstQtn?: Array<{
        closPric?: number;
        dtTm?: string;
        prcFlcn?: number;
      }>;
    };
  };
}

app.get("/api/quotes/stock/:symbol", async (req, res) => {
  const symbol = String(req.params["symbol"] || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!symbol) {
    res.status(400).json({ error: "Ticker inválido." });
    return;
  }

  const cacheKey = `stock:${symbol}`;
  const cached = getCached<{
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    high: number;
    low: number;
    volume: number;
    points: Array<{ hour: string; price: number }>;
    source: string;
    fetchedAt: string;
  }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // Primary: Official B3 DailyFluctuationHistory API
  try {
    const b3 = await fetchJsonWithTimeout<B3FluctuationResponse>(
      `https://cotacao.b3.com.br/mds/api/v1/DailyFluctuationHistory/${encodeURIComponent(symbol)}`,
      {},
      6000,
    );
    const rawQuotes = (b3.TradgFlr?.scty?.lstQtn ?? []).filter(
      (q) => typeof q.closPric === "number" && q.closPric > 0 && typeof q.dtTm === "string",
    );
    if (rawQuotes.length > 0) {
      const step = Math.max(1, Math.floor(rawQuotes.length / 60));
      const sampled = rawQuotes.filter((_, idx) => idx % step === 0 || idx === rawQuotes.length - 1);
      const points = sampled.map((q) => ({
        hour: String(q.dtTm).slice(0, 5),
        price: Number(q.closPric!.toFixed(2)),
      }));
      const last = rawQuotes[rawQuotes.length - 1]!;
      const prices = rawQuotes.map((q) => q.closPric!);
      const payload = {
        symbol,
        name: stockName(symbol),
        price: Number(last.closPric!.toFixed(2)),
        changePercent: typeof last.prcFlcn === "number" ? Number(last.prcFlcn.toFixed(2)) : 0,
        high: Number(Math.max(...prices).toFixed(2)),
        low: Number(Math.min(...prices).toFixed(2)),
        volume: 0,
        points,
        source: "B3 Oficial (intradia)",
        fetchedAt: new Date().toISOString(),
      };
      setCached(cacheKey, payload, 30_000);
      res.json(payload);
      return;
    }
  } catch {
    // Fall back to Yahoo query2 single-ticker chart
  }

  try {
    let chart = await fetchYahooChart(`${symbol}.SA`, "5m", "1d");
    const extractPoints = (c: typeof chart) => {
      const timestamps = c.timestamp ?? [];
      const closes = c.indicators?.quote?.[0]?.close ?? [];
      const pts: Array<{ hour: string; price: number }> = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const val = closes[i];
        if (typeof ts === "number" && typeof val === "number" && Number.isFinite(val)) {
          const hour = new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          }).format(new Date(ts * 1000));
          pts.push({ hour, price: Number(val.toFixed(2)) });
        }
      }
      return pts;
    };

    let points = extractPoints(chart);
    if (points.length < 2) {
      chart = await fetchYahooChart(`${symbol}.SA`, "30m", "5d");
      points = extractPoints(chart);
    }

    const meta = chart.meta!;
    const price = Number(meta.regularMarketPrice!.toFixed(2));
    const prev =
      typeof meta.chartPreviousClose === "number" && meta.chartPreviousClose > 0
        ? meta.chartPreviousClose
        : price;

    const payload = {
      symbol,
      name: stockName(symbol),
      price,
      changePercent: prev > 0 ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0,
      high: Number((meta.regularMarketDayHigh || price).toFixed(2)),
      low: Number((meta.regularMarketDayLow || price).toFixed(2)),
      volume: meta.regularMarketVolume || 0,
      points,
      source: "B3 intradia (tempo real)",
      fetchedAt: new Date().toISOString(),
    };
    setCached(cacheKey, payload, 30_000);
    res.json(payload);
  } catch (err) {
    res.status(424).json({
      error: err instanceof Error ? err.message : `Não foi possível obter a série intradia de ${symbol}.`,
    });
  }
});

app.get("/api/quotes/currencies", async (_req, res) => {
  const cached = getCached<{ currencies: unknown[]; source: string; fetchedAt: string }>("currencies");
  if (cached) {
    res.json(cached);
    return;
  }

  const fxMeta: Record<string, { code: string; name: string }> = {
    "FX_IDC:USDBRL": { code: "USD", name: "Dólar Americano" },
    "FX_IDC:EURBRL": { code: "EUR", name: "Euro" },
    "FX_IDC:GBPBRL": { code: "GBP", name: "Libra Esterlina" },
    "FX_IDC:ARSBRL": { code: "ARS", name: "Peso Argentino" },
  };

  try {
    const [fxScan, btcCoinGecko, btcTv] = await Promise.all([
      fetchJsonWithTimeout<TradingViewScanResponse>(
        "https://scanner.tradingview.com/forex/scan",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbols: { tickers: Object.keys(fxMeta) },
            columns: ["name", "close", "change", "high", "low"],
          }),
        },
        6000,
      ).catch(() => null),
      fetchJsonWithTimeout<{ bitcoin?: { brl?: number; brl_24h_change?: number } }>(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true",
        {},
        5500,
      ).catch(() => null),
      fetchJsonWithTimeout<TradingViewScanResponse>(
        "https://scanner.tradingview.com/crypto/scan",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbols: { tickers: ["BINANCE:BTCBRL"] },
            columns: ["name", "close", "change", "high", "low"],
          }),
        },
        5500,
      ).catch(() => null),
    ]);

    const currencies: Array<{
      code: string;
      name: string;
      bid: number;
      ask: number;
      pctChange: number;
      high: number;
      low: number;
    }> = [];

    for (const row of fxScan?.data ?? []) {
      const info = fxMeta[row.s];
      if (!info) continue;
      const [, rawClose, rawChange, rawHigh, rawLow] = row.d;
      const price = typeof rawClose === "number" ? rawClose : NaN;
      if (!Number.isFinite(price) || price <= 0) continue;
      currencies.push({
        code: info.code,
        name: info.name,
        bid: price,
        ask: price,
        pctChange: typeof rawChange === "number" ? Number(rawChange.toFixed(2)) : 0,
        high: typeof rawHigh === "number" && rawHigh > 0 ? rawHigh : price,
        low: typeof rawLow === "number" && rawLow > 0 ? rawLow : price,
      });
    }

    // Secondary official FX fallback via Currency API if TradingView FX fails
    if (currencies.length === 0) {
      try {
        const brlRates = await fetchJsonWithTimeout<{ brl?: Record<string, number> }>(
          "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/brl.json",
          {},
          5000,
        );
        const map = brlRates.brl ?? {};
        for (const [key, code, name] of [
          ["usd", "USD", "Dólar Americano"],
          ["eur", "EUR", "Euro"],
          ["gbp", "GBP", "Libra Esterlina"],
          ["ars", "ARS", "Peso Argentino"],
        ] as const) {
          const perBrl = map[key];
          if (typeof perBrl === "number" && perBrl > 0) {
            const bid = 1 / perBrl;
            currencies.push({ code, name, bid, ask: bid, pctChange: 0, high: bid, low: bid });
          }
        }
      } catch {
        // Leave FX omitted if unavailable
      }
    }

    if (btcCoinGecko?.bitcoin?.brl) {
      const btcPrice = Number(btcCoinGecko.bitcoin.brl);
      const btcPct = Number((btcCoinGecko.bitcoin.brl_24h_change ?? 0).toFixed(2));
      currencies.push({
        code: "BTC",
        name: "Bitcoin",
        bid: btcPrice,
        ask: btcPrice,
        pctChange: btcPct,
        high: btcPrice,
        low: btcPrice,
      });
    } else if (btcTv?.data?.[0]) {
      const [, rawClose, rawChange, rawHigh, rawLow] = btcTv.data[0].d;
      const btcPrice = typeof rawClose === "number" ? rawClose : 0;
      if (btcPrice > 0) {
        currencies.push({
          code: "BTC",
          name: "Bitcoin",
          bid: btcPrice,
          ask: btcPrice,
          pctChange: typeof rawChange === "number" ? Number(rawChange.toFixed(2)) : 0,
          high: typeof rawHigh === "number" && rawHigh > 0 ? rawHigh : btcPrice,
          low: typeof rawLow === "number" && rawLow > 0 ? rawLow : btcPrice,
        });
      }
    }

    if (currencies.length === 0) {
      res.status(424).json({
        error: "Cotações de moedas em tempo real indisponíveis no momento.",
      });
      return;
    }

    const payload = {
      currencies,
      source: "TradingView FX & CoinGecko (tempo real)",
      fetchedAt: new Date().toISOString(),
    };
    setCached("currencies", payload, 20_000);
    res.json(payload);
  } catch (err) {
    res.status(424).json({
      error: err instanceof Error ? err.message : "Falha ao obter cotações reais de moedas.",
    });
  }
});

app.get("/api/sgs/:index", async (req, res) => {
  const index = String(req.params["index"] || "").toUpperCase();
  const isIgpm = index === "IGP-M" || index === "IGPM";
  const code = isIgpm ? 189 : 433;
  const cacheKey = `sgs:${code}`;
  const cached = getCached<{ observations: Array<{ month: string; rate: number }>; source: string }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // Primary: BCB SGS official series
  try {
    const raw = await fetchJsonWithTimeout<Array<{ data: string; valor: string }>>(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/24?formato=json`,
      {},
      4500,
    );
    const observations = raw
      .map((r) => {
        const [, m, y] = r.data.split("/");
        return { month: `${y}-${m}`, rate: Number(r.valor) };
      })
      .filter((o) => o.month.length === 7 && Number.isFinite(o.rate));

    if (observations.length > 0) {
      const payload = { observations, source: `BCB SGS ${code} (oficial)` };
      setCached(cacheKey, payload, 3_600_000);
      res.json(payload);
      return;
    }
  } catch {
    // Fall through to official IBGE SIDRA / IPEAdata public series
  }

  // Official IBGE SIDRA (IPCA) or IPEAdata (IGP-M)
  try {
    if (!isIgpm) {
      const sidra = await fetchJsonWithTimeout<
        Array<{
          resultados?: Array<{
            series?: Array<{ serie?: Record<string, string> }>;
          }>;
        }>
      >(
        "https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-24/variaveis/63?localidades=N1[all]",
        {},
        5500,
      );
      const serie = sidra[0]?.resultados?.[0]?.series?.[0]?.serie ?? {};
      const observations = Object.entries(serie)
        .map(([ym, val]) => ({
          month: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`,
          rate: Number(val),
        }))
        .filter((o) => o.month.length === 7 && Number.isFinite(o.rate));

      if (observations.length > 0) {
        const payload = { observations, source: "IBGE SIDRA · IPCA oficial" };
        setCached(cacheKey, payload, 3_600_000);
        res.json(payload);
        return;
      }
    } else {
      const ipea = await fetchJsonWithTimeout<{
        value?: Array<{ VALDATA: string; VALVALOR: number | null }>;
      }>(
        "https://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='IGP12_IGPMG12')",
        {},
        5500,
      );
      const observations = (ipea.value ?? [])
        .map((row) => ({
          month: String(row.VALDATA || "").slice(0, 7),
          rate: typeof row.VALVALOR === "number" ? Number(row.VALVALOR.toFixed(4)) : NaN,
        }))
        .filter((o) => o.month.length === 7 && Number.isFinite(o.rate))
        .slice(-24);

      if (observations.length > 0) {
        const payload = { observations, source: "IPEAdata · FGV IGP-M oficial" };
        setCached(cacheKey, payload, 3_600_000);
        res.json(payload);
        return;
      }
    }
  } catch (err) {
    res.status(424).json({
      error: err instanceof Error ? err.message : `Não foi possível consultar o índice oficial ${index}.`,
    });
    return;
  }

  res.status(424).json({
    error: `Não foi possível consultar observações oficiais para ${index} no momento.`,
  });
});

app.post("/api/garagem/fipe-consulta", async (req, res) => {
  const body = (req.body ?? {}) as {
    plate?: string;
    stateUf?: string;
    fipeCode?: string;
  };
  const normalizedPlate = String(body.plate || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (normalizedPlate.length < 7) {
    res.status(400).json({ error: "Informe uma placa válida (ex.: ABC1D23)." });
    return;
  }

  try {
    let fipeReferenceMonth: string | null = null;
    let fipeBrandCount: number | null = null;
    let fipePriceRecord: {
      valor?: string;
      marca?: string;
      modelo?: string;
      anoModelo?: number;
      combustivel?: string;
      codigoFipe?: string;
    } | null = null;
    let brasilApiReachable = false;

    const [tablesRes, brandsRes] = await Promise.all([
      fetch("https://brasilapi.com.br/api/fipe/tabelas/v1").catch(() => null),
      fetch("https://brasilapi.com.br/api/fipe/marcas/v1/carros").catch(() => null),
    ]);

    if (tablesRes?.ok) {
      const tables = (await tablesRes.json()) as Array<{ mes?: string }>;
      fipeReferenceMonth = tables[0]?.mes ?? null;
      brasilApiReachable = true;
    }
    if (brandsRes?.ok) {
      const brands = (await brandsRes.json()) as unknown[];
      fipeBrandCount = brands.length;
      brasilApiReachable = true;
    }

    const code = String(body.fipeCode || "").trim();
    if (code) {
      const priceRes = await fetch(
        `https://brasilapi.com.br/api/fipe/preco/v1/${encodeURIComponent(code)}`,
      ).catch(() => null);
      if (priceRes?.ok) {
        const prices = (await priceRes.json()) as Array<{
          valor?: string;
          marca?: string;
          modelo?: string;
          anoModelo?: number;
          combustivel?: string;
          codigoFipe?: string;
        }>;
        fipePriceRecord = prices[0] ?? null;
      }
    }

    res.json({
      plate: normalizedPlate,
      stateUf: String(body.stateUf || "DF")
        .toUpperCase()
        .slice(0, 2),
      brasilApiReachable,
      fipeReferenceMonth,
      fipeBrandCount,
      fipePriceRecord,
      notice:
        "Consulta real de referência FIPE via BrasilAPI. Débitos estaduais (IPVA/CRLV/Multas) dependem de consulta direta no portal Detran/Sefaz da UF.",
    });
  } catch (err) {
    res.status(424).json({
      error: err instanceof Error ? err.message : "Falha ao consultar tabela FIPE.",
    });
  }
});

function wmoWeatherDescription(code: number): { label: string; condition: "clear" | "partly" | "cloudy" | "fog" | "rain" | "storm" | "snow" } {
  if (code === 0) return { label: "Céu limpo", condition: "clear" };
  if (code === 1) return { label: "Predomínio de sol", condition: "clear" };
  if (code === 2) return { label: "Parcialmente nublado", condition: "partly" };
  if (code === 3) return { label: "Nublado", condition: "cloudy" };
  if (code === 45 || code === 48) return { label: "Neblina", condition: "fog" };
  if (code >= 51 && code <= 57) return { label: "Garoa", condition: "rain" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Chuva", condition: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Neve / granizo", condition: "snow" };
  if (code >= 95) return { label: "Tempestade", condition: "storm" };
  return { label: "Tempo variável", condition: "partly" };
}

app.get("/api/weather/search", async (req, res) => {
  const q = String(req.query["q"] || "").trim().slice(0, 100);
  if (q.length < 2) {
    res.status(400).json({ error: "Informe pelo menos 2 caracteres para buscar a localidade." });
    return;
  }

  const cacheKey = `weather:search:${q.toLowerCase()}`;
  const cached = getCached<{
    results: Array<{
      name: string;
      admin1: string;
      country: string;
      countryCode: string;
      latitude: number;
      longitude: number;
      label: string;
    }>;
    provider: string;
  }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const geo = await fetchJsonWithTimeout<{
      results?: Array<{
        name?: string;
        admin1?: string;
        country?: string;
        country_code?: string;
        latitude?: number;
        longitude?: number;
      }>;
    }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=pt&format=json`,
      {},
      5500,
    );

    const results = (geo.results ?? [])
      .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number" && r.name)
      .map((r) => {
        const name = String(r.name);
        const admin1 = String(r.admin1 || "");
        const country = String(r.country || "");
        const countryCode = String(r.country_code || "");
        const label = [name, admin1, countryCode || country].filter(Boolean).join(", ");
        return {
          name,
          admin1,
          country,
          countryCode,
          latitude: Number(r.latitude!.toFixed(4)),
          longitude: Number(r.longitude!.toFixed(4)),
          label,
        };
      });

    const payload = {
      results,
      provider: "Open-Meteo Geocoding (API pública gratuita)",
    };
    setCached(cacheKey, payload, 1_800_000);
    res.json(payload);
  } catch (err) {
    res.status(424).json({
      error: err instanceof Error ? err.message : "Falha ao pesquisar localidade no serviço meteorológico.",
    });
  }
});

app.get("/api/weather", async (req, res) => {
  const lat = Number(req.query["lat"]);
  const lon = Number(req.query["lon"]);
  const label = String(req.query["label"] || "").trim().slice(0, 140);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    res.status(400).json({ error: "Coordenadas geográficas inválidas (lat/lon)." });
    return;
  }

  const latKey = lat.toFixed(2);
  const lonKey = lon.toFixed(2);
  const cacheKey = `weather:forecast:${latKey}:${lonKey}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) {
    res.json({ ...cached, ...(label ? { locationLabel: label } : {}) });
    return;
  }

  const googleWeatherKey =
    process.env["GOOGLE_WEATHER_API_KEY"] ||
    process.env["GOOGLE_MAPS_WEATHER_API_KEY"] ||
    "";

  if (googleWeatherKey) {
    try {
      const gCurrent = await fetchJsonWithTimeout<Record<string, unknown>>(
        `https://weather.googleapis.com/v1/currentConditions:lookup?key=${encodeURIComponent(googleWeatherKey)}&location.latitude=${lat}&location.longitude=${lon}&languageCode=pt-BR`,
        {},
        5500,
      );
      if (gCurrent && typeof gCurrent === "object" && "temperature" in gCurrent) {
        const tempObj = gCurrent["temperature"] as { degrees?: number } | undefined;
        const feelsObj = gCurrent["feelsLikeTemperature"] as { degrees?: number } | undefined;
        const windObj = gCurrent["wind"] as { speed?: { value?: number } } | undefined;
        const humidity = Number(gCurrent["relativeHumidity"] ?? 0);
        const condObj = gCurrent["weatherCondition"] as { description?: { text?: string } } | undefined;
        if (typeof tempObj?.degrees === "number") {
          const googlePayload = {
            locationLabel: label || `${latKey}, ${lonKey}`,
            latitude: lat,
            longitude: lon,
            provider: "Google Maps Platform · Weather API (oficial)",
            googleWeatherAvailable: true,
            googleNotice: "Integrado à Weather API oficial do Google Maps Platform configurada no servidor.",
            fetchedAt: new Date().toISOString(),
            current: {
              temperatureC: Number(tempObj.degrees.toFixed(1)),
              apparentTemperatureC: Number((feelsObj?.degrees ?? tempObj.degrees).toFixed(1)),
              humidityPercent: Number.isFinite(humidity) ? Math.round(humidity) : 0,
              windKmh: Number((windObj?.speed?.value ?? 0).toFixed(1)),
              precipitationMm: 0,
              description: condObj?.description?.text || "Condição atual",
              condition: "partly",
              isDay: Boolean(gCurrent["isDaytime"] ?? true),
            },
            hourly: [],
            daily: [],
          };
          setCached(cacheKey, googlePayload, 600_000);
          res.json(googlePayload);
          return;
        }
      }
    } catch {
      // Fall back to Open-Meteo if Google Weather API is not authorized/enabled for this key
    }
  }

  try {
    const forecast = await fetchJsonWithTimeout<{
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        apparent_temperature?: number;
        precipitation?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        is_day?: number;
      };
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        precipitation_probability?: number[];
        weather_code?: number[];
      };
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        precipitation_probability_max?: number[];
      };
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=America%2FSao_Paulo&forecast_days=7`,
      {},
      6000,
    );

    if (!forecast.current || typeof forecast.current.temperature_2m !== "number") {
      throw new Error("Resposta meteorológica incompleta.");
    }

    const curCode = Number(forecast.current.weather_code ?? 2);
    const curDesc = wmoWeatherDescription(curCode);

    const nowHourIso = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    })
      .format(new Date())
      .replace(" ", "T");

    const hTimes = forecast.hourly?.time ?? [];
    const hTemps = forecast.hourly?.temperature_2m ?? [];
    const hPops = forecast.hourly?.precipitation_probability ?? [];
    const hCodes = forecast.hourly?.weather_code ?? [];

    const hourly: Array<{
      time: string;
      hourLabel: string;
      temperatureC: number;
      precipitationProb: number;
      description: string;
      condition: string;
    }> = [];

    for (let i = 0; i < hTimes.length; i++) {
      const t = hTimes[i];
      if (!t || t.slice(0, 13) < nowHourIso.slice(0, 13)) continue;
      const temp = hTemps[i];
      if (typeof temp !== "number") continue;
      const wmo = wmoWeatherDescription(Number(hCodes[i] ?? 2));
      hourly.push({
        time: t,
        hourLabel: t.slice(11, 16),
        temperatureC: Number(temp.toFixed(1)),
        precipitationProb: Math.round(Number(hPops[i] ?? 0)),
        description: wmo.label,
        condition: wmo.condition,
      });
      if (hourly.length >= 12) break;
    }

    const dTimes = forecast.daily?.time ?? [];
    const dCodes = forecast.daily?.weather_code ?? [];
    const dMax = forecast.daily?.temperature_2m_max ?? [];
    const dMin = forecast.daily?.temperature_2m_min ?? [];
    const dPrecip = forecast.daily?.precipitation_sum ?? [];
    const dPopMax = forecast.daily?.precipitation_probability_max ?? [];

    const daily = dTimes.map((date, idx) => {
      const wmo = wmoWeatherDescription(Number(dCodes[idx] ?? 2));
      return {
        date,
        minC: Number((dMin[idx] ?? 0).toFixed(1)),
        maxC: Number((dMax[idx] ?? 0).toFixed(1)),
        precipitationMm: Number((dPrecip[idx] ?? 0).toFixed(1)),
        precipitationProb: Math.round(Number(dPopMax[idx] ?? 0)),
        description: wmo.label,
        condition: wmo.condition,
      };
    });

    const payload = {
      locationLabel: label || `${latKey}, ${lonKey}`,
      latitude: lat,
      longitude: lon,
      provider: "Open-Meteo (API pública gratuita · sem chave paga)",
      googleWeatherAvailable: false,
      googleNotice:
        "Google Maps Weather API requer projeto Cloud com faturamento autorizado e chave dedicada. Exibindo dados meteorológicos reais via Open-Meteo sem custos.",
      fetchedAt: new Date().toISOString(),
      current: {
        temperatureC: Number(forecast.current.temperature_2m.toFixed(1)),
        apparentTemperatureC: Number(
          (forecast.current.apparent_temperature ?? forecast.current.temperature_2m).toFixed(1),
        ),
        humidityPercent: Math.round(Number(forecast.current.relative_humidity_2m ?? 0)),
        windKmh: Number((forecast.current.wind_speed_10m ?? 0).toFixed(1)),
        precipitationMm: Number((forecast.current.precipitation ?? 0).toFixed(1)),
        minTodayC: daily[0]?.minC ?? null,
        maxTodayC: daily[0]?.maxC ?? null,
        description: curDesc.label,
        condition: curDesc.condition,
        isDay: Number(forecast.current.is_day ?? 1) === 1,
      },
      hourly,
      daily,
    };

    setCached(cacheKey, payload, 600_000);
    res.json(payload);
  } catch (err) {
    res.status(424).json({
      error: err instanceof Error ? err.message : "Previsão do tempo indisponível no momento.",
      googleWeatherAvailable: false,
    });
  }
});

async function startServer() {
  // Never allow unmatched /api/* calls to fall through into Vite or SPA index.html
  app.use("/api", (req, res) => {
    res.status(404).json({
      error: `Rota de API não encontrada (${req.method} /api${req.path}).`,
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*path}", (req, res) => {
      if (req.path === "/api" || req.path.startsWith("/api/")) {
        res.status(404).json({ error: "Rota de API não encontrada." });
        return;
      }
      const indexHtml = path.join(distDir, "index.html");
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send("Build not found");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Órion] Servidor ativo em http://0.0.0.0:${PORT}`);
  });
}

void startServer();
