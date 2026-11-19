import { useMemo, useState } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useOrion } from "@/store/orionContext";
import { formatBRL, parseBRL } from "@/lib/domain/money";

export function ComprasPage() {
  const { state, addShoppingItem, toggleShoppingItem, removeShoppingItem } = useOrion();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Mercearia");
  const [qty, setQty] = useState("1");
  const [priceText, setPriceText] = useState("");

  // Financial simulator (compound interest / financing)
  const [principalText, setPrincipalText] = useState("10000,00");
  const [monthlyRate, setMonthlyRate] = useState("1.0");
  const [months, setMonths] = useState("12");

  const totals = useMemo(() => {
    return state.shoppingList.reduce(
      (acc, i) => {
        const line = i.quantity * i.unitPriceCents;
        return {
          total: acc.total + line,
          pending: acc.pending + (i.checked ? 0 : line),
          done: acc.done + (i.checked ? line : 0),
        };
      },
      { total: 0, pending: 0, done: 0 },
    );
  }, [state.shoppingList]);

  const simResult = useMemo(() => {
    const p = (parseBRL(principalText) ?? 0) / 100;
    const r = (Number(monthlyRate.replace(",", ".")) || 0) / 100;
    const n = Math.max(1, Math.min(360, Number(months) || 1));
    const compoundFuture = p * Math.pow(1 + r, n);
    const pmt = r > 0 ? (p * r) / (1 - Math.pow(1 + r, -n)) : p / n;
    return {
      futureCents: Math.round(compoundFuture * 100),
      pmtCents: Math.round(pmt * 100),
      totalPaidCents: Math.round(pmt * n * 100),
    };
  }, [principalText, monthlyRate, months]);

  function submitItem(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBRL(priceText) ?? 0;
    const q = Math.max(1, Number(qty) || 1);
    if (!name.trim()) {
      toast.error("Informe o nome do item.");
      return;
    }
    addShoppingItem({
      name: name.trim(),
      category,
      quantity: q,
      unitPriceCents: cents,
    });
    setName("");
    setPriceText("");
    setQty("1");
    toast.success("Item adicionado à lista.");
  }

  return (
    <AppShell
      title="Lista de Compras & Calculadora"
      subtitle="Planejamento de compras domésticas e simulação financeira rápida"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Shopping List */}
        <section className="space-y-4 rounded-xl border border-[#dce2e6] bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[#0c1928]">Lista de Compras</h2>
              <p className="tabular-nums text-xs text-[#52616a]">
                Total estimado: <b>{formatBRL(totals.total)}</b> · Pendente:{" "}
                <b>{formatBRL(totals.pending)}</b>
              </p>
            </div>
          </div>

          <form onSubmit={submitItem} className="grid gap-2 sm:grid-cols-5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item (ex.: Azeite, Café)"
              className="h-9 rounded-lg border border-[#cbd3d8] px-3 text-sm sm:col-span-2"
              required
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
            >
              {["Mercearia", "Hortifruti", "Açougue & Peixaria", "Limpeza", "Casa", "Outros"].map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ),
              )}
            </select>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                aria-label="Quantidade"
                className="tabular-nums h-9 w-16 rounded-lg border border-[#cbd3d8] px-2 text-sm"
              />
              <input
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder="R$ unit."
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-2.5 text-sm"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#173d4a] px-3 text-xs font-semibold text-white hover:bg-[#0c1928]"
            >
              <Plus className="size-3.5" /> Adicionar
            </button>
          </form>

          <div className="divide-y divide-[#edf1f3]">
            {state.shoppingList.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#52616a]">
                Sua lista de compras está vazia. Adicione um item acima.
              </p>
            ) : (
              state.shoppingList.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => void toggleShoppingItem(item.id)}
                      className="size-4 accent-[#16a34a]"
                    />
                    <div className="min-w-0">
                      <div
                        className={`truncate font-medium ${
                          item.checked ? "text-[#52616a] line-through" : "text-[#0c1928]"
                        }`}
                      >
                        {item.name}
                      </div>
                      <div className="tabular-nums text-xs text-[#52616a]">
                        {item.category} · {item.quantity}x {formatBRL(item.unitPriceCents)}
                      </div>
                    </div>
                  </label>

                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-semibold text-[#0c1928]">
                      {formatBRL(item.quantity * item.unitPriceCents)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeShoppingItem(item.id)}
                      aria-label={`Remover ${item.name}`}
                      className="text-[#52616a] hover:text-[#dc2626]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Financial Calculator */}
        <section className="rounded-xl border border-[#dce2e6] bg-white p-5">
          <div className="flex items-center gap-2">
            <Calculator className="size-4 text-[#173d4a]" />
            <h2 className="text-lg font-semibold text-[#0c1928]">Calculadora Financeira</h2>
          </div>
          <p className="mt-0.5 text-xs text-[#52616a]">
            Simule juros compostos e parcela Price em segundos
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#52616a]">
                Valor principal (R$)
              </label>
              <input
                value={principalText}
                onChange={(e) => setPrincipalText(e.target.value)}
                className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">
                  Taxa mensal (%)
                </label>
                <input
                  value={monthlyRate}
                  onChange={(e) => setMonthlyRate(e.target.value)}
                  className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#52616a]">Meses</label>
                <input
                  type="number"
                  min={1}
                  max={360}
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  className="tabular-nums h-9 w-full rounded-lg border border-[#cbd3d8] px-3 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-[#52616a]">Montante (Juros Compostos)</span>
                <b className="tabular-nums text-[#173d4a]">{formatBRL(simResult.futureCents)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#52616a]">Parcela Mensal (Tabela Price)</span>
                <b className="tabular-nums text-[#0c1928]">{formatBRL(simResult.pmtCents)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#52616a]">Total Financiado</span>
                <b className="tabular-nums text-[#0c1928]">{formatBRL(simResult.totalPaidCents)}</b>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
