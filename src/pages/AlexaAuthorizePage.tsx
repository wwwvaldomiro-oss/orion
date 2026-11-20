import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Mic2, Ban, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useOrion } from "@/store/orionContext";

export function AlexaAuthorizePage() {
  const { user } = useOrion();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [linked, setLinked] = useState<boolean | null>(null);
  const valid = ["client_id", "redirect_uri", "state", "code_challenge"].every(k => !!params.get(k));

  useEffect(() => {
    if (!user) return;
    void auth.currentUser?.getIdToken().then(token =>
      fetch("/api/alexa/status", { headers: { Authorization: `Bearer ${token}` } })
    ).then(async resp => {
      if (resp?.ok) setLinked(Boolean((await resp.json()).linked));
    }).catch(() => {});
  }, [user]);

  async function approve() {
    setWorking(true); setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Faça login com sua conta Google verificada.");
      const response = await fetch("/api/alexa/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          client_id: params.get("client_id"),
          redirect_uri: params.get("redirect_uri"),
          state: params.get("state"),
          code_challenge: params.get("code_challenge"),
          approve: true
        })
      });
      if (!response.ok) throw new Error("Não foi possível autorizar. Confira a configuração Amazon Alexa.");
      const data = await response.json() as { redirect: string };
      // Server validates exact Amazon callback URI against the configured allowlist.
      window.location.assign(data.redirect);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na autorização."); setWorking(false); }
  }
  async function disconnect() {
    setWorking(true); setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/alexa/disconnect", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Falha ao desconectar.");
      setLinked(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao desconectar."); }
    setWorking(false);
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4 py-10 text-[#0c1928]">
      <section className="w-full max-w-md rounded-2xl border border-[#dce2e6] bg-white p-7 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-[#173d4a] text-white"><Mic2 className="size-6" /></span>
          <div><h1 className="text-xl font-bold">Órion + Amazon Alexa</h1><p className="text-sm text-[#52616a]">Integração e autorização segura</p></div>
        </div>
        <p className="text-sm leading-relaxed text-[#52616a]">
          Conecte sua conta Órion para consultar contas, compromissos e lista de compras pela Alexa,
          além de adicionar produtos à sua lista. Pagamentos e transferências não são permitidos.
        </p>
        <div className="my-5 rounded-lg bg-[#f2f6f7] p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" /> Conta protegida</p>
          <p className="mt-1 break-words text-xs text-[#52616a]">{user?.email || "Entre com sua conta Google verificada"}</p>
        </div>
        {!valid && <p className="mb-3 text-sm text-[#52616a]">Abra a integração pelo aplicativo Alexa para iniciar a vinculação.</p>}
        {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
        {valid && <button type="button" disabled={!user || working} onClick={() => void approve()} className="w-full rounded-lg bg-[#173d4a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {working ? "Autorizando..." : "Autorizar acesso à Alexa"}
        </button>}
        {linked && <button type="button" disabled={working} onClick={() => void disconnect()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 p-3 text-sm font-medium text-red-700">
          <Ban className="size-4" /> Revogar conexão
        </button>}
        {linked === false && <p className="mt-3 flex items-center gap-2 text-xs text-[#52616a]"><CheckCircle2 className="size-4" /> Nenhuma conexão ativa.</p>}
        <a href="/perfil" className="mt-5 block text-center text-sm text-[#52616a] underline">Voltar às configurações</a>
      </section>
    </main>
  );
}
