import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlarmClock,
  Bell,
  BellOff,
  BellRing,
  Check,
  Clock,
  Edit3,
  Flag,
  Info,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useOrion } from "@/store/orionContext";
import type { AgendaAlarm, AgendaAlarmTone } from "@/types/orion";

const WEEK_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getSaoPauloNowParts(now: Date): {
  hhmm: string;
  hhmmss: string;
  weekday: number;
  dateKey: string;
  displayDate: string;
} {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(now).map((p) => [p.type, p.value]));
  const year = parts["year"] ?? "2026";
  const month = parts["month"] ?? "01";
  const day = parts["day"] ?? "01";
  const rawHour = parts["hour"] === "24" ? "00" : (parts["hour"] ?? "00");
  const minute = parts["minute"] ?? "00";
  const second = parts["second"] ?? "00";

  const weekdayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(now);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayStr] ?? now.getDay();

  return {
    hhmm: `${rawHour}:${minute}`,
    hhmmss: `${rawHour}:${minute}:${second}`,
    weekday,
    dateKey: `${year}-${month}-${day}`,
    displayDate: `${day}/${month}/${year}`,
  };
}

function playSynthesizedTone(tone: AgendaAlarmTone): () => void {
  if (typeof window === "undefined") return () => {};
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return () => {};

  let stopped = false;
  let timerId: number | null = null;
  let ctx: AudioContext | null = null;

  try {
    ctx = new AudioCtx();
    const triggerBurst = () => {
      if (stopped || !ctx) return;
      const now = ctx.currentTime;
      const freqs =
        tone === "bell"
          ? [880, 1318.5, 1760]
          : tone === "pulse"
            ? [523.25, 523.25, 783.99]
            : [587.33, 739.99, 880];

      freqs.forEach((freq, idx) => {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone === "pulse" ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.16);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.16 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.16 + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.16);
        osc.stop(now + idx * 0.16 + 0.45);
      });
    };

    triggerBurst();
    timerId = window.setInterval(triggerBurst, 2200);
  } catch {
    return () => {};
  }

  return () => {
    stopped = true;
    if (timerId !== null) window.clearInterval(timerId);
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => {});
    }
  };
}

