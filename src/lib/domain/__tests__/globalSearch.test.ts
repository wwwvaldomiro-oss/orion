import { describe, expect, it } from "vitest";
import { searchGlobalRecords } from "@/lib/domain/globalSearch";
import { createEmptyOrionState, type OrionState } from "@/types/orion";

function buildSearchState(): OrionState {
  const base = createEmptyOrionState();
  return {
    ...base,
    transactions: [
      {
        id: "tx1",
        accountId: "b1",
        accountType: "BANK",
        accountName: "Conta Corrente",
        institution: "Banco do Brasil",
        description: "PIX SUPERMERCADO BOA COMPRA",
        amountCents: -24590,
        date: "2026-11-18",
        category: "Mercado",
      },
    ],
    fiscalReceipts: [
      {
        id: "nf1",
        kind: "mercado",
        store: "Atacadão Brasília",
        cnpj: "12.345.678/0001-90",
        issuedAt: "2026-11-17",
        accessKey: "53261112345678000190650010000123451000123456",
        number: "12345",
        series: "1",
        paymentMethod: "Pix",
        totalCents: 18400,
        items: [
          {
            description: "CAFÉ TORRADO EM GRÃOS 1KG",
            quantity: 1,
            unit: "UN",
            unitPriceCents: 4500,
            totalCents: 4500,
          },
        ],
      },
    ],
    personalAgenda: [
      {
        id: "ag1",
        kind: "appointment",
        title: "Consulta Odontológica",
        startDate: "2026-11-25",
        time: "14:30",
        description: "Clínica Asa Norte",
        recurrence: "none",
        favorite: true,
        reminder: true,
        items: [{ key: "k1", description: "Levar exames" }],
      },
    ],
  };
}

describe("globalSearch", () => {
  it("pesquisa sem acentuação em transações, notas fiscais (incluindo produtos) e agenda", () => {
    const state = buildSearchState();

    const byProduct = searchGlobalRecords(state, "cafe torrado");
    expect(byProduct).toHaveLength(1);
    expect(byProduct[0]?.kind).toBe("fiscal_receipt");
    expect(byProduct[0]?.to).toContain("/notas-fiscais?q=");

    const byTx = searchGlobalRecords(state, "supermercado");
    expect(byTx).toHaveLength(1);
    expect(byTx[0]?.kind).toBe("transaction");
    expect(byTx[0]?.to).toContain("/carteira?q=");

    const byAgenda = searchGlobalRecords(state, "odontologica");
    expect(byAgenda).toHaveLength(1);
    expect(byAgenda[0]?.kind).toBe("agenda");
    expect(byAgenda[0]?.to).toBe("/agenda?date=2026-11-25");
  });

  it("respeita filtro de escopo e exibe itens recentes quando a busca está vazia", () => {
    const state = buildSearchState();

    const allRecent = searchGlobalRecords(state, "");
    expect(allRecent).toHaveLength(3);

    const onlyAgenda = searchGlobalRecords(state, "", "agenda");
    expect(onlyAgenda).toHaveLength(1);
    expect(onlyAgenda[0]?.title).toBe("Consulta Odontológica");
  });
});
