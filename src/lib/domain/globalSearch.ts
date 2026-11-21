import { AGENDA_KINDS } from "@/lib/domain/agenda";
import { formatBRL, formatDateBR } from "@/lib/domain/money";
import { cleanName } from "@/lib/receiptAnalysis";
import type { OrionState } from "@/types/orion";

export type GlobalSearchKind = "transaction" | "fiscal_receipt" | "agenda";
export type GlobalSearchScope = "all" | GlobalSearchKind;

export type GlobalSearchResult = {
  id: string;
  kind: GlobalSearchKind;
  title: string;
  subtitle: string;
  meta: string;
  badge: string;
  date: string;
  amountCents?: number;
  to: string;
};

export function searchGlobalRecords(
  state: Pick<OrionState, "transactions" | "fiscalReceipts" | "personalAgenda">,
  rawQuery: string,
  scope: GlobalSearchScope = "all",
  limitPerGroup = 8,
): GlobalSearchResult[] {
  const q = cleanName(rawQuery);
  const rawLower = rawQuery.trim().toLowerCase();
  const limit = q ? limitPerGroup : 4;
  const results: GlobalSearchResult[] = [];

  if (scope === "all" || scope === "transaction") {
    const txs = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
    let count = 0;
    for (const tx of txs) {
      if (count >= limit) break;
      if (q) {
        const amountStr = formatBRL(Math.abs(tx.amountCents)).toLowerCase();
        const haystack = cleanName(
          `${tx.description} ${tx.institution} ${tx.accountName} ${tx.category} ${tx.date}`,
        );
        if (!haystack.includes(q) && !amountStr.includes(rawLower)) continue;
      }
      results.push({
        id: `tx:${tx.id}`,
        kind: "transaction",
        title: tx.description || tx.category || "Movimentação",
        subtitle: `${tx.institution} · ${tx.accountName}`,
        meta: `${formatDateBR(tx.date)} · ${tx.category}`,
        badge: tx.accountType === "CREDIT" ? "Cartão" : "Transação",
        date: tx.date,
        amountCents: tx.amountCents,
        to: `/carteira?q=${encodeURIComponent(tx.description || tx.category)}`,
      });
      count++;
    }
  }

  if (scope === "all" || scope === "fiscal_receipt") {
    const notes = [...state.fiscalReceipts].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    let count = 0;
    for (const note of notes) {
      if (count >= limit) break;
      if (q) {
        const amountStr = formatBRL(note.totalCents).toLowerCase();
        const haystack = cleanName(
          [
            note.store,
            note.cnpj,
            note.accessKey,
            note.number,
            note.issuedAt,
            note.archiveCategory ?? "",
            note.paymentMethod,
            note.warranty?.productName ?? "",
            ...(note.items ?? []).map((i) => `${i.description} ${i.normalizedName ?? ""}`),
          ].join(" "),
        );
        if (!haystack.includes(q) && !amountStr.includes(rawLower)) continue;
      }
      const itemCount = note.items?.length ?? 0;
      results.push({
        id: `nf:${note.id}`,
        kind: "fiscal_receipt",
        title: note.store || "Nota Fiscal",
        subtitle: `${formatDateBR(note.issuedAt)}${note.number ? ` · NF ${note.number}` : ""}${itemCount > 0 ? ` · ${itemCount} itens` : ""}`,
        meta: note.accessKey ? `Chave ...${note.accessKey.slice(-8)}` : note.archiveCategory || "Nota Fiscal",
        badge: "Nota Fiscal",
        date: note.issuedAt,
        amountCents: -Math.abs(note.totalCents),
        to: `/notas-fiscais?q=${encodeURIComponent(note.accessKey || note.store)}`,
      });
      count++;
    }
  }

  if (scope === "all" || scope === "agenda") {
    const items = [...state.personalAgenda].sort((a, b) => b.startDate.localeCompare(a.startDate));
    let count = 0;
    for (const rec of items) {
      if (count >= limit) break;
      const kindLabel = AGENDA_KINDS[rec.kind] ?? "Agenda";
      if (q) {
        const haystack = cleanName(
          [
            rec.title,
            rec.description,
            rec.startDate,
            kindLabel,
            ...(rec.items ?? []).map((i) => i.description),
          ].join(" "),
        );
        if (!haystack.includes(q)) continue;
      }
      results.push({
        id: `ag:${rec.id}`,
        kind: "agenda",
        title: rec.title,
        subtitle: `${formatDateBR(rec.startDate)}${rec.time ? ` às ${rec.time}` : ""}`,
        meta: rec.description || `${kindLabel}${rec.items?.length ? ` · ${rec.items.length} tarefas` : ""}`,
        badge: kindLabel,
        date: rec.startDate,
        to: `/agenda?date=${encodeURIComponent(rec.startDate)}`,
      });
      count++;
    }
  }

  return results;
}
