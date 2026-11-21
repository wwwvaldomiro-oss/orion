import { useCallback, useEffect, useState } from "react";
import { Calculator, Check, Copy, Delete, History, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  evaluateMathExpression,
  formatCalculatorResult,
  isTypingInFormControl,
  type AngleUnit,
} from "@/lib/domain/calculator";
import { useOrion } from "@/store/orionContext";

export function CalculatorHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, addCalculatorHistory, clearCalculatorHistory } = useOrion();
  const [mode, setMode] = useState<"normal" | "scientific">("normal");
  const [angleUnit, setAngleUnit] = useState<AngleUnit>("DEG");
  const [expr, setExpr] = useState("");
  const [resultDisplay, setResultDisplay] = useState("0");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const appendToken = useCallback((token: string) => {
    setErrorMsg(null);
    setExpr((prev) => prev + token);
  }, []);

  const clearAll = useCallback(() => {
    setExpr("");
    setResultDisplay("0");
    setErrorMsg(null);
  }, []);

  const backspace = useCallback(() => {
    setErrorMsg(null);
    setExpr((prev) => prev.slice(0, -1));
  }, []);

  const toggleSign = useCallback(() => {
    setErrorMsg(null);
    setExpr((prev) => {
      if (!prev) return "-";
      if (prev.startsWith("-(") && prev.endsWith(")")) return prev.slice(2, -1);
      if (prev.startsWith("-")) return prev.slice(1);
      return `-(${prev})`;
    });
  }, []);

  const evaluate = useCallback(async () => {
    const raw = expr.trim();
    if (!raw) return;
    try {
      const value = evaluateMathExpression(raw, angleUnit);
      const formatted = formatCalculatorResult(value);
      setResultDisplay(formatted);
      setErrorMsg(null);
      await addCalculatorHistory({
        expression: raw,
        result: formatted,
        mode,
        angleUnit,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro na expressão.");
    }
  }, [addCalculatorHistory, angleUnit, expr, mode]);

  // Physical keyboard support strictly guarded against active form controls
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingInFormControl(e.target)) return;

      const k = e.key;
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        appendToken(k);
        return;
      }
      if (k === "+" || k === "-" || k === "*" || k === "/" || k === "(" || k === ")" || k === "^" || k === "%") {
        e.preventDefault();
        appendToken(k === "*" ? "×" : k === "/" ? "÷" : k);
        return;
      }
      if (k === "." || k === ",") {
        e.preventDefault();
        appendToken(",");
        return;
      }
      if (k === "Enter" || k === "=") {
        e.preventDefault();
        void evaluate();
        return;
      }
      if (k === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (k === "Delete") {
        e.preventDefault();
        clearAll();
        return;
      }
      if (k === "Escape") {
        e.preventDefault();
        if (expr) clearAll();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appendToken, backspace, clearAll, evaluate, expr, onClose, open]);

  if (!open) return null;

  const sciButtons: Array<{ label: string; token: string; title: string }> = [
    { label: "(", token: "(", title: "Abre parênteses" },
    { label: ")", token: ")", title: "Fecha parênteses" },
    { label: "xʸ", token: "^", title: "Potência" },
    { label: "√", token: "sqrt(", title: "Raiz quadrada" },
    { label: "n!", token: "!", title: "Fatorial" },
    { label: "sen", token: "sin(", title: "Seno" },
    { label: "cos", token: "cos(", title: "Cosseno" },
    { label: "tan", token: "tan(", title: "Tangente" },
    { label: "ln", token: "ln(", title: "Logaritmo natural" },
    { label: "log", token: "log(", title: "Logaritmo base 10" },
    { label: "π", token: "π", title: "Constante Pi" },
    { label: "e", token: "e", title: "Constante de Euler" },
    { label: "x²", token: "^2", title: "Ao quadrado" },
    { label: "³√", token: "cbrt(", title: "Raiz cúbica" },
    { label: "|x|", token: "abs(", title: "Valor absoluto" },
  ];

  const baseKeys: Array<{ label: string; action: () => void; style?: string }> = [
    { label: "C", action: clearAll, style: "text-[#dc2626] dark:text-red-300" },
    { label: "±", action: toggleSign },
    { label: "%", action: () => appendToken("%") },
    { label: "÷", action: () => appendToken("÷"), style: "text-[#173d4a] dark:text-[#b99555] font-bold" },
    { label: "7", action: () => appendToken("7") },
    { label: "8", action: () => appendToken("8") },
    { label: "9", action: () => appendToken("9") },
    { label: "×", action: () => appendToken("×"), style: "text-[#173d4a] dark:text-[#b99555] font-bold" },
    { label: "4", action: () => appendToken("4") },
    { label: "5", action: () => appendToken("5") },
    { label: "6", action: () => appendToken("6") },
    { label: "−", action: () => appendToken("-"), style: "text-[#173d4a] dark:text-[#b99555] font-bold" },
    { label: "1", action: () => appendToken("1") },
    { label: "2", action: () => appendToken("2") },
    { label: "3", action: () => appendToken("3") },
    { label: "+", action: () => appendToken("+"), style: "text-[#173d4a] dark:text-[#b99555] font-bold" },
    { label: "0", action: () => appendToken("0") },
    { label: ",", action: () => appendToken(",") },
    { label: "⌫", action: backspace },
    {
      label: "=",
      action: () => void evaluate(),
      style: "bg-[#173d4a] text-white hover:bg-[#0c1928] border-[#173d4a]",
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="calculator-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1928]/60 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#dce2e6] bg-white shadow-2xl dark:border-[#233c53] dark:bg-[#0e1e2e] dark:text-slate-100">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce2e6] px-5 py-4 dark:border-[#233c53]">
          <div className="flex items-center gap-2.5">
            <Calculator className="size-5 text-[#173d4a] dark:text-[#b99555]" />
            <h2 id="calculator-modal-title" className="text-lg font-semibold">
              Calculadora & Histórico
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#dce2e6] p-0.5 text-xs dark:border-[#2b4761]">
              <button
                type="button"
                onClick={() => setMode("normal")}
                className={`rounded-md px-3 py-1 font-semibold ${
                  mode === "normal"
                    ? "bg-[#173d4a] text-white"
                    : "text-[#52616a] dark:text-slate-300"
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setMode("scientific")}
                className={`rounded-md px-3 py-1 font-semibold ${
                  mode === "scientific"
                    ? "bg-[#173d4a] text-white"
                    : "text-[#52616a] dark:text-slate-300"
                }`}
              >
                Científica
              </button>
            </div>

            {mode === "scientific" && (
              <button
                type="button"
                onClick={() => setAngleUnit((u) => (u === "DEG" ? "RAD" : "DEG"))}
                title="Alternar Graus (DEG) e Radianos (RAD)"
                className="h-8 rounded-lg border border-[#b99555] bg-[#faf7f0] px-2.5 font-mono text-xs font-bold text-[#0c1928] dark:bg-[#152b3f] dark:text-amber-200"
              >
                {angleUnit}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-8 place-items-center rounded-lg text-[#52616a] hover:bg-[#f0f3f5] dark:text-slate-300"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Side-by-side desktop, stacked mobile */}
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
          {/* Left: Calculator Keypad + Display */}
          <div className="flex flex-col justify-between border-b border-[#dce2e6] p-5 md:border-r md:border-b-0 dark:border-[#233c53]">
            <div className="rounded-xl border border-[#dce2e6] bg-[#f7f8fa] p-4 dark:border-[#233c53] dark:bg-[#132537]">
              <input
                value={expr}
                onChange={(e) => {
                  setErrorMsg(null);
                  setExpr(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void evaluate();
                  }
                }}
                aria-label="Expressão matemática"
                placeholder="Digite pelo teclado ou botões..."
                className="tabular-nums w-full bg-transparent text-right font-mono text-sm text-[#52616a] outline-none dark:text-slate-300"
              />
              <div className="tabular-nums mt-2 truncate text-right font-mono text-3xl font-bold text-[#0c1928] dark:text-white">
                {resultDisplay}
              </div>
              {errorMsg && (
                <div className="mt-2 text-right text-xs font-semibold text-[#dc2626] dark:text-red-300">
                  {errorMsg}
                </div>
              )}
            </div>

            {mode === "scientific" && (
              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {sciButtons.map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    title={btn.title}
                    onClick={() => appendToken(btn.token)}
                    className="h-9 rounded-lg border border-[#dce2e6] bg-[#f7f8fa] font-mono text-xs font-semibold text-[#173d4a] hover:bg-[#edf1f3] dark:border-[#2b4761] dark:bg-[#132537] dark:text-[#b99555]"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 grid grid-cols-4 gap-2">
              {baseKeys.map((key) => (
                <button
                  key={key.label}
                  type="button"
                  onClick={key.action}
                  aria-label={key.label === "⌫" ? "Apagar último caractere" : key.label}
                  className={`tabular-nums flex h-11 items-center justify-center rounded-lg border border-[#dce2e6] bg-white font-mono text-base font-semibold transition-colors hover:bg-[#f0f3f5] dark:border-[#2b4761] dark:bg-[#132537] dark:hover:bg-[#183148] ${
                    key.style ?? "text-[#0c1928] dark:text-white"
                  }`}
                >
                  {key.label === "⌫" ? <Delete className="size-4" /> : key.label}
                </button>
              ))}
            </div>

            <p className="mt-2 text-[11px] text-[#52616a] dark:text-slate-400">
              Suporta teclado físico (0–9, +, −, ×, ÷, vírgula, parênteses, Enter, Backspace e Delete).
            </p>
          </div>

          {/* Right: Persistent History */}
          <div className="flex min-h-64 flex-col overflow-hidden bg-[#f7f8fa]/70 dark:bg-[#0c1a29]">
            <div className="flex items-center justify-between border-b border-[#dce2e6] px-5 py-3 dark:border-[#233c53]">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <History className="size-4 text-[#173d4a] dark:text-[#b99555]" />
                <span>Histórico ({state.calculatorHistory.length})</span>
              </div>
              {state.calculatorHistory.length > 0 &&
                (confirmClear ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="rounded border border-[#dce2e6] bg-white px-2 py-1 text-[11px] font-semibold dark:border-[#2b4761] dark:bg-[#132537]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await clearCalculatorHistory();
                        setConfirmClear(false);
                        toast.success("Histórico limpo.");
                      }}
                      className="inline-flex items-center gap-1 rounded bg-[#dc2626] px-2 py-1 text-[11px] font-semibold text-white"
                    >
                      <Check className="size-3" /> Limpar tudo
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#dc2626] hover:underline"
                  >
                    <Trash2 className="size-3.5" /> Limpar histórico
                  </button>
                ))}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {state.calculatorHistory.length === 0 ? (
                <p className="py-12 text-center text-xs text-[#52616a] dark:text-slate-400">
                  Nenhum cálculo registrado ainda.
                </p>
              ) : (
                state.calculatorHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#dce2e6] bg-white p-3 dark:border-[#233c53] dark:bg-[#0e1e2e]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setExpr(item.expression);
                        setResultDisplay(item.result);
                        setErrorMsg(null);
                      }}
                      title="Reutilizar esta expressão"
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="tabular-nums truncate font-mono text-xs text-[#52616a] dark:text-slate-400">
                        {item.expression} =
                      </div>
                      <div className="tabular-nums font-mono text-base font-bold text-[#0c1928] dark:text-white">
                        {item.result}
                      </div>
                      <div className="tabular-nums text-[10px] text-[#52616a] dark:text-slate-400">
                        {new Date(item.createdAtIso).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {item.mode === "scientific" ? `Científica (${item.angleUnit})` : "Normal"}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(item.result);
                        toast.success(`Resultado ${item.result} copiado.`);
                      }}
                      title="Copiar resultado"
                      aria-label="Copiar resultado"
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#dce2e6] text-[#52616a] hover:bg-[#f0f3f5] dark:border-[#2b4761] dark:text-slate-300"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
