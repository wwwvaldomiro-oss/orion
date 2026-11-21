import { useCallback, useEffect, useState } from "react";
import {
  CloudRain,
  CloudSun,
  Droplets,
  Info,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Wind,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useOrion } from "@/store/orionContext";

type GeoSearchResult = {
  name: string;
  admin1: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  label: string;
};

type WeatherResponse = {
  locationLabel: string;
  latitude: number;
  longitude: number;
  provider: string;
  googleWeatherAvailable: boolean;
  googleNotice?: string;
  fetchedAt: string;
  current: {
    temperatureC: number | null;
    apparentTemperatureC: number | null;
    humidityPercent: number | null;
    windKmh: number | null;
    precipitationMm: number | null;
    minTodayC?: number | null;
    maxTodayC?: number | null;
    description: string;
    condition: string;
    isDay: boolean;
  };
  hourly: Array<{
    time: string;
    hourLabel: string;
    temperatureC: number | null;
    precipitationProb: number | null;
    description: string;
    condition: string;
  }>;
  daily: Array<{
    date: string;
    minC: number | null;
    maxC: number | null;
    precipitationMm: number | null;
    precipitationProb: number | null;
    description: string;
    condition: string;
  }>;
};

export function WeatherModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, updateAgendaSettings } = useOrion();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeoSearchResult[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);

  const savedLat = state.agendaSettings.weatherLat;
  const savedLon = state.agendaSettings.weatherLon;
  const savedLabel = state.agendaSettings.weatherLocationName;

  const fetchWeather = useCallback(async (lat: number, lon: number, label: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch(
        `/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&label=${encodeURIComponent(label)}`,
      );
      const data = (await resp.json()) as Partial<WeatherResponse> & { error?: string };
      if (!resp.ok || !data.current) {
        throw new Error(data.error || "Não foi possível obter a previsão do tempo.");
      }
      setWeather(data as WeatherResponse);
    } catch (err) {
      setWeather(null);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Falha ao consultar serviço meteorológico (sem conexão ou bloqueado).",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (typeof savedLat === "number" && typeof savedLon === "number") {
      void fetchWeather(savedLat, savedLon, savedLabel || "Local salvo");
    }
  }, [fetchWeather, open, savedLabel, savedLat, savedLon]);

  if (!open) return null;

  async function handleSearchLocality(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) {
      toast.error("Digite ao menos 2 caracteres para buscar a cidade.");
      return;
    }
    setSearching(true);
    try {
      const resp = await fetch(`/api/weather/search?q=${encodeURIComponent(query.trim())}`);
      const data = (await resp.json()) as {
        results?: GeoSearchResult[];
        error?: string;
      };
      if (!resp.ok || !Array.isArray(data.results)) {
        throw new Error(data.error || "Falha ao buscar localidades.");
      }
      setSearchResults(data.results);
      if (data.results.length === 0) {
        toast.info("Nenhuma cidade encontrada com esse termo.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar localidade.");
    } finally {
      setSearching(false);
    }
  }

  async function selectLocality(item: GeoSearchResult) {
    setSearchResults([]);
    setQuery(item.label);
    await updateAgendaSettings({
      weatherLocationName: item.label,
      weatherLat: item.latitude,
      weatherLon: item.longitude,
    });
    await fetchWeather(item.latitude, item.longitude, item.label);
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste navegador.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const label = "Minha localização atual";
        await updateAgendaSettings({
          weatherLocationName: label,
          weatherLat: lat,
          weatherLon: lon,
        });
        await fetchWeather(lat, lon, label);
      },
      (err) => {
        setLoading(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização recusada. Você pode pesquisar qualquer cidade acima."
            : "Não foi possível obter sua localização atual.";
        setErrorMsg(msg);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  const todayMin = weather?.current.minTodayC ?? weather?.daily[0]?.minC ?? null;
  const todayMax = weather?.current.maxTodayC ?? weather?.daily[0]?.maxC ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="weather-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e] dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
          <div className="flex items-center gap-2.5">
            <CloudSun className="size-5 text-[#173d4a] dark:text-[#b99555]" />
            <h2 id="weather-modal-title" className="text-lg font-semibold">
              Previsão do Tempo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5] dark:text-slate-300"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Locality Search & Explicit Geolocation Bar */}
        <div className="border-b border-[#edf1f3] bg-[#f7f8fa] px-5 py-3 dark:border-[#233c53] dark:bg-[#132537]">
          <form onSubmit={(e) => void handleSearchLocality(e)} className="flex flex-wrap gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#52616a]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cidade (ex.: Brasília, São Paulo, Goiânia)..."
                className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white pr-3 pl-8 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="h-9 rounded-lg bg-[#173d4a] px-3.5 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              {searching ? "Buscando..." : "Buscar"}
            </button>
            <button
              type="button"
              onClick={handleUseMyLocation}
              title="Solicitar localização atual via GPS/navegador"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] dark:border-[#2b4761] dark:bg-[#0e1e2e] dark:text-slate-100"
            >
              <Navigation className="size-3.5 text-[#173d4a] dark:text-[#b99555]" />
              Usar minha localização
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="mt-2 divide-y divide-[#edf1f3] rounded-lg border border-[#dce2e6] bg-white dark:divide-[#233c53] dark:border-[#233c53] dark:bg-[#0e1e2e]">
              {searchResults.map((item, idx) => (
                <button
                  key={`${item.latitude}:${item.longitude}:${idx}`}
                  type="button"
                  onClick={() => void selectLocality(item)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[#f7f8fa] dark:hover:bg-[#152b3f]"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <MapPin className="size-3.5 text-[#b99555]" />
                    {item.label}
                  </span>
                  <span className="tabular-nums text-[11px] text-[#52616a] dark:text-slate-400">
                    {item.latitude.toFixed(2)}, {item.longitude.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Honest provider / Google Maps Weather billing notice */}
          <div className="flex items-start gap-2 rounded-lg border border-[#dce2e6] bg-[#faf7f0] p-3 text-xs text-[#52616a] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-300">
            <Info className="mt-0.5 size-4 shrink-0 text-[#b99555]" />
            <div>
              {weather?.googleNotice ||
                "A Google Maps Weather API requer chave e faturamento autorizados no Google Cloud. Sem autorização paga ativa, o Órion consulta dados meteorológicos reais públicos via Open-Meteo (CC BY 4.0) em cache de 10 minutos, sem custos e sem dados fictícios."}
            </div>
          </div>

          {!savedLat && !loading && !weather && !errorMsg && (
            <div className="rounded-xl border border-dashed border-[#dce2e6] py-12 text-center text-xs text-[#52616a] dark:border-[#233c53] dark:text-slate-400">
              Pesquise uma cidade ou clique em <strong>Usar minha localização</strong> para consultar a previsão real. A localidade escolhida fica salva para consultas futuras sem exigir GPS permanente.
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-xs text-[#52616a]">
              <Loader2 className="size-6 animate-spin text-[#173d4a] dark:text-[#b99555]" />
              <span className="mt-2">Consultando dados meteorológicos reais...</span>
            </div>
          )}

          {errorMsg && !loading && (
            <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-xs text-[#991b1b] dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-semibold">{errorMsg}</p>
              {typeof savedLat === "number" && typeof savedLon === "number" && (
                <button
                  type="button"
                  onClick={() =>
                    void fetchWeather(savedLat, savedLon, savedLabel || "Local salvo")
                  }
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 font-semibold text-[#0c1928]"
                >
                  <RefreshCw className="size-3.5" /> Tentar novamente
                </button>
              )}
            </div>
          )}

          {weather && !loading && (
            <>
              {/* Current conditions */}
              <div className="rounded-xl border border-[#dce2e6] bg-gradient-to-br from-[#0c1928] to-[#173d4a] p-5 text-white">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-[#e7e1d5]">
                      <MapPin className="size-3.5 text-[#b99555]" />
                      <span>{weather.locationLabel}</span>
                    </div>
                    <div className="tabular-nums mt-2 font-mono text-4xl font-bold">
                      {weather.current.temperatureC !== null
                        ? `${Math.round(weather.current.temperatureC)}°C`
                        : "—"}
                    </div>
                    <div className="mt-1 text-sm font-medium text-[#e7e1d5]">
                      {weather.current.description}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs text-[#e7e1d5]">
                    <div>
                      <span className="block text-[11px] text-white/70">Sensação</span>
                      <strong className="tabular-nums text-white">
                        {weather.current.apparentTemperatureC !== null
                          ? `${Math.round(weather.current.apparentTemperatureC)}°C`
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[11px] text-white/70">Mín / Máx hoje</span>
                      <strong className="tabular-nums text-white">
                        {todayMin !== null ? `${Math.round(todayMin)}°` : "—"} /{" "}
                        {todayMax !== null ? `${Math.round(todayMax)}°` : "—"}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1">
                      <Droplets className="size-3.5 text-[#b99555]" />
                      <span className="tabular-nums">
                        Umidade:{" "}
                        {weather.current.humidityPercent !== null
                          ? `${weather.current.humidityPercent}%`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Wind className="size-3.5 text-[#b99555]" />
                      <span className="tabular-nums">
                        Vento:{" "}
                        {weather.current.windKmh !== null
                          ? `${Math.round(weather.current.windKmh)} km/h`
                          : "—"}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <CloudRain className="size-3.5 text-[#b99555]" />
                      <span className="tabular-nums">
                        Precipitação atual:{" "}
                        {weather.current.precipitationMm !== null
                          ? `${weather.current.precipitationMm.toFixed(1)} mm`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hourly forecast */}
              {weather.hourly.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#52616a] dark:text-slate-400">
                    Próximas horas
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {weather.hourly.slice(0, 12).map((h) => (
                      <div
                        key={h.time}
                        className="min-w-20 shrink-0 rounded-lg border border-[#dce2e6] bg-[#f7f8fa] p-2.5 text-center text-xs dark:border-[#233c53] dark:bg-[#132537]"
                      >
                        <div className="tabular-nums font-semibold text-[#52616a] dark:text-slate-300">
                          {h.hourLabel}
                        </div>
                        <div className="tabular-nums my-1 text-base font-bold">
                          {h.temperatureC !== null ? `${Math.round(h.temperatureC)}°` : "—"}
                        </div>
                        <div className="tabular-nums text-[10px] text-[#2563eb] dark:text-sky-300">
                          {h.precipitationProb ?? 0}% chuva
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 7-day forecast */}
              {weather.daily.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#52616a] dark:text-slate-400">
                    Próximos dias
                  </h3>
                  <div className="divide-y divide-[#edf1f3] rounded-xl border border-[#dce2e6] dark:divide-[#233c53] dark:border-[#233c53]">
                    {weather.daily.map((d) => (
                      <div
                        key={d.date}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                      >
                        <div className="min-w-32 font-semibold">
                          <span className="tabular-nums">{d.date.split("-").reverse().join("/")}</span>
                          <span className="ml-2 text-[#52616a] dark:text-slate-400">
                            {d.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="tabular-nums text-[#2563eb] dark:text-sky-300">
                            {d.precipitationProb ?? 0}% ·{" "}
                            {d.precipitationMm !== null ? `${d.precipitationMm.toFixed(1)}mm` : "0mm"}
                          </span>
                          <span className="tabular-nums font-semibold">
                            {d.minC !== null ? `${Math.round(d.minC)}°` : "—"} /{" "}
                            {d.maxC !== null ? `${Math.round(d.maxC)}°` : "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[11px] text-[#52616a] dark:text-slate-400">
                Fonte: {weather.provider} · Atualizado às{" "}
                <span className="tabular-nums">
                  {new Date(weather.fetchedAt).toLocaleTimeString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
