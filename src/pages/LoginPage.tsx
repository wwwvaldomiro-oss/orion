import { useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BRAND_LOGOS } from "@/components/brandLogoSpecs";
import { BrandLogo, BrandMark } from "@/components/BrandLogos";
import { useOrion } from "@/store/orionContext";
import type { BrandLogoId } from "@/types/orion";

export function LoginPage() {
  const { signInWithGoogle } = useOrion();
  const [loading, setLoading] = useState(false);
  const [previewLogo, setPreviewLogo] = useState<BrandLogoId>("nexo");

  async function handleGoogleLogin() {
    setLoading(true);
    try {
      await signInWithGoogle();
      toast.success("Autenticação Google concluída.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao entrar com Google.";
      toast.error(
        msg.includes("popup-closed")
          ? "Janela de login fechada antes da conclusão."
          : "Não foi possível entrar com a conta Google. Verifique se popups estão permitidos.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-12">
      {/* Left Narrative Brand Panel */}
      <aside className="orion-sidebar flex flex-col justify-between p-8 text-white lg:col-span-6 lg:p-12">
        <div>
          <BrandLogo logoId={previewLogo} tone="light" />
          <div className="mt-10 max-w-lg">
            <h1 className="font-serif text-3xl leading-tight font-semibold text-white md:text-4xl">
              Gestão patrimonial e organização pessoal em tempo real.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#d8e0e5]">
              Sua base começa limpa e 100% privada na sua conta Google — sem dados fictícios, com
              cotações reais da B3, câmbio ao vivo e faturamento Pix integrado.
            </p>
          </div>
        </div>

        <div className="mt-10 space-y-3">
          <div className="text-[11px] font-semibold tracking-wider text-[#9eb2bd] uppercase">
            Pré-visualize as 5 opções de identidade visual
          </div>
          <div className="grid grid-cols-5 gap-2">
            {BRAND_LOGOS.map((logo) => {
              const active = previewLogo === logo.id;
              return (
                <button
                  key={logo.id}
                  type="button"
                  onClick={() => setPreviewLogo(logo.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-colors ${
                    active
                      ? "border-[#b99555] bg-white/12 text-white"
                      : "border-white/15 bg-white/5 text-[#d8e0e5] hover:bg-white/10"
                  }`}
                >
                  <BrandMark logoId={logo.id} tone="light" className="size-7" />
                  <span className="truncate text-[10px] font-semibold">
                    {logo.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[#9eb2bd]">
            <b className="text-white">
              {BRAND_LOGOS.find((l) => l.id === previewLogo)?.name}:
            </b>{" "}
            {BRAND_LOGOS.find((l) => l.id === previewLogo)?.pillarFocus}
          </p>
        </div>
      </aside>

      {/* Right Google Auth Card */}
      <main className="flex items-center justify-center bg-[#f7f8fa] p-6 lg:col-span-6 lg:p-12">
        <div className="w-full max-w-md rounded-2xl border border-[#dce2e6] bg-white p-8 shadow-sm">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-[#173d4a] uppercase">
            <ShieldCheck className="size-4 text-[#b99555]" /> Acesso Seguro em Nuvem
          </div>

          <h2 className="mt-3 font-serif text-2xl font-semibold text-[#0c1928]">
            Entrar ou criar conta
          </h2>
          <p className="mt-2 text-sm text-[#52616a]">
            Use sua conta Google para acessar ou criar seu espaço pessoal. Seus registros ficam
            isolados e sincronizados exclusivamente com o seu usuário.
          </p>

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleGoogleLogin()}
            className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#cbd3d8] bg-white px-4 text-sm font-semibold text-[#0c1928] shadow-xs transition-colors hover:bg-[#f0f3f5] disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{loading ? "Conectando ao Google..." : "Continuar com Google"}</span>
          </button>

          <div className="mt-6 rounded-xl border border-[#edf1f3] bg-[#f7f8fa] p-4 text-xs text-[#52616a]">
            <div className="flex items-center gap-1.5 font-semibold text-[#0c1928]">
              <Sparkles className="size-3.5 text-[#b99555]" /> Primeiro acesso automático
            </div>
            <p className="mt-1 leading-relaxed">
              Caso ainda não tenha conta no Órion, o login com Google cria seu perfil instantaneamente
              com dados zerados, prontos para você cadastrar suas informações reais.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
