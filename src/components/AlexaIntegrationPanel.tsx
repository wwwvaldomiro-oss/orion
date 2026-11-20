import { useEffect, useState } from "react";
import { Mic2, ShieldCheck, Unplug } from "lucide-react";
import { auth } from "@/lib/firebase";

export function AlexaIntegrationPanel() {
  const [status, setStatus] = useState<"checking" | "linked" | "unlinked" | "unconfigured" | "error">("checking");
  const [working, setWorking] = useState(false);
  async function load() {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return setStatus("error");
      const response = await fetch("/api/alexa/status", { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 503) return setStatus("unconfigured");
      if (!response.ok) return setStatus("error");
      const data = await response.json();
      setStatus(data.linked ? "linked" : "unlinked");
    } catch { setStatus("error"); }
  }
  useEffect(() => { void load(); }, []);
  async function disconnect() {
    setWorking(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/alexa/disconnect", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Não foi possível desconectar.");
      setStatus("unlinked");
    } catch { setStatus("error"); }
    setWorking(false);
  }
  return <section className="rounded-xl border border-[#dce2e6] bg-white p-6">
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-lg bg-[#173d4a] text-white"><Mic2 className="size-5" /></span>
      <div>
        <h2 className="text-lg font-semibold text-[#0c1928]">Amazon Alexa</h2>
        <p className="text-xs text-[#52616a]">Comandos de voz e acesso autorizado aos módulos Órion</p>
      </div>
    </div>
    <p className="mt-4 text-sm text-[#52616a]">
      {status === "linked" ? "Sua conta está conectada à Alexa." :
      status === "unlinked" ? "Conexão disponível. Ative a Skill Órion no aplicativo Alexa e vincule sua conta." :
      status === "unconfigured" ? "Integração aguardando credenciais Amazon e ativação no servidor." :
      status === "checking" ? "Verificando a integração..." : "Não foi possível verificar o status da integração."}
    </p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" onClick={() => void load()} className="rounded-lg border border-[#dce2e6] px-4 py-2 text-xs font-semibold text-[#173d4a]">Atualizar status</button>
      {status === "linked" && <button type="button" disabled={working} onClick={() => void disconnect()} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"><Unplug className="size-4" /> Desconectar Alexa</button>}
    </div>
    <p className="mt-4 flex items-center gap-2 text-xs text-[#52616a]"><ShieldCheck className="size-4" /> A Alexa não recebe autorização para pagamentos, transferências ou exclusão de dados.</p>
  </section>;
}
