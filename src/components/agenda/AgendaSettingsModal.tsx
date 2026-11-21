import { Bell, Moon, Settings, Sun, X } from "lucide-react";
import { toast } from "sonner";
import { SHOPPING_HIGHLIGHT_PALETTE } from "@/lib/domain/agendaNotes";
import { useOrion } from "@/store/orionContext";

export function AgendaSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, updateAgendaSettings } = useOrion();
  const s = state.agendaSettings;

  if (!open) return null;

  const notifPerm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;

  async function handleEnableNotifications() {
    if (typeof Notification === "undefined") {
      toast.error("Navegador sem suporte a Notificações.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      await updateAgendaSettings({ notificationsEnabled: true });
      toast.success("Notificações ativadas.");
    } else {
      await updateAgendaSettings({ notificationsEnabled: false });
      toast.warning("Permissão negada nas configurações do navegador.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agenda-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e] dark:text-slate-100">
        <div className="flex items-center justify-between border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
          <div className="flex items-center gap-2.5">
            <Settings className="size-5 text-[#173d4a] dark:text-[#b99555]" />
            <h2 id="agenda-settings-title" className="text-lg font-semibold">
              Configurações da Agenda
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

        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {/* Theme */}
          <div className="flex items-center justify-between rounded-xl border border-[#dce2e6] p-3.5 dark:border-[#233c53]">
            <div>
              <div className="font-semibold">Tema de exibição</div>
              <div className="text-[#52616a] dark:text-slate-400">
                Alterna entre tema claro e escuro preservando a identidade do Órion.
              </div>
            </div>
            <div className="inline-flex rounded-lg border border-[#dce2e6] p-0.5 dark:border-[#2b4761]">
              <button
                type="button"
                onClick={() => void updateAgendaSettings({ themeMode: "light" })}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold ${
                  s.themeMode === "light" ? "bg-[#173d4a] text-white" : "text-[#52616a] dark:text-slate-300"
                }`}
              >
                <Sun className="size-3.5" /> Claro
              </button>
              <button
                type="button"
                onClick={() => void updateAgendaSettings({ themeMode: "dark" })}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold ${
                  s.themeMode === "dark" ? "bg-[#b99555] text-[#0c1928]" : "text-[#52616a] dark:text-slate-300"
                }`}
              >
                <Moon className="size-3.5" /> Escuro
              </button>
            </div>
          </div>

          {/* Clock / Snooze */}
          <div className="space-y-3 rounded-xl border border-[#dce2e6] p-3.5 dark:border-[#233c53]">
            <div className="font-semibold">Relógio e Despertador</div>
            <label className="flex items-center justify-between">
              <span>Formato do horário</span>
              <select
                value={s.timeFormat}
                onChange={(e) =>
                  void updateAgendaSettings({ timeFormat: e.target.value as "24h" | "12h" })
                }
                className="h-8 rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#132537]"
              >
                <option value="24h">24 horas</option>
                <option value="12h">12 horas</option>
              </select>
            </label>
            <label className="flex items-center justify-between">
              <span>Mostrar segundos no relógio</span>
              <input
                type="checkbox"
                checked={s.showSeconds}
                onChange={(e) => void updateAgendaSettings({ showSeconds: e.target.checked })}
                className="size-4 accent-[#173d4a]"
              />
            </label>
            <label className="flex items-center justify-between">
              <span>Tempo padrão da soneca (minutos)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={s.defaultSnoozeMinutes}
                onChange={(e) =>
                  void updateAgendaSettings({
                    defaultSnoozeMinutes: Math.max(1, Math.min(60, Number(e.target.value) || 5)),
                  })
                }
                className="tabular-nums h-8 w-20 rounded border border-[#cbd3d8] bg-white px-2 text-right dark:border-[#2b4761] dark:bg-[#132537]"
              />
            </label>
            <label className="flex items-center justify-between">
              <span>Som padrão dos novos alarmes</span>
              <input
                type="checkbox"
                checked={s.alarmSoundDefault}
                onChange={(e) =>
                  void updateAgendaSettings({ alarmSoundDefault: e.target.checked })
                }
                className="size-4 accent-[#173d4a]"
              />
            </label>
          </div>

          {/* Birthdays 29/02 rule */}
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[#dce2e6] p-3.5 dark:border-[#233c53]">
            <div>
              <div className="font-semibold">Aniversário em 29 de fevereiro</div>
              <div className="text-[#52616a] dark:text-slate-400">
                Dia exibido no calendário em anos não bissextos (a data original permanece 29/02).
              </div>
            </div>
            <select
              value={s.leapYearBirthdayRule}
              onChange={(e) =>
                void updateAgendaSettings({
                  leapYearBirthdayRule: e.target.value as "feb28" | "mar01",
                })
              }
              className="h-8 shrink-0 rounded border border-[#cbd3d8] bg-white px-2 dark:border-[#2b4761] dark:bg-[#132537]"
            >
              <option value="feb28">28/02</option>
              <option value="mar01">01/03</option>
            </select>
          </label>

          {/* Shopping Highlight Color */}
          <div className="rounded-xl border border-[#dce2e6] p-3.5 dark:border-[#233c53]">
            <div className="font-semibold">Cor do marca-texto (Lista de Compras)</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {SHOPPING_HIGHLIGHT_PALETTE.map((hl) => (
                <button
                  key={hl.id}
                  type="button"
                  onClick={() => void updateAgendaSettings({ shoppingHighlightColor: hl.hex })}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold text-[#0c1928] ${
                    s.shoppingHighlightColor === hl.hex
                      ? "border-[#0c1928] ring-1 ring-[#173d4a]"
                      : "border-[#cbd3d8]"
                  }`}
                  style={{ backgroundColor: hl.hex }}
                >
                  {hl.label.replace("Marca-texto ", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications & PWA limits */}
          <div className="space-y-2 rounded-xl border border-[#dce2e6] p-3.5 dark:border-[#233c53]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold">
                <Bell className="size-4 text-[#b99555]" /> Notificações Web / PWA
              </div>
              <span className="text-[11px] text-[#52616a] dark:text-slate-400">
                Status: <strong>{notifPerm}</strong>
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.notificationsEnabled}
                  onChange={(e) =>
                    void updateAgendaSettings({ notificationsEnabled: e.target.checked })
                  }
                  className="size-4 accent-[#173d4a]"
                />
                Disparar notificações quando permitido
              </label>
              <button
                type="button"
                onClick={() => void handleEnableNotifications()}
                className="h-8 rounded-lg border border-[#173d4a] px-3 font-semibold text-[#173d4a] hover:bg-[#edf1f3] dark:border-[#b99555] dark:text-[#b99555]"
              >
                Solicitar permissão
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#dce2e6] px-5 py-3 dark:border-[#233c53]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928]"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
