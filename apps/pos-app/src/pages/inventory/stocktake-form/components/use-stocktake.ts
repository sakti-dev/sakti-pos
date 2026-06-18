import { useNavigate } from "@solidjs/router";
import { createMemo, createSignal } from "solid-js";
import { products } from "~/lib/data/catalog";
import { ingredients } from "../../components/lib/ingredients";
import { currentStock } from "../../components/lib/store";
import type { EmptyState } from "./empty-state";
import {
  nextStocktakeNumber,
  stocktakeRef,
  varianceRows,
  varianceValue,
} from "./utils";

export type StocktakeScope = "ingredient" | "retail";

export interface StocktakeItem {
  readonly category: string;
  readonly id: number;
  readonly name: string;
  readonly price: number;
  readonly sku: string;
  readonly unit: string;
}

/**
 * Stocktake form state + actions.
 *
 * Counts default to system stock; an "adjustment" is a deviation from that
 * baseline. Everything reactive lives here so the view components stay
 * purely presentational.
 */
export function useStocktake(scope: StocktakeScope) {
  const opnum = nextStocktakeNumber();
  const ref = stocktakeRef(opnum);

  const navigate = useNavigate();

  // ── Items in scope ──
  const scopeItems = createMemo<StocktakeItem[]>(() =>
    scope === "ingredient"
      ? ingredients.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          unit: i.unit,
          category: i.category ?? "",
          price: 0,
        }))
      : products
          .filter((p) => p.isRetail)
          .map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            unit: p.unit,
            category: p.category,
            price: p.price,
          }))
  );

  // ── Counts: seeded from system stock on first availability ──
  const [counts, setCounts] = createSignal<Record<number, number>>({});
  const [seeded, setSeeded] = createSignal(false);
  const [reason, setReason] = createSignal("");
  const [search, setSearch] = createSignal("");

  if (!seeded() && scopeItems().length > 0) {
    const initial: Record<number, number> = {};
    for (const p of scopeItems()) {
      initial[p.id] = currentStock(p.id);
    }
    setCounts(initial);
    setSeeded(true);
  }

  // ── Actions ──
  const increment = (id: number) =>
    setCounts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));

  const decrement = (id: number) =>
    setCounts((prev) => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) - 1),
    }));

  const setCount = (id: number, value: number) =>
    setCounts((prev) => ({ ...prev, [id]: value }));

  // ── Derived ──
  const diffOf = (id: number) => (counts()[id] ?? 0) - currentStock(id);

  const rows = createMemo(() =>
    varianceRows(
      Object.entries(counts()).map(([id, c]) => ({
        productId: Number(id),
        counted: c,
      }))
    )
  );
  const totalDiff = createMemo(() => rows().reduce((s, r) => s + r.diff, 0));
  const totalValue = createMemo(() => varianceValue(rows()));
  const adjustedCount = createMemo(
    () => rows().filter((r) => r.diff !== 0).length
  );

  const filteredItems = createMemo(() => {
    const q = search().toLowerCase().trim();
    const items = scopeItems();
    if (!q) {
      return items;
    }
    return items.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  });

  const canConfirm = createMemo(
    () => reason().trim().length > 0 && adjustedCount() > 0
  );

  // ── Empty-state detection (priority order; first match wins) ──
  const isRetailScope = () => scope === "retail";
  const hasCatalog = () =>
    isRetailScope() ? products.length > 0 : ingredients.length > 0;
  const allBebasStok = () =>
    isRetailScope() &&
    products.length > 0 &&
    products.every((p) => !p.isRetail);
  const isSearching = () => search().trim().length > 0;

  const emptyState = (): EmptyState => {
    if (scopeItems().length > 0) {
      return { kind: "none" };
    }
    if (isSearching()) {
      return { kind: "search", query: search().trim() };
    }
    if (isRetailScope() && allBebasStok()) {
      return { kind: "bebas-stok" };
    }
    if (!hasCatalog()) {
      return { kind: "empty" };
    }
    // Catalog exists but produced no countable items — treat as empty.
    return { kind: "empty" };
  };

  const onEmptyCta = (kind: EmptyState["kind"]) => {
    if (kind === "search") {
      setSearch("");
      return;
    }
    if (kind === "bebas-stok" || kind === "empty") {
      if (isRetailScope()) {
        navigate("/catalog");
        return;
      }
      navigate("/inventory?tab=ingredient&action=new");
    }
  };

  return {
    adjustedCount,
    canConfirm,
    counts,
    decrement,
    diffOf,
    emptyState,
    filteredItems,
    increment,
    onEmptyCta,
    reason,
    ref,
    rows,
    scope,
    scopeItems,
    search,
    setCount,
    setCounts,
    setReason,
    setSearch,
    totalDiff,
    totalValue,
  };
}

export type StocktakeState = ReturnType<typeof useStocktake>;
