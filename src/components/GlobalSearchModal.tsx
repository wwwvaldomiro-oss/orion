import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ReceiptText, Search, Wallet, X } from "lucide-react";
import { useOrion } from "@/store/orionContext";
import { formatBRL } from "@/lib/domain/money";
import {
  searchGlobalRecords,
  type GlobalSearchKind,
  type GlobalSearchResult,
  type GlobalSearchScope,
} from "@/lib/domain/globalSearch";

const SCOPE_OPTIONS: Array<{ value: GlobalSearchScope; label: string }> = [
  { value: "all", label: "Tudo" },
  { value: "transaction", label: "Transações" },
  { value: "fiscal_receipt", label: "Notas Fiscais" },
  { value: "agenda", label: "Agenda" },
];

function ResultIcon({ kind }: { kind: GlobalSearchKind }) {
  if (kind === "transaction") return <Wallet className="size-4 text-[#173d4a]" />;
  if (kind === "fiscal_receipt") return <ReceiptText className="size-4 text-[#b99555]" />;
  return <CalendarDays className="size-4 text-[#0d9488]" />;
}

export function GlobalSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state } = useOrion();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [queryText, setQueryText] = useState("");
  const [scope, setScope] = useState<GlobalSearchScope>("all");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(
    () => searchGlobalRecords(state, queryText, scope, 10),
    [state, queryText, scope],
  );

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [queryText, scope]);

  if (!open) return null;

  function handleSelect(item: GlobalSearchResult) {
    onClose();
    setQueryText("");
    navigate(item.to);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0,
      );
      return;
    }
    if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    }
  }

  return (
    <div
      className="no-print fixed inset-0 z-[120] flex items-start justify-center bg-[#0c1928]/60 p-4 pt-12 backdrop-blur-xs md:pt-20"
      role="dialog"
      aria-modal="true"
      aria-label="Busca global no Órion"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="flex max-h-[80dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#dce2e6] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#dce2e6] px-4 py-3">
          <Search className="size-4 shrink-0 text-[#52616a]" />
          <input
            ref={inputRef}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Pesquisar transações, notas fiscais, produtos ou itens da agenda..."
            className="min-w-0 flex-1 bg-transparent text-sm text-[#0c1928] outline-none placeholder:text-[#7c8b94]"
          />
          {queryText && (
            <button
              type="button"
              onClick={() => setQueryText("")}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[#52616a] hover:bg-[#edf1f3]"
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[#52616a] hover:bg-[#edf1f3]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#edf1f3] bg-[#f7f8fa] px-4 py-2">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setScope(opt.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                scope === opt.value
                  ? "bg-[#173d4a] text-white"
                  : "bg-white text-[#52616a] border border-[#dce2e6] hover:bg-[#edf1f3]"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto hidden text-[11px] text-[#52616a] sm:inline">
            Use ↑ ↓ para navegar · Enter para abrir · Esc para fechar
          </span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#edf1f3]">
          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-[#0c1928]">Nenhum resultado encontrado</p>
              <p className="mt-1 text-xs text-[#52616a]">
                Tente buscar por estabelecimento, descrição de transação, chave de nota, produto ou compromisso da agenda.
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const selected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelect(item)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    selected ? "bg-[#edf1f3]" : "hover:bg-[#f7f8fa]"
                  }`}
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#dce2e6] bg-white">
                    <ResultIcon kind={item.kind} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[#0c1928]">
                        {item.title}
                      </span>
                      <span className="shrink-0 rounded-md bg-white border border-[#dce2e6] px-1.5 py-0.5 text-[10px] font-semibold text-[#52616a]">
                        {item.badge}
                      </span>
                    </div>
                    <div className="truncate text-xs text-[#52616a]">
                      {item.subtitle}
                      {item.meta ? ` · ${item.meta}` : ""}
                    </div>
                  </div>
                  {item.amountCents !== undefined && (
                    <div
                      className={`tabular-nums shrink-0 text-xs font-bold ${
                        item.amountCents >= 0 ? "text-[#16a34a]" : "text-[#0c1928]"
                      }`}
                    >
                      {item.amountCents >= 0 ? "+ " : "− "}
                      {formatBRL(Math.abs(item.amountCents))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
