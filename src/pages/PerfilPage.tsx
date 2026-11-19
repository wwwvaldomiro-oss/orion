import { useEffect, useMemo, useState } from "react";
import { Check, Download, LogOut, Save, ShieldCheck, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { BRAND_LOGOS } from "@/components/brandLogoSpecs";
import { BrandMark } from "@/components/BrandLogos";
import { OrionImportPanel } from "@/components/OrionImportPanel";
import { useOrion } from "@/store/orionContext";
import { BRAZIL_STATES } from "@/lib/domain/contracts";
import { downloadBlob } from "@/lib/domain/invoice";
import municipalitiesRaw from "@/lib/domain/municipalities.json";
import type { BrandLogoId } from "@/types/orion";

const municipalities = municipalitiesRaw as Record<string, string[]>;

export function PerfilPage() {
  const {
    user,
    state,
    signOutUser,
    updateProfile,
    updateSelectedLogo,
    updatePixRecipient,
    exportBackupJson,
    importBackupJson,
    clearAllUserData,
  } = useOrion();

  const [name, setName] = useState(state.profile.name);
  const [email, setEmail] = useState(state.profile.email);
  const [pixKey, setPixKey] = useState(state.pixRecipient.key);
  const [pixName, setPixName] = useState(state.pixRecipient.name);
  const [pixState, setPixState] = useState(state.pixRecipient.state);
  const [pixCity, setPixCity] = useState(state.pixRecipient.city);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setName(state.profile.name);
    setEmail(state.profile.email);
    setPixKey(state.pixRecipient.key);
    setPixName(state.pixRecipient.name);
    setPixState(state.pixRecipient.state);
    setPixCity(state.pixRecipient.city);
  }, [state.profile, state.pixRecipient]);

  const citiesForState = useMemo(() => municipalities[pixState] ?? [], [pixState]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    await updateProfile({
      name: name.trim(),
      email: email.trim(),
      photoUrl: state.profile.photoUrl,
      city: pixCity,
      state: pixState,
      selectedLogoId: state.profile.selectedLogoId,
    });
    await updatePixRecipient({
      key: pixKey.trim(),
      name: pixName.trim(),
      state: pixState,
      city: pixCity,
    });
    toast.success("Perfil e dados do recebedor Pix salvos na sua conta.");
  }

  async function handleSelectLogo(logoId: BrandLogoId) {
    await updateSelectedLogo(logoId);
    const chosen = BRAND_LOGOS.find((l) => l.id === logoId);
    toast.success(`Logomarca "${chosen?.name ?? logoId}" aplicada ao aplicativo.`);
  }

  function handleExport() {
    const json = exportBackupJson();
    downloadBlob(new Blob([json], { type: "application/json" }), "orion-backup.json");
    toast.success("Backup JSON exportado.");
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((text) => {
        const probe = JSON.parse(text) as { format?: string };
        if (probe?.format === "orion-personal-data") {
          toast.info(
            "Arquivo no formato orion-personal-data detectado. Utilize o painel de Importação com Prévia abaixo para conferir e confirmar.",
          );
          return;
        }
        return importBackupJson(text).then(() =>
          toast.success("Dados restaurados na sua conta Firestore."),
        );
      })
      .catch(() => toast.error("Arquivo JSON inválido ou incompatível."));
  }

  async function handleClearAll() {
    await clearAllUserData();
    setConfirmClear(false);
    toast.success("Todos os seus registros foram apagados com segurança.");
  }

  return (
    <AppShell
      title="Perfil & Configurações"
      subtitle="Conta Google, seleção de logomarca, recebedor Pix e backup pessoal"
      actions={
        <button
          type="button"
          onClick={() => void signOutUser()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce2e6] bg-white px-3 py-2 text-xs font-semibold text-[#0c1928] hover:bg-[#f0f3f5] whitespace-nowrap"
        >
          <LogOut className="size-3.5" /> Sair da conta
        </button>
      }
    >
      <div className="space-y-6">
        {/* Google Account Identity Banner */}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center gap-4">
            {state.profile.photoUrl ? (
              <img
                src={state.profile.photoUrl}
                alt={state.profile.name}
                referrerPolicy="no-referrer"
                className="size-14 rounded-full border border-[#dce2e6] object-cover"
              />
            ) : (
              <div className="grid size-14 place-items-center rounded-full bg-[#173d4a] text-lg font-bold text-white">
                {state.profile.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[#0c1928]">{state.profile.name}</h2>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16a34a]">
                  <ShieldCheck className="size-3.5" /> Google verificado
                </span>
              </div>
              <p className="text-xs text-[#52616a]">{user?.email || state.profile.email}</p>
              <p className="mt-0.5 text-[11px] text-[#7a8994]">
                Armazenamento privado sincronizado em nuvem · {state.profile.city} · {state.profile.state}
              </p>
            </div>
          </div>
        </section>

        {/* 5 Selectable Brand Logos */}
        <section className="rounded-xl border border-[#dce2e6] bg-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[#0c1928]">Identidade Visual & Logomarca (5 opções)</h2>
              <p className="mt-0.5 text-xs text-[#52616a]">
                Escolha a logomarca alinhada aos 5 critérios: conectividade, independência, inteligência,
                maturidade e agilidade. A alteração é aplicada imediatamente em todo o sistema.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {BRAND_LOGOS.map((logo) => {
              const selected = state.profile.selectedLogoId === logo.id;
              return (
                <button
                  key={logo.id}
                  type="button"
                  onClick={() => void handleSelectLogo(logo.id)}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? "border-[#173d4a] bg-[#f2f6f7] ring-1 ring-[#173d4a]"
                      : "border-[#dce2e6] bg-white hover:bg-[#f7f8fa]"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="grid size-12 place-items-center rounded-xl bg-[#0c1928]">
                      <BrandMark logoId={logo.id} tone="light" className="size-8" />
                    </div>
                    {selected && (
                      <span className="grid size-6 place-items-center rounded-full bg-[#173d4a] text-white">
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-sm font-bold text-[#0c1928]">{logo.name}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#b99555]">
                    {logo.pillarFocus}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#52616a]">{logo.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={(e) => void handleSaveProfile(e)}
            className="space-y-4 rounded-xl border border-[#dce2e6] bg-white p-6"
          >
            <h2 className="text-lg font-semibold text-[#0c1928]">Titular & Recebedor Pix</h2>
            <p className="text-xs text-[#52616a]">
              Estes dados são gravados nas faturas PDF e no código Pix copia e cola quando você emite cobranças.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Nome completo</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Chave Pix</label>
                <input
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="CPF, CNPJ, e-mail ou chave aleatória"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">
                  Nome do recebedor Pix
                </label>
                <input
                  value={pixName}
                  onChange={(e) => setPixName(e.target.value)}
                  placeholder="Nome exibido no QR Code"
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">UF</label>
                <select
                  value={pixState}
                  onChange={(e) => {
                    const nextUf = e.target.value;
                    setPixState(nextUf);
                    const firstCity = municipalities[nextUf]?.[0] ?? "";
                    setPixCity(firstCity);
                  }}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm"
                >
                  {BRAZIL_STATES.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">
                  Município ({citiesForState.length} opções)
                </label>
                <select
                  value={pixCity}
                  onChange={(e) => setPixCity(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[#cbd3d8] bg-white px-2.5 text-sm"
                >
                  {citiesForState.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#173d4a] px-4 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              <Save className="size-4" /> Salvar alterações
            </button>
          </form>

          <section className="space-y-4 rounded-xl border border-[#dce2e6] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#0c1928]">Backup & Privacidade dos Dados</h2>
            <p className="text-xs text-[#52616a]">
              Seus registros financeiros, agenda, compras e veículos são salvos em tempo real na sua
              conta protegida. Exporte um backup JSON ou limpe seus registros quando precisar.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dce2e6] bg-white px-4 text-xs font-semibold hover:bg-[#f0f3f5]"
              >
                <Download className="size-4" /> Exportar backup JSON
              </button>

              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#dce2e6] bg-white px-4 text-xs font-semibold hover:bg-[#f0f3f5]">
                <Upload className="size-4" /> Importar JSON
                <input type="file" accept="application/json" onChange={handleImport} className="hidden" />
              </label>

              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 text-xs font-semibold text-[#dc2626] hover:bg-[#fee2e2]"
                >
                  <Trash2 className="size-4" /> Limpar meus registros
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-1.5">
                  <span className="text-xs font-semibold text-[#dc2626]">Confirmar limpeza?</span>
                  <button
                    type="button"
                    onClick={() => void handleClearAll()}
                    className="rounded bg-[#dc2626] px-2.5 py-1 text-xs font-semibold text-white"
                  >
                    Apagar tudo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded border border-[#dce2e6] bg-white px-2.5 py-1 text-xs font-semibold text-[#52616a]"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        <OrionImportPanel />
      </div>
    </AppShell>
  );
}
