import type { ShoppingStoreGroup, ShoppingStoreProduct } from "@/types/orion";

export const NOTE_COLOR_PALETTE = [
  { id: "white", label: "Branco", hex: "#ffffff" },
  { id: "ivory", label: "Marfim", hex: "#faf7f0" },
  { id: "ice", label: "Gelo", hex: "#eef6f8" },
  { id: "mint", label: "Menta", hex: "#f0fdf4" },
  { id: "amber", label: "Âmbar", hex: "#fffbeb" },
  { id: "rose", label: "Rosa", hex: "#fef2f2" },
  { id: "lavender", label: "Lavanda", hex: "#f5f3ff" },
];

export const SHOPPING_HIGHLIGHT_PALETTE = [
  { id: "yellow", label: "Marca-texto Amarelo", hex: "#fef08a" },
  { id: "green", label: "Marca-texto Verde", hex: "#bbf7d0" },
  { id: "blue", label: "Marca-texto Azul", hex: "#bae6fd" },
  { id: "peach", label: "Marca-texto Pêssego", hex: "#fed7aa" },
  { id: "pink", label: "Marca-texto Rosa", hex: "#fbcfe8" },
];

/**
 * Parses Brazilian BRL formatted strings (e.g. "5,00", "R$ 1.234,56", "5.00") into integer cents.
 */
export function parseBrlCurrencyToCents(raw: string): number {
  const cleaned = raw.replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  if (!cleaned) return 0;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

/**
 * Parses positive quantity accepting comma or dot decimals cleanly.
 */
export function parseQuantityValue(raw: string): number {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 1000) / 1000;
}

/**
 * Computes line total in integer cents using milli-quantity arithmetic (avoids float errors).
 */
export function computeItemTotalCents(quantity: number, unitPriceCents: number): number {
  const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const safeUnit = Number.isFinite(unitPriceCents) && unitPriceCents >= 0 ? Math.trunc(unitPriceCents) : 0;
  const qtyMilli = Math.round(safeQty * 1000);
  return Math.round((qtyMilli * safeUnit) / 1000);
}

export type ShoppingTotals = {
  expectedCents: number;
  purchasedCents: number;
  remainingCents: number;
  totalItems: number;
  purchasedItems: number;
};

export function computeItemsTotals(items: ShoppingStoreProduct[]): ShoppingTotals {
  let expectedCents = 0;
  let purchasedCents = 0;
  let totalItems = 0;
  let purchasedItems = 0;

  for (const item of items) {
    const lineCents = computeItemTotalCents(item.quantity, item.unitPriceCents);
    expectedCents += lineCents;
    totalItems += 1;
    if (item.purchased) {
      purchasedCents += lineCents;
      purchasedItems += 1;
    }
  }

  return {
    expectedCents,
    purchasedCents,
    remainingCents: Math.max(0, expectedCents - purchasedCents),
    totalItems,
    purchasedItems,
  };
}

export function computeStoreTotals(store: ShoppingStoreGroup): ShoppingTotals {
  return computeItemsTotals(store.items ?? []);
}

export function computeShoppingNoteTotals(stores: ShoppingStoreGroup[]): ShoppingTotals {
  let expectedCents = 0;
  let purchasedCents = 0;
  let totalItems = 0;
  let purchasedItems = 0;

  for (const store of stores) {
    const sub = computeStoreTotals(store);
    expectedCents += sub.expectedCents;
    purchasedCents += sub.purchasedCents;
    totalItems += sub.totalItems;
    purchasedItems += sub.purchasedItems;
  }

  return {
    expectedCents,
    purchasedCents,
    remainingCents: Math.max(0, expectedCents - purchasedCents),
    totalItems,
    purchasedItems,
  };
}
