import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Plus, Save, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useOrion } from "@/store/orionContext";
import { db } from "@/lib/firebase";
import { additionalForecastByMonth, annualCommitmentsByMonth, annualSettlementByMonth, budgetBalance } from "@/lib/domain/budgetCalculations";

type Category = { id: string; name: string; parentId: string | null };
type BudgetRow = { id: string; title: string; categoryId: string; months: (number | null)[]; sourceAnnualId: string | null };
type Goal = { id: string; title: string; kind: string; targetCents: number; savedCents: number; targetDate: string; contributions: number[] };
type BudgetDoc = { categories: Category[]; rows: BudgetRow[]; goals: Goal[] };
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DEFAULT_CATEGORIES = ["Moradia", "Transporte", "Veículos", "Alimentação", "Saúde", "Educação", "Vestuário", "Lazer", "Família", "Patrimônio", "Investimentos", "Imprevistos"];
const uid = () => crypto.randomUUID();
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fromReais = (raw: string) => {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
const emptyMonths = () => Array<number | null>(12).fill(null);
const emptyDoc = (): BudgetDoc => ({
  categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: `default-${i}`, name, parentId: null })),
  rows: [],
  goals: [],
});
const normalize = (raw: Record<string, unknown>): BudgetDoc => ({
  categories: Array.isArray(raw.categories) ? raw.categories as Category[] : emptyDoc().categories,
  rows: Array.isArray(raw.rows) ? (raw.rows as BudgetRow[]).map(r => ({ ...r, months: Array.from({length: 12}, (_, i) => typeof r.months?.[i] === "number" ? r.months[i] : null) })) : [],
  goals: Array.isArray(raw.goals) ? (raw.goals as Goal[]).map(g => ({ ...g, contributions: Array.from({length: 12}, (_, i) => Number(g.contributions?.[i] || 0)) })) : [],
});
export function OrcamentoPage() {
  const { user, state } = useOrion();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<BudgetDoc>(emptyDoc);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"annual" | "goals">("annual");
  const [categoryName, setCategoryName] = useState("");
  const [parentId, setParentId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalType, setGoalType] = useState("Viagem");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalSaved, setGoalSaved] = useState("");
  const [goalDate, setGoalDate] = useState(`${new Date().getFullYear() + 1}-12-31`);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setDirty(false);
    setData(emptyDoc());
    const ref = doc(db, "users", user.uid, "budgetYears", String(year));
    return onSnapshot(ref, snap => {
      setData(snap.exists() ? normalize(snap.data()) : emptyDoc());
      setDirty(false);
      setLoading(false);
    }, error => {
      toast.error("Não foi possível carregar o orçamento: " + error.message);
      setLoading(false);
    });
  }, [user, year]);

  const change = (fn: (v: BudgetDoc) => BudgetDoc) => {
    setData(fn);
    setDirty(true);
  };
  const persist = async () => {
    if (!user || saving || !dirty) return;
    if (data.rows.some(r => r.months.length !== 12 || r.months.some(x => x !== null && (!Number.isSafeInteger(x) || x < 0)))) {
      toast.error("Há valores mensais inválidos.");
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, "users", user.uid, "budgetYears", String(year));
      const payload = { categories: data.categories, rows: data.rows, goals: data.goals, updatedAt: serverTimestamp() };
      // Only new budget data is written. Existing annual expenses and payments are read-only here.
      const existing = await getDoc(ref);
      if (existing.exists()) await updateDoc(ref, payload);
      else await setDoc(ref, { ownerId: user.uid, year, createdAt: serverTimestamp(), ...payload });
      setDirty(false);
      toast.success("Previsão anual e metas salvas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar orçamento.");
    } finally {
      setSaving(false);
    }
  };
  const annualRows = useMemo(() => state.annualExpenses.filter(r => r.year === year), [state.annualExpenses, year]);
  const obligations = useMemo(() => annualCommitmentsByMonth(annualRows), [annualRows]);
  const settlement = useMemo(() => annualSettlementByMonth(annualRows), [annualRows]);
  const reconciliation = useMemo(() => additionalForecastByMonth(data.rows, annualRows), [data.rows, annualRows]);
  const expenses = reconciliation.values;
  const goals = useMemo(() => MONTHS.map((_, i) => data.goals.reduce((sum, g) => sum + (g.contributions[i] || 0), 0)), [data.goals]);
  const revenue = useMemo(() => MONTHS.map((_, i) => {
    const period = `${year}-${String(i + 1).padStart(2,"0")}`;
    const entries = state.revenueEntries.filter(e => e.dueDate.startsWith(period));
    const fromEntries = entries.reduce((sum, e) => sum + Math.max(0, e.receivedCents ?? e.expectedCents), 0);
    const sourceIds = new Set(entries.map(e => e.sourceId).filter(Boolean));
    const fromSources = state.revenueSources.filter(s => s.active && !sourceIds.has(s.id) && (
      s.recurrence === "monthly" ? (!s.firstDue || s.firstDue.slice(0,7) <= period) : s.firstDue?.slice(0,7) === period
    )).reduce((sum, s) => sum + Math.max(0, s.expectedCents), 0);
    return fromEntries + fromSources;
  }), [state.revenueEntries, state.revenueSources, year]);
  const total = (arr: number[]) => arr.reduce((a,b) => a+b, 0);
  const saldo = budgetBalance(revenue, obligations, expenses, goals);
  const fieldClass = "w-full min-w-0 rounded-lg border border-[#dce2e6] bg-white px-2.5 py-2 text-sm text-[#0c1928] dark:border-[#294359] dark:bg-[#102336] dark:text-white";
  const btn = "rounded-lg bg-[#173d4a] px-3 py-2 text-sm font-medium text-white hover:bg-[#245768] disabled:opacity-50";
  const card = "rounded-xl border border-[#dce2e6] bg-white p-4 dark:border-[#294359] dark:bg-[#102336]";
  const categoryNameOf = (id: string) => data.categories.find(c => c.id === id)?.name ?? "Sem categoria";
  return <AppShell title="Planejamento Orçamentário" subtitle="Previsão familiar, obrigações e metas" actions={<button className={btn} disabled={!dirty || loading || saving} onClick={() => void persist()}><Save className="mr-1 inline size-4" />{saving ? "Salvando..." : dirty ? "Salvar alterações" : "Salvo"}</button>}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">Ano <select className={fieldClass} value={year} onChange={e => { if (dirty && !window.confirm("Descartar alterações ainda não salvas?")) return; setYear(Number(e.target.value)); }}>{Array.from({length: 12}, (_,i) => 2025+i).map(y => <option key={y} value={y}>{y}</option>)}</select></label>
        <div className="flex gap-2"><button className={btn} onClick={() => setTab("annual")}>Tabela anual</button><button className={btn} onClick={() => setTab("goals")}>Metas</button></div>
      </div>
      {loading ? <p>Carregando orçamento...</p> : <>
        <div className="grid gap-3 md:grid-cols-4">
          {([["Receitas previstas",total(revenue)],["Despesas Anuais",total(obligations)],["Novas provisões",total(expenses)],["Metas e reservas",total(goals)]] as [string,number][]).map(([label,value]) => <div key={label} className={card}><p className="text-xs text-[#63717d] dark:text-slate-400">{label}</p><strong className="mt-2 block text-lg">{money(value)}</strong></div>)}
        </div>
        {(reconciliation.invalidLinks.length > 0 || reconciliation.repeatedLinks.length > 0) && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Atenção à conciliação: {reconciliation.invalidLinks.length} previsão(ões) com vínculo que não existe neste ano e {reconciliation.repeatedLinks.length} compromisso(s) vinculado(s) a múltiplas previsões. Revise os vínculos antes de confiar no saldo projetado.
        </div>}
        {saldo.some(value => value < 0) && <div role="status" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Há déficit previsto em {saldo.filter(value => value < 0).length} mês(es). Necessidade total de ajuste nos meses negativos: {money(saldo.reduce((sum, value) => sum + Math.max(0, -value), 0))}. O saldo anual positivo não elimina déficits mensais.
        </div>}
        <div className={card}><p className="text-xs text-[#63717d] dark:text-slate-400">Saldo projetado do ano, após metas</p><strong className={`text-xl ${total(saldo)<0?"text-red-600":"text-emerald-700 dark:text-emerald-300"}`}>{money(total(saldo))}</strong><p className="mt-1 text-xs text-[#63717d]">Receita prevista − despesas anuais − previsões adicionais − aportes. Valores de reservas não são pagamentos realizados.</p></div>
        {tab === "annual" ? <>
          <section className={card}><h2 className="mb-3 font-semibold">Adicionar categoria ou subcategoria</h2>
            <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
              <input className={fieldClass} placeholder="Nome da categoria" value={categoryName} onChange={e=>setCategoryName(e.target.value)} maxLength={80}/>
              <select className={fieldClass} value={parentId} onChange={e=>setParentId(e.target.value)}><option value="">Categoria principal</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <button className={btn} onClick={()=>{if(!categoryName.trim())return;change(v=>({...v,categories:[...v.categories,{id:uid(),name:categoryName.trim(),parentId:parentId||null}]}));setCategoryName("");setParentId("");}}><Plus className="mr-1 inline size-4"/>Adicionar</button>
            </div>
          </section>
          <section className={card}><h2 className="mb-3 font-semibold">Nova previsão</h2>
            <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
              <input className={fieldClass} placeholder="Ex.: cinema, revisão do veículo, supermercado" maxLength={100} value={newTitle} onChange={e=>setNewTitle(e.target.value)}/>
              <select className={fieldClass} value={newCategoryId} onChange={e=>setNewCategoryId(e.target.value)}><option value="">Selecione a categoria</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.parentId ? "↳ " : ""}{c.name}</option>)}</select>
              <button className={btn} onClick={()=>{if(!newTitle.trim()||!newCategoryId)return toast.error("Informe título e categoria.");change(v=>({...v,rows:[...v.rows,{id:uid(),title:newTitle.trim(),categoryId:newCategoryId,months:emptyMonths(),sourceAnnualId:null}]}));setNewTitle("");}}><Plus className="mr-1 inline size-4"/>Adicionar</button>
            </div>
          </section>
          <section className={card}>
            <h2 className="font-semibold">Previsão por mês — {year}</h2>
            <p className="mb-3 text-xs text-[#63717d]">Deixe um mês vazio quando não houver previsão. Valores em reais; o total é calculado automaticamente. Vincule um compromisso de Despesas Anuais para confrontar, sem duplicar.</p>
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] w-full border-collapse text-xs">
                <thead><tr className="border-b dark:border-slate-700"><th className="sticky left-0 z-10 bg-white p-2 text-left dark:bg-[#102336]">Categoria / item</th>{MONTHS.map(m=><th key={m} className="p-2 text-right">{m}</th>)}<th className="p-2 text-right">Total</th><th className="p-2">Vínculo</th><th className="p-2">Ações</th></tr></thead>
                <tbody>{data.rows.map(row => <tr key={row.id} className="border-b dark:border-slate-700">
                  <td className="sticky left-0 bg-white p-2 dark:bg-[#102336]"><div className="font-medium">{row.title}</div><div className="text-[11px] text-[#63717d]">{categoryNameOf(row.categoryId)}</div></td>
                  {row.months.map((c,i) => <td key={i} className="p-1"><input aria-label={`${row.title}, ${MONTHS[i]}`} className="w-[80px] rounded-md border border-slate-200 bg-transparent p-1.5 text-right dark:border-slate-600" type="number" min="0" step=".01" placeholder="—" value={c === null ? "" : String(c/100)} onChange={e=>change(v=>({...v,rows:v.rows.map(r=>r.id===row.id?{...r,months:r.months.map((x,j)=>j===i?(e.target.value===""?null:fromReais(e.target.value)):x)}:r)}))}/></td>)}
                  <td className="p-2 text-right font-semibold">{money(total(row.months.map(x=>x??0)))}</td>
                  <td className="p-1"><select aria-label="Vincular obrigação já existente" className="max-w-[170px] rounded border bg-transparent p-1 dark:border-slate-600" value={row.sourceAnnualId??""} onChange={e=>change(v=>({...v,rows:v.rows.map(r=>r.id===row.id?{...r,sourceAnnualId:e.target.value||null}:r)}))}><option value="">Nova provisão</option>{annualRows.map(a=><option key={a.id} value={a.id}>{a.creditor}</option>)}</select></td>
                  <td className="p-1"><button title="Excluir previsão" aria-label="Excluir previsão" onClick={()=>{if(window.confirm("Excluir esta previsão?"))change(v=>({...v,rows:v.rows.filter(r=>r.id!==row.id)}));}}><Trash2 className="size-4 text-red-600"/></button></td>
                </tr>)}
                {([["Receitas",revenue],["Despesas Anuais",obligations],["Provisões adicionais",expenses],["Metas / reservas",goals],["Saldo projetado",saldo]] as [string,number[]][]).map(([label,arr])=><tr key={label} className="border-b bg-[#edf1f3] font-semibold dark:border-slate-700 dark:bg-[#173d4a]"><td className="sticky left-0 bg-[#edf1f3] p-2 dark:bg-[#173d4a]">{label}</td>{arr.map((v,i)=><td key={i} className="p-2 text-right">{money(v)}</td>)}<td className="p-2 text-right">{money(total(arr))}</td><td colSpan={2}/></tr>)}
                </tbody>
              </table>
              {data.rows.length===0&&<p className="p-4 text-center text-sm text-[#63717d]">Nenhuma previsão cadastrada. Adicione o primeiro item acima.</p>}
            </div>
          </section>
        </> : <>
          <section className={card}><h2 className="mb-3 flex items-center gap-2 font-semibold"><Target className="size-5"/>Nova meta</h2>
            <div className="grid gap-2 md:grid-cols-3">
              <input className={fieldClass} placeholder="Ex.: viagem de férias" value={goalTitle} onChange={e=>setGoalTitle(e.target.value)} maxLength={100}/>
              <select className={fieldClass} value={goalType} onChange={e=>setGoalType(e.target.value)}>{["Viagem","Compra","Investimento","Reserva","Reforma","Veículo","Educação","Outros"].map(k=><option key={k}>{k}</option>)}</select>
              <input className={fieldClass} type="number" min="0" step=".01" placeholder="Valor alvo (R$)" value={goalTarget} onChange={e=>setGoalTarget(e.target.value)}/>
              <input className={fieldClass} type="number" min="0" step=".01" placeholder="Já reservado (R$)" value={goalSaved} onChange={e=>setGoalSaved(e.target.value)}/>
              <input className={fieldClass} type="date" value={goalDate} onChange={e=>setGoalDate(e.target.value)}/>
              <button className={btn} onClick={()=>{const target=fromReais(goalTarget);if(!goalTitle.trim()||target<=0||!goalDate)return toast.error("Preencha título, valor e prazo.");change(v=>({...v,goals:[...v.goals,{id:uid(),title:goalTitle.trim(),kind:goalType,targetCents:target,savedCents:fromReais(goalSaved),targetDate:goalDate,contributions:Array(12).fill(0)}]}));setGoalTitle("");setGoalTarget("");setGoalSaved("");}}>Criar meta</button>
            </div>
          </section>
          {data.goals.map(g => <section key={g.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{g.title}</h3><p className="text-xs text-[#63717d]">{g.kind} · até {g.targetDate}</p></div><button aria-label="Excluir meta" onClick={()=>{if(window.confirm("Excluir esta meta?"))change(v=>({...v,goals:v.goals.filter(x=>x.id!==g.id)}));}}><Trash2 className="size-4 text-red-600"/></button></div>
            <p className="mt-2 text-sm">Objetivo: <strong>{money(g.targetCents)}</strong> · Já reservado: {money(g.savedCents)} · Falta reservar: {money(Math.max(0,g.targetCents-g.savedCents))} · Aportes planejados: {money(total(g.contributions))}</p>
            <div className="my-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-[#B99555]" style={{width:`${Math.min(100,100*g.savedCents/g.targetCents)}%`}}/></div>
            <p className="mb-2 text-xs text-[#63717d]">Aportes programados no ano (R$). Planejamento não comprova depósito ou investimento efetivo.</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-12">{MONTHS.map((m,i)=><label key={m} className="text-xs">{m}<input className={fieldClass} type="number" min="0" step=".01" value={g.contributions[i]?String(g.contributions[i]/100):""} placeholder="—" onChange={e=>change(v=>({...v,goals:v.goals.map(x=>x.id===g.id?{...x,contributions:x.contributions.map((a,j)=>j===i?fromReais(e.target.value):a)}:x)}))}/></label>)}</div>
          </section>)}
          {data.goals.length===0&&<p className="text-sm text-[#63717d]">Nenhuma meta cadastrada neste ano.</p>}
        </>}
        {dirty&&<p className="text-sm font-medium text-amber-700 dark:text-amber-300">Há alterações não salvas. Clique em Salvar alterações.</p>}
      </>}
    </div>
  </AppShell>;
}