export function AgendaAlarmManager() {
  const { user, state, upsertAgendaAlarm, deleteAgendaAlarm } = useOrion();
  const location = useLocation();
  const navigate = useNavigate();

  const [ringingAlarm, setRingingAlarm] = useState<AgendaAlarm | null>(null);
  const [confirmDeleteRinging, setConfirmDeleteRinging] = useState(false);
  const stopAudioRef = useRef<() => void>(() => {});
  const firedLocalKeysRef = useRef<Set<string>>(new Set());

  // Apply light/dark theme globally from user AgendaSettings
  useEffect(() => {
    const isDark = state.agendaSettings?.themeMode === "dark";
    document.documentElement.classList.toggle("dark", isDark);
  }, [state.agendaSettings?.themeMode]);

  const stopSound = useCallback(() => {
    stopAudioRef.current();
    stopAudioRef.current = () => {};
  }, []);

  const showAlarmNotification = useCallback(
    async (alarm: AgendaAlarm) => {
      if (!state.agendaSettings.notificationsEnabled) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const title = `Despertador Órion: ${alarm.name || "Alarme"}`;
        const body = `Horário programado ${alarm.time}. Toque para adiar ou desligar.`;
        if (reg && "showNotification" in reg) {
          await reg.showNotification(title, {
            body,
            tag: `orion-alarm-${alarm.id}`,
            renotify: true,
            requireInteraction: true,
            data: { alarmId: alarm.id },
            actions: [
              { action: "snooze", title: `Adiar (${state.agendaSettings.defaultSnoozeMinutes || 5} min)` },
              { action: "dismiss", title: "Desligar" },
            ],
          } as NotificationOptions);
        } else {
          new Notification(title, { body, tag: `orion-alarm-${alarm.id}` });
        }
      } catch {
        // Notification API failure does not crash active app modal
      }
    },
    [state.agendaSettings.defaultSnoozeMinutes, state.agendaSettings.notificationsEnabled],
  );

  const handleSnoozeAlarm = useCallback(
    async (alarm: AgendaAlarm) => {
      stopSound();
      setRingingAlarm(null);
      setConfirmDeleteRinging(false);
      const mins = Math.max(1, Math.min(60, state.agendaSettings.defaultSnoozeMinutes || 5));
      const snoozeUntilIso = new Date(Date.now() + mins * 60_000).toISOString();
      await upsertAgendaAlarm({
        ...alarm,
        snoozeUntilIso,
      });
      toast.info(`Alarme "${alarm.name}" adiado por ${mins} minuto(s).`);
    },
    [state.agendaSettings.defaultSnoozeMinutes, stopSound, upsertAgendaAlarm],
  );

  const handleDismissAlarm = useCallback(
    async (alarm: AgendaAlarm) => {
      stopSound();
      setRingingAlarm(null);
      setConfirmDeleteRinging(false);
      const isOneShot = alarm.repeatDays.length === 0;
      await upsertAgendaAlarm({
        ...alarm,
        enabled: isOneShot ? false : alarm.enabled,
        snoozeUntilIso: null,
      });
      toast.success(
        isOneShot
          ? `Alarme "${alarm.name}" desligado.`
          : `Alarme "${alarm.name}" desligado (recorrência mantida).`,
      );
    },
    [stopSound, upsertAgendaAlarm],
  );

  const handleDeleteRingingAlarm = useCallback(
    async (alarm: AgendaAlarm) => {
      stopSound();
      setRingingAlarm(null);
      setConfirmDeleteRinging(false);
      await deleteAgendaAlarm(alarm.id);
      toast.success(`Alarme "${alarm.name}" excluído.`);
    },
    [deleteAgendaAlarm, stopSound],
  );

  // Listen for Service Worker notification actions
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; alarmId?: string; action?: string } | null;
      if (!data || data.type !== "ORION_ALARM_NOTIFICATION_ACTION" || !data.alarmId) return;
      const target = state.agendaAlarms.find((a) => a.id === data.alarmId);
      if (!target) return;
      if (data.action === "snooze") void handleSnoozeAlarm(target);
      else if (data.action === "dismiss") void handleDismissAlarm(target);
      else {
        setRingingAlarm(target);
        setConfirmDeleteRinging(false);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [handleDismissAlarm, handleSnoozeAlarm, state.agendaAlarms]);

  // Handle URL params triggered when opening app from notification click
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const alarmId = params.get("alarm");
    const action = params.get("action");
    if (!alarmId || state.agendaAlarms.length === 0) return;
    const target = state.agendaAlarms.find((a) => a.id === alarmId);
    if (!target) return;

    if (action === "snooze") {
      void handleSnoozeAlarm(target);
    } else if (action === "dismiss") {
      void handleDismissAlarm(target);
    } else {
      setRingingAlarm(target);
    }
    params.delete("alarm");
    params.delete("action");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
  }, [handleDismissAlarm, handleSnoozeAlarm, location.pathname, location.search, navigate, state.agendaAlarms]);

  // Efficient alarm scheduler (checks every 5s cleanly without heavy polling)
  useEffect(() => {
    if (!user || !user.emailVerified || state.agendaAlarms.length === 0) return;

    const checkAlarms = () => {
      const now = new Date();
      const nowMs = now.getTime();
      const sp = getSaoPauloNowParts(now);

      for (const alarm of state.agendaAlarms) {
        if (!alarm.enabled) continue;

        let triggerKey: string | null = null;

        if (alarm.snoozeUntilIso) {
          const snoozeMs = Date.parse(alarm.snoozeUntilIso);
          if (Number.isFinite(snoozeMs) && nowMs >= snoozeMs && nowMs - snoozeMs < 65_000) {
            triggerKey = `snooze:${alarm.snoozeUntilIso}`;
          }
        } else {
          const matchesDay = alarm.repeatDays.length === 0 || alarm.repeatDays.includes(sp.weekday);
          if (matchesDay && alarm.time === sp.hhmm) {
            triggerKey = `sched:${sp.dateKey}:${sp.hhmm}`;
          }
        }

        if (!triggerKey) continue;
        const memKey = `${alarm.id}:${triggerKey}`;
        if (alarm.lastTriggeredKey === triggerKey || firedLocalKeysRef.current.has(memKey)) {
          continue;
        }

        firedLocalKeysRef.current.add(memKey);
        void upsertAgendaAlarm({
          ...alarm,
          lastTriggeredKey: triggerKey,
          snoozeUntilIso: triggerKey.startsWith("snooze:") ? null : alarm.snoozeUntilIso ?? null,
        });

        setRingingAlarm(alarm);
        setConfirmDeleteRinging(false);
        stopSound();
        if (alarm.soundEnabled) {
          stopAudioRef.current = playSynthesizedTone(alarm.soundTone || "chime");
        }
        void showAlarmNotification(alarm);
        break;
      }
    };

    checkAlarms();
    const id = window.setInterval(checkAlarms, 5000);
    return () => window.clearInterval(id);
  }, [showAlarmNotification, state.agendaAlarms, stopSound, upsertAgendaAlarm, user]);

  useEffect(() => () => stopSound(), [stopSound]);

  if (!ringingAlarm) return null;

  const snoozeMins = state.agendaSettings.defaultSnoozeMinutes || 5;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="orion-alarm-ringing-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0c1928]/75 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl border border-[#b99555] bg-white p-6 shadow-2xl dark:bg-[#0e1e2e] dark:text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#173d4a] text-[#b99555]">
              <BellRing className="size-6 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#b99555]">
                Despertador ativo
              </p>
              <h2 id="orion-alarm-ringing-title" className="text-lg font-semibold text-[#0c1928] dark:text-white">
                {ringingAlarm.name || "Alarme"}
              </h2>
            </div>
          </div>
          <span className="tabular-nums text-xl font-bold text-[#173d4a] dark:text-[#b99555]">
            {ringingAlarm.time}
          </span>
        </div>

        <p className="mt-3 text-xs text-[#52616a] dark:text-slate-300">
          {ringingAlarm.repeatDays.length > 0
            ? `Recorrência: ${ringingAlarm.repeatDays.map((d) => WEEK_LABELS[d]).join(", ")}. Desligar mantém os próximos dias.`
            : "Alarme único. Desligar mantém o registro desativado."}
        </p>

        {confirmDeleteRinging ? (
          <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3 text-xs text-[#991b1b] dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-semibold">Excluir este alarme permanentemente?</p>
            <div className="mt-2.5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteRinging(false)}
                className="h-8 rounded-lg border border-[#dce2e6] bg-white px-3 text-xs font-semibold text-[#0c1928] dark:border-[#233c53] dark:bg-[#132537] dark:text-slate-100"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteRingingAlarm(ringingAlarm)}
                className="h-8 rounded-lg bg-[#dc2626] px-3 text-xs font-semibold text-white hover:bg-[#b91c1c]"
              >
                Confirmar exclusão
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => void handleSnoozeAlarm(ringingAlarm)}
              title={`Adiar alarme por ${snoozeMins} minutos`}
              aria-label={`Adiar alarme por ${snoozeMins} minutos`}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[#b99555] bg-[#faf7f0] px-3 text-xs font-semibold text-[#0c1928] hover:bg-[#f2eee7] dark:bg-[#152b3f] dark:text-amber-200"
            >
              <Clock className="size-4 text-[#b99555]" />
              <span>Adiar ({snoozeMins}m)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDismissAlarm(ringingAlarm)}
              title="Desligar e concluir toque atual"
              aria-label="Desligar e concluir toque atual"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              <BellOff className="size-4" />
              <span>Desligar</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteRinging(true)}
              title="Excluir alarme"
              aria-label="Excluir alarme"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[#fecaca] bg-white px-3 text-xs font-semibold text-[#dc2626] hover:bg-[#fef2f2] dark:border-red-900/50 dark:bg-[#132537] dark:text-red-300"
            >
              <Trash2 className="size-4" />
              <span>Excluir</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Persistent monotonic stopwatch ref store so switching tabs or closing/reopening preserves stopwatch
const stopwatchStore = {
  running: false,
  accumulatedMs: 0,
  startedAtPerf: 0,
  laps: [] as Array<{ id: number; totalMs: number; splitMs: number }>,
};

function formatStopwatch(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safe / 3_600_000);
  const mins = Math.floor((safe % 3_600_000) / 60_000);
  const secs = Math.floor((safe % 60_000) / 1000);
  const centis = Math.floor((safe % 1000) / 10);
  const prefix = hours > 0 ? `${String(hours).padStart(2, "0")}:` : "";
  return `${prefix}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export function ClockAlarmStopwatchModal({
  open,
  onClose,
  initialTab = "clock",
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: "clock" | "alarms" | "stopwatch";
}) {
  const { state, upsertAgendaAlarm, deleteAgendaAlarm, updateAgendaSettings } = useOrion();
  const [tab, setTab] = useState<"clock" | "alarms" | "stopwatch">(initialTab);
  const [nowDate, setNowDate] = useState(() => new Date());

  // Alarm form state (always visible when creating/editing)
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [alarmFormOpen, setAlarmFormOpen] = useState(false);
  const [alarmName, setAlarmName] = useState("");
  const [alarmTime, setAlarmTime] = useState("07:00");
  const [alarmDays, setAlarmDays] = useState<number[]>([]);
  const [alarmSound, setAlarmSound] = useState(state.agendaSettings.alarmSoundDefault);
  const [alarmTone, setAlarmTone] = useState<AgendaAlarmTone>("chime");
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [confirmDeleteAlarmId, setConfirmDeleteAlarmId] = useState<string | null>(null);

  // Stopwatch state synced with monotonic store
  const [swRunning, setSwRunning] = useState(stopwatchStore.running);
  const [swDisplayMs, setSwDisplayMs] = useState(() =>
    stopwatchStore.running
      ? stopwatchStore.accumulatedMs + (performance.now() - stopwatchStore.startedAtPerf)
      : stopwatchStore.accumulatedMs,
  );
  const [swLaps, setSwLaps] = useState(stopwatchStore.laps);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [initialTab, open]);

  // Clock ticker (updates every second while modal is open)
  useEffect(() => {
    if (!open) return;
    setNowDate(new Date());
    const id = window.setInterval(() => setNowDate(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  // Stopwatch RAF / interval loop when running
  useEffect(() => {
    if (!open || !swRunning) return;
    const id = window.setInterval(() => {
      setSwDisplayMs(
        stopwatchStore.accumulatedMs + (performance.now() - stopwatchStore.startedAtPerf),
      );
    }, 50);
    return () => window.clearInterval(id);
  }, [open, swRunning]);

  const timeFormatted = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: state.agendaSettings.showSeconds ? "2-digit" : undefined,
      hour12: state.agendaSettings.timeFormat === "12h",
    };
    return new Intl.DateTimeFormat("pt-BR", opts).format(nowDate);
  }, [nowDate, state.agendaSettings.showSeconds, state.agendaSettings.timeFormat]);

  const dateFormatted = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(nowDate),
    [nowDate],
  );

  if (!open) return null;

  function openNewAlarmForm() {
    setEditingAlarmId(null);
    setAlarmName("");
    setAlarmTime("07:00");
    setAlarmDays([]);
    setAlarmSound(state.agendaSettings.alarmSoundDefault);
    setAlarmTone("chime");
    setAlarmEnabled(true);
    setAlarmFormOpen(true);
  }

  function openEditAlarmForm(alarm: AgendaAlarm) {
    setEditingAlarmId(alarm.id);
    setAlarmName(alarm.name);
    setAlarmTime(alarm.time);
    setAlarmDays(alarm.repeatDays);
    setAlarmSound(alarm.soundEnabled);
    setAlarmTone(alarm.soundTone);
    setAlarmEnabled(alarm.enabled);
    setAlarmFormOpen(true);
  }

  async function saveAlarmForm(e: React.FormEvent) {
    e.preventDefault();
    if (!alarmName.trim()) {
      toast.error("Informe um nome para o alarme.");
      return;
    }
    await upsertAgendaAlarm({
      ...(editingAlarmId ? { id: editingAlarmId } : {}),
      name: alarmName.trim(),
      time: alarmTime,
      repeatDays: [...alarmDays].sort((a, b) => a - b),
      soundEnabled: alarmSound,
      soundTone: alarmTone,
      enabled: alarmEnabled,
      snoozeUntilIso: null,
      lastTriggeredKey: null,
    });
    setAlarmFormOpen(false);
    toast.success(editingAlarmId ? "Alarme atualizado." : "Alarme criado.");
  }

  function toggleDay(day: number) {
    setAlarmDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function startStopwatch() {
    if (stopwatchStore.running) return;
    stopwatchStore.startedAtPerf = performance.now();
    stopwatchStore.running = true;
    setSwRunning(true);
  }

  function pauseStopwatch() {
    if (!stopwatchStore.running) return;
    stopwatchStore.accumulatedMs += performance.now() - stopwatchStore.startedAtPerf;
    stopwatchStore.running = false;
    setSwRunning(false);
    setSwDisplayMs(stopwatchStore.accumulatedMs);
  }

  function resetStopwatch() {
    stopwatchStore.running = false;
    stopwatchStore.accumulatedMs = 0;
    stopwatchStore.startedAtPerf = 0;
    stopwatchStore.laps = [];
    setSwRunning(false);
    setSwDisplayMs(0);
    setSwLaps([]);
  }

  function recordLap() {
    const current = stopwatchStore.running
      ? stopwatchStore.accumulatedMs + (performance.now() - stopwatchStore.startedAtPerf)
      : stopwatchStore.accumulatedMs;
    const prevTotal = stopwatchStore.laps[0]?.totalMs ?? 0;
    const lap = {
      id: stopwatchStore.laps.length + 1,
      totalMs: current,
      splitMs: Math.max(0, current - prevTotal),
    };
    stopwatchStore.laps = [lap, ...stopwatchStore.laps];
    setSwLaps(stopwatchStore.laps);
  }

  const notifStatus =
    typeof Notification === "undefined" ? "unsupported" : Notification.permission;

  async function requestNotificationPermission() {
    if (typeof Notification === "undefined") {
      toast.error("Este navegador não suporta notificações Web.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      await updateAgendaSettings({ notificationsEnabled: true });
      toast.success("Permissão de notificações concedida.");
    } else {
      toast.warning("Permissão de notificações não concedida pelo navegador.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clock-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e] dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
          <div className="flex items-center gap-2.5">
            <Clock className="size-5 text-[#173d4a] dark:text-[#b99555]" />
            <h2 id="clock-modal-title" className="text-lg font-semibold">
              Relógio, Despertador & Cronômetro
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="grid size-8 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5] dark:text-slate-300 dark:hover:bg-[#152b3f]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Sub-nav */}
        <div className="flex border-b border-[#dce2e6] px-5 dark:border-[#233c53]">
          {[
            { id: "clock" as const, label: "Relógio", icon: Clock },
            { id: "alarms" as const, label: `Despertador (${state.agendaAlarms.length})`, icon: AlarmClock },
            { id: "stopwatch" as const, label: "Cronômetro", icon: Timer },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                tab === item.id
                  ? "border-[#173d4a] text-[#173d4a] dark:border-[#b99555] dark:text-[#b99555]"
                  : "border-transparent text-[#52616a] hover:text-[#0c1928] dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "clock" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] px-6 py-8 text-center dark:border-[#233c53] dark:bg-[#132537]">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#52616a] dark:text-slate-400">
                  Horário oficial (America/Sao_Paulo)
                </div>
                <div className="tabular-nums mt-3 font-mono text-4xl font-bold tracking-tight text-[#0c1928] dark:text-white sm:text-5xl">
                  {timeFormatted}
                </div>
                <div className="mt-2 text-sm capitalize text-[#52616a] dark:text-slate-300">
                  {dateFormatted}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-lg border border-[#dce2e6] px-4 py-3 text-xs font-medium dark:border-[#233c53]">
                  <span>Formato de hora</span>
                  <select
                    value={state.agendaSettings.timeFormat}
                    onChange={(e) =>
                      void updateAgendaSettings({ timeFormat: e.target.value as "24h" | "12h" })
                    }
                    className="h-8 rounded-lg border border-[#cbd3d8] bg-white px-2 text-xs font-semibold dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                  >
                    <option value="24h">24 horas</option>
                    <option value="12h">12 horas (AM/PM)</option>
                  </select>
                </label>

                <label className="flex items-center justify-between rounded-lg border border-[#dce2e6] px-4 py-3 text-xs font-medium dark:border-[#233c53]">
                  <span>Exibir segundos</span>
                  <input
                    type="checkbox"
                    checked={state.agendaSettings.showSeconds}
                    onChange={(e) => void updateAgendaSettings({ showSeconds: e.target.checked })}
                    className="size-4 accent-[#173d4a]"
                  />
                </label>
              </div>
            </div>
          )}

          {tab === "alarms" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-[#52616a] dark:text-slate-300">
                  Soneca padrão: <strong className="tabular-nums">{state.agendaSettings.defaultSnoozeMinutes} min</strong>
                </div>
                <button
                  type="button"
                  onClick={openNewAlarmForm}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928]"
                >
                  <Plus className="size-3.5" /> Novo alarme
                </button>
              </div>

              {/* Honest Android/PWA capability notice */}
              <div className="rounded-lg border border-[#dce2e6] bg-[#faf7f0] p-3 text-xs text-[#52616a] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-[#b99555]" />
                  <div className="space-y-1">
                    <p className="font-semibold text-[#0c1928] dark:text-white">
                      Limites reais de despertador Web / Android PWA
                    </p>
                    <p>
                      Com o Órion aberto, os alarmes disparam com som e pop-up instantâneo. Com o navegador fechado ou celular em repouso profundo, navegadores Web/PWA dependem de entrega Web Push e restrições de bateria do Android e <strong>não garantem toque no segundo exato</strong> como um app despertador nativo.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span>
                        Notificações:{" "}
                        <strong>
                          {notifStatus === "granted"
                            ? "Permitidas"
                            : notifStatus === "denied"
                              ? "Bloqueadas no navegador"
                              : notifStatus === "default"
                                ? "Aguardando permissão"
                                : "Não suportadas"}
                        </strong>
                      </span>
                      {notifStatus === "default" && (
                        <button
                          type="button"
                          onClick={() => void requestNotificationPermission()}
                          className="rounded border border-[#173d4a] px-2 py-0.5 font-semibold text-[#173d4a] hover:bg-white dark:border-[#b99555] dark:text-[#b99555]"
                        >
                          Permitir notificações
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {alarmFormOpen && (
                <form
                  onSubmit={(e) => void saveAlarmForm(e)}
                  className="space-y-3 rounded-xl border border-[#173d4a]/40 bg-[#f7f8fa] p-4 dark:border-[#2b4761] dark:bg-[#132537]"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {editingAlarmId ? "Editar alarme" : "Novo alarme"}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setAlarmFormOpen(false)}
                      className="text-xs text-[#52616a] hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                        Nome do alarme
                      </span>
                      <input
                        value={alarmName}
                        onChange={(e) => setAlarmName(e.target.value)}
                        placeholder="Ex.: Medicação, Plantão"
                        required
                        className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                        Horário
                      </span>
                      <input
                        type="time"
                        value={alarmTime}
                        onChange={(e) => setAlarmTime(e.target.value)}
                        required
                        className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-3 text-sm dark:border-[#2b4761] dark:bg-[#0e1e2e]"
                      />
                    </label>
                  </div>

                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-[#52616a] dark:text-slate-300">
                      Dias de repetição (deixe vazio para alarme único)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEK_LABELS.map((lbl, idx) => {
                        const selected = alarmDays.includes(idx);
                        return (
                          <button
                            key={lbl}
                            type="button"
                            onClick={() => toggleDay(idx)}
                            className={`h-8 rounded-lg border px-2.5 text-xs font-semibold ${
                              selected
                                ? "border-[#173d4a] bg-[#173d4a] text-white"
                                : "border-[#dce2e6] bg-white text-[#52616a] dark:border-[#2b4761] dark:bg-[#0e1e2e] dark:text-slate-300"
                            }`}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center justify-between rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]">
                      <span className="flex items-center gap-1.5 font-medium">
                        {alarmSound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                        Tocar som no navegador
                      </span>
                      <input
                        type="checkbox"
                        checked={alarmSound}
                        onChange={(e) => setAlarmSound(e.target.checked)}
                        className="size-4 accent-[#173d4a]"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs dark:border-[#2b4761] dark:bg-[#0e1e2e]">
                      <span className="font-medium">Toque</span>
                      <select
                        value={alarmTone}
                        onChange={(e) => setAlarmTone(e.target.value as AgendaAlarmTone)}
                        className="h-7 rounded border border-[#cbd3d8] bg-white px-2 text-xs dark:border-[#2b4761] dark:bg-[#132537]"
                      >
                        <option value="chime">Suave (Chime)</option>
                        <option value="bell">Sino clássico</option>
                        <option value="pulse">Pulso contínuo</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAlarmFormOpen(false)}
                      className="h-9 rounded-lg border border-[#dce2e6] px-3 text-xs font-semibold dark:border-[#2b4761]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928]"
                    >
                      Salvar alarme
                    </button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-[#edf1f3] rounded-xl border border-[#dce2e6] dark:divide-[#233c53] dark:border-[#233c53]">
                {state.agendaAlarms.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#52616a] dark:text-slate-400">
                    Nenhum alarme cadastrado ainda.
                  </p>
                ) : (
                  state.agendaAlarms.map((alarm) => (
                    <div key={alarm.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className="tabular-nums font-mono text-xl font-bold text-[#0c1928] dark:text-white">
                            {alarm.time}
                          </span>
                          <span className="truncate text-sm font-semibold">{alarm.name}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-[#52616a] dark:text-slate-400">
                          {alarm.repeatDays.length > 0
                            ? alarm.repeatDays.map((d) => WEEK_LABELS[d]).join(", ")
                            : "Alarme único"}{" "}
                          · {alarm.soundEnabled ? `Som (${alarm.soundTone})` : "Silencioso"}
                          {alarm.snoozeUntilIso && " · Soneca agendada"}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void upsertAgendaAlarm({
                              ...alarm,
                              enabled: !alarm.enabled,
                              snoozeUntilIso: null,
                            })
                          }
                          title={alarm.enabled ? "Desativar alarme" : "Ativar alarme"}
                          aria-label={alarm.enabled ? "Desativar alarme" : "Ativar alarme"}
                          className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${
                            alarm.enabled
                              ? "border-[#16a34a]/40 bg-[#f0fdf4] text-[#15803d] dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "border-[#dce2e6] bg-[#f7f8fa] text-[#52616a] dark:border-[#2b4761] dark:bg-[#132537] dark:text-slate-400"
                          }`}
                        >
                          {alarm.enabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
                          {alarm.enabled ? "Ativo" : "Inativo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditAlarmForm(alarm)}
                          title="Editar alarme"
                          aria-label="Editar alarme"
                          className="grid size-8 place-items-center rounded-lg border border-[#dce2e6] text-[#52616a] hover:bg-[#f0f3f5] dark:border-[#2b4761] dark:text-slate-300"
                        >
                          <Edit3 className="size-3.5" />
                        </button>
                        {confirmDeleteAlarmId === alarm.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteAgendaAlarm(alarm.id);
                              setConfirmDeleteAlarmId(null);
                              toast.success("Alarme excluído.");
                            }}
                            title="Confirmar exclusão"
                            aria-label="Confirmar exclusão"
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#dc2626] px-2.5 text-xs font-semibold text-white"
                          >
                            <Check className="size-3.5" /> Confirmar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAlarmId(alarm.id)}
                            title="Excluir alarme"
                            aria-label="Excluir alarme"
                            className="grid size-8 place-items-center rounded-lg border border-[#dce2e6] text-[#52616a] hover:border-[#fecaca] hover:text-[#dc2626] dark:border-[#2b4761] dark:text-slate-300"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === "stopwatch" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] px-6 py-8 text-center dark:border-[#233c53] dark:bg-[#132537]">
                <div className="tabular-nums font-mono text-4xl font-bold text-[#0c1928] dark:text-white sm:text-5xl">
                  {formatStopwatch(swDisplayMs)}
                </div>
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  {!swRunning ? (
                    <button
                      type="button"
                      onClick={startStopwatch}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173d4a] px-5 text-xs font-semibold text-white hover:bg-[#0c1928]"
                    >
                      <Play className="size-4" />
                      {swDisplayMs > 0 ? "Continuar" : "Iniciar"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={pauseStopwatch}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#b99555] px-5 text-xs font-semibold text-[#0c1928] hover:bg-[#a68345]"
                    >
                      <Pause className="size-4" /> Pausar
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={recordLap}
                    disabled={!swRunning && swDisplayMs === 0}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dce2e6] bg-white px-4 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] disabled:opacity-45 dark:border-[#2b4761] dark:bg-[#0e1e2e] dark:text-slate-100"
                  >
                    <Flag className="size-4" /> Volta
                  </button>

                  <button
                    type="button"
                    onClick={resetStopwatch}
                    disabled={swRunning || (swDisplayMs === 0 && swLaps.length === 0)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dce2e6] bg-white px-4 text-xs font-semibold text-[#52616a] hover:text-[#dc2626] disabled:opacity-45 dark:border-[#2b4761] dark:bg-[#0e1e2e] dark:text-slate-300"
                  >
                    <RotateCcw className="size-4" /> Zerar
                  </button>
                </div>
              </div>

              {swLaps.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-xl border border-[#dce2e6] dark:border-[#233c53]">
                  <table className="w-full text-xs">
                    <thead className="border-b border-[#dce2e6] bg-[#f7f8fa] text-left text-[#52616a] dark:border-[#233c53] dark:bg-[#132537] dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Volta</th>
                        <th className="px-4 py-2 font-semibold">Parcial</th>
                        <th className="px-4 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1f3] dark:divide-[#233c53]">
                      {swLaps.map((lap) => (
                        <tr key={lap.id}>
                          <td className="tabular-nums px-4 py-2 font-semibold">#{lap.id}</td>
                          <td className="tabular-nums px-4 py-2 font-mono text-[#52616a] dark:text-slate-300">
                            +{formatStopwatch(lap.splitMs)}
                          </td>
                          <td className="tabular-nums px-4 py-2 text-right font-mono font-semibold">
                            {formatStopwatch(lap.totalMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
