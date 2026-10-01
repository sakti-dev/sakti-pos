import { useNavigate } from "@solidjs/router";
import { createMemo, createResource, createSignal } from "solid-js";
import {
  getTrackedItems,
  nextStocktakeRef,
  type StockTargetType,
} from "~/db/inventory";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import type { EmptyState } from "./empty-state";
import { varianceRows, varianceValue } from "./utils";

export type StocktakeScope = "ingredient" | "retail";

export interface StocktakeItem {
  readonly id: string;
  readonly name: string;
  readonly onHandQty: number;
  /** Products: sale price for variance valuation. Ingredients: null. */
  readonly priceMinorUnits: number | null;
  readonly targetType: StockTargetType;
  readonly unit: string;
}

export interface StocktakeLineResult {
  readonly countedQty: number;
  readonly systemQtyBefore: number;
  readonly targetId: string;
  readonly targetType: StockTargetType;
  readonly varianceQty: number;
}

/**
 * Stocktake form state + actions.
 *
 * Counts default to system stock; an "adjustment" is a deviation from that
 * baseline. Everything reactive lives here so the view components stay
 * purely presentational.
 */
export function useStocktake(scope: StocktakeScope) {
  const [ref] = createResource(() => nextStocktakeRef());

  const navigate = useNavigate();

  // ── Items in scope: tracked items of the scope's target type ──
  const itemsQuery = useDrizzleQuery(
    ["drizzle", "inventory", "tracked-items"],
    () => getTrackedItems()
  );

  const scopeType = (): StockTargetType =>
    scope === "ingredient" ? "ingredient" : "product";

  const scopeItems = createMemo<StocktakeItem[]>(() =>
    (itemsQuery.data() ?? [])
      .filter((i) => i.targetType === scopeType())
      .map((i) => ({
        id: i.id,
        name: i.name,
        onHandQty: i.onHandQty,
        priceMinorUnits: i.priceMinorUnits,
        targetType: i.targetType,
        unit: i.unit,
      }))
  );

  // ── Counts: seeded from system stock on first availability ──
  const [counts, setCounts] = createSignal<Record<string, number>>({});
  const [seeded, setSeeded] = createSignal(false);
  const [reason, setReason] = createSignal("");
  const [search, setSearch] = createSignal("");

  const systemQty = (id: string) =>
    scopeItems().find((i) => i.id === id)?.onHandQty ?? 0;

  if (!seeded() && scopeItems().length > 0) {
    const initial: Record<string, number> = {};
    for (const item of scopeItems()) {
      initial[item.id] = item.onHandQty;
    }
    setCounts(initial);
    setSeeded(true);
  }

  // ── Actions ──
  const increment = (id: string) =>
    setCounts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));

  const decrement = (id: string) =>
    setCounts((prev) => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) - 1),
    }));

  const setCount = (id: string, value: number) =>
    setCounts((prev) => ({ ...prev, [id]: value }));

  // ── Derived ──
  const diffOf = (id: string) => (counts()[id] ?? 0) - systemQty(id);

  const rows = createMemo(() =>
    varianceRows(
      Object.entries(counts()).map(([id, counted]) => ({
        counted,
        item: scopeItems().find((i) => i.id === id),
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
    return items.filter((i) => i.name.toLowerCase().includes(q));
  });

  const canConfirm = createMemo(
    () => reason().trim().length > 0 && adjustedCount() > 0
  );

  /** Variance lines to persist (counted ≠ system). */
  const buildLines = (): StocktakeLineResult[] =>
    rows()
      .filter((r) => r.diff !== 0 && r.item)
      .map((r) => ({
        countedQty: r.counted,
        systemQtyBefore: r.counted - r.diff,
        targetId: r.item!.id,
        targetType: r.item!.targetType,
        varianceQty: r.diff,
      }));

  // ── Empty-state detection (priority order; first match wins) ──
  const isRetailScope = () => scope === "retail";
  const hasCatalog = () => scopeItems().length > 0;
  const isSearching = () => search().trim().length > 0;

  const emptyState = (): EmptyState => {
    if (scopeItems().length > 0) {
      return { kind: "none" };
    }
    if (isSearching()) {
      return { kind: "search", query: search().trim() };
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
    if (kind === "empty") {
      if (isRetailScope()) {
        navigate("/inventory?tab=retail");
        return;
      }
      navigate("/inventory?tab=ingredient&action=new");
    }
  };

  return {
    adjustedCount,
    buildLines,
    canConfirm,
    counts,
    decrement,
    diffOf,
    emptyState,
    filteredItems,
    increment,
    itemsLoading: itemsQuery.loading,
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
