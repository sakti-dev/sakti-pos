# Product Form Cards Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure Tambah/Edit Produk into four cards (Detail Produk, Varian, Stok, Resep) and replace the implicit "Stok Minimum" tracking convention with an explicit Tidak Terbatas / Terbatas radio that seeds initial stock.

**Architecture:** Reuse existing widgets inside `Card` sections. New pure function `resolveStockSteps` decides which stock db calls a save performs; a thin `seedProductStock` wrapper owns the transaction around existing `setStockCount`. Radio wraps Kobalte's radio-group (already in `@kobalte/core`).

**Tech Stack:** SolidJS + Kobalte, vitest (pos-app), Tailwind v4 tokens, existing `db/inventory.ts` helpers.

**Repo rule:** commits require explicit user confirmation — pause before every commit step and ask.

Design doc: `docs/plans/2026-10-04-product-form-cards-design.md`

---

### Task 1: `resolveStockSteps` pure function (TDD)

**Files:**
- Create: `apps/pos-app/src/pages/catalog/stock-steps.ts`
- Test: `apps/pos-app/src/pages/catalog/__test__/stock-steps.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { resolveStockSteps } from "../stock-steps";

describe("resolveStockSteps", () => {
  test("unlimited + untracked → no steps (today's default)", () => {
    expect(
      resolveStockSteps({ mode: "unlimited", wasTracked: false, initialQty: 0, threshold: 0 })
    ).toEqual([]);
  });

  test("unlimited + tracked → stopTracking", () => {
    expect(
      resolveStockSteps({ mode: "unlimited", wasTracked: true, initialQty: 0, threshold: 0 })
    ).toEqual([{ kind: "stopTracking" }]);
  });

  test("limited + untracked → seed then threshold", () => {
    expect(
      resolveStockSteps({ mode: "limited", wasTracked: false, initialQty: 24, threshold: 5 })
    ).toEqual([
      { kind: "seed", qty: 24 },
      { kind: "threshold", value: 5 },
    ]);
  });

  test("limited + tracked → threshold only, never overwrite balance", () => {
    expect(
      resolveStockSteps({ mode: "limited", wasTracked: true, initialQty: 24, threshold: 5 })
    ).toEqual([{ kind: "threshold", value: 5 }]);
  });

  test("negative inputs clamp to 0", () => {
    expect(
      resolveStockSteps({ mode: "limited", wasTracked: false, initialQty: -3, threshold: -1 })
    ).toEqual([
      { kind: "seed", qty: 0 },
      { kind: "threshold", value: 0 },
    ]);
  });
});
```

**Step 2: Run it — expect FAIL (module not found)**

Run: `cd apps/pos-app && bunx vitest run src/pages/catalog/__test__/stock-steps.test.ts`

**Step 3: Implement**

```ts
export type StockMode = "unlimited" | "limited";

export type StockStep =
  | { kind: "seed"; qty: number }
  | { kind: "threshold"; value: number }
  | { kind: "stopTracking" };

export interface StockStepInput {
  readonly mode: StockMode;
  readonly wasTracked: boolean;
  readonly initialQty: number;
  readonly threshold: number;
}

/** Mode × tracked-state → ordered stock db calls a product-form save performs. */
export function resolveStockSteps(input: StockStepInput): readonly StockStep[] {
  if (input.mode === "unlimited") {
    return input.wasTracked ? [{ kind: "stopTracking" }] : [];
  }
  const steps: StockStep[] = [];
  if (!input.wasTracked) {
    steps.push({ kind: "seed", qty: Math.max(0, input.initialQty) });
  }
  steps.push({ kind: "threshold", value: Math.max(0, input.threshold) });
  return steps;
}
```

**Step 4: Run — expect 5 PASS**

**Step 5: Commit** (ask user) — `feat(pos-app): stock mode decision pure fn for product form`

---

### Task 2: `seedProductStock` wrapper (TDD)

**Files:**
- Modify: `apps/pos-app/src/db/inventory.ts` (add after `setLowStockThreshold`, ~L410)
- Test: `apps/pos-app/src/db/__test__/inventory.test.ts` (extend; mock infra at L60-77 already covers `writeTransaction` + logger)

**Step 1: Failing test** — add to inventory.test.ts: import `seedProductStock` in the `await import("../inventory")` destructure, then:

```ts
describe("seedProductStock (product form initial stock)", () => {
  test("creates balance row at the seeded qty", async () => {
    balanceRow = undefined;
    await seedProductStock("product", "p1", 24);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values).toMatchObject({ onHandQty: 24 });
  });
});
```

**Step 2: Run — expect FAIL (not exported)**

Run: `cd apps/pos-app && bunx vitest run src/db/__test__/inventory.test.ts`

**Step 3: Implement** in db/inventory.ts:

```ts
/** Seed the initial balance when tracking starts from the product form. */
export async function seedProductStock(
  targetType: StockTargetType,
  targetId: string,
  initialQty: number
): Promise<void> {
  await getSyncClient().writeTransaction(db, async (tx) => {
    await setStockCount(tx, targetType, targetId, initialQty);
  });
  inventoryLogger.info("stock_seeded", { targetId, targetType, initialQty });
}
```

**Step 4: Run — PASS (all 16)**

**Step 5: Commit** (ask user) — `feat(pos-app): seedProductStock — initial balance on tracking start`

---

### Task 3: RadioGroup UI primitive

**Files:**
- Create: `apps/pos-app/src/components/ui/radio-group.tsx`

No unit test (thin visual wrapper, same as badge/link); verified in Task 5 manual pass.

**Step 1: Implement** — follow the tabs.tsx wrapper conventions (Kobalte primitives + cva + cn):

```tsx
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as RadioGroupPrimitive from "@kobalte/core/radio-group";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "~/lib/utils";

export const RadioGroup = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T> & { class?: string; children?: JSX.Element }
) => {
  const [local, others] = splitProps(props as Record<string, unknown>, ["class"]);
  return (
    <RadioGroupPrimitive.Root
      class={cn("flex flex-col gap-3", local.class as string | undefined)}
      {...(others as PolymorphicProps<T>)}
    />
  );
};

export const RadioOption = (props: {
  value: string;
  label: string;
  description?: string;
}) => (
  <RadioGroupPrimitive.Item value={props.value} class="flex cursor-pointer items-start gap-3">
    <RadioGroupPrimitive.ItemControl class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-input transition-colors data-[checked]:border-primary">
      <RadioGroupPrimitive.ItemIndicator class="size-2.5 rounded-full bg-primary" />
    </RadioGroupPrimitive.ItemControl>
    <span class="flex min-w-0 flex-col gap-0.5">
      <RadioGroupPrimitive.ItemLabel class="font-medium text-body-sm text-foreground leading-none">
        {props.label}
      </RadioGroupPrimitive.ItemLabel>
      {props.description ? (
        <RadioGroupPrimitive.ItemDescription class="text-caption-sm text-muted-foreground">
          {props.description}
        </RadioGroupPrimitive.ItemDescription>
      ) : null}
    </span>
  </RadioGroupPrimitive.Item>
);
```

Check Kobalte exports compile (`ItemControl`/`ItemIndicator`/`ItemLabel`/`ItemDescription` are the documented parts); adapt names if the vendored version differs.

**Step 2: `cd apps/pos-app && bun run typecheck` — PASS**

---

### Task 4: Restructure product-form.tsx into cards + Stok radio

**Files:**
- Modify: `apps/pos-app/src/pages/catalog/product-form.tsx`

**Step 1 — State & hydration changes:**
- Add signals: `stockMode` (`StockMode`, default `"unlimited"`), `initialQty` (`""`), `wasTracked` (`false`), `trackedOnHand` (`number | null` = null).
- Edit hydration resource (currently L164-180): from `getProductStock` result `stock` set `wasTracked(stock?.tracked ?? false)`, `stockMode(stock?.tracked ? "limited" : "unlimited")`, `trackedOnHand(stock?.onHandQty ?? null)`, threshold prefill as today (empty when untracked).
- Delete `applyThreshold` (L198-221) and the old threshold prefill only.

**Step 2 — Executor replacing applyThreshold:**

```ts
const applyStockSteps = async (productId: string) => {
  const steps = resolveStockSteps({
    mode: stockMode(),
    wasTracked: wasTracked(),
    initialQty: Number.parseFloat(initialQty().replace(",", ".")) || 0,
    threshold: Number.parseFloat(threshold().replace(",", ".")) || 0,
  });
  for (const step of steps) {
    if (step.kind === "seed") {
      await seedProductStock("product", productId, step.qty);
    } else if (step.kind === "threshold") {
      await setLowStockThreshold("product", productId, step.value);
    } else {
      await stopTracking("product", productId);
    }
  }
};
```

Call site in `handleSave` stays `await applyStockSteps(productId);` but wrap in try/catch → `logger.warn("stock_step_failed", { error: String(error) })` — non-blocking, product already saved (matches the documented intent of the old comment).

**Step 3 — JSX:** replace the flat sections with 4 `Card`s (`CardHeader class="p-5 pb-2"` + `CardTitle`, `CardContent class="p-5 pt-4"`):

1. **Detail Produk** — existing photo/name markup + Kategori PickerField + Harga NumberField (drop the old Stok Minimum field entirely).
2. **Varian** — existing `AttachmentField` unchanged.
3. **Stok** — `RadioGroup value={stockMode()} onChange={(v) => setStockMode(v as StockMode)}` with two `RadioOption`s: `unlimited` "Tidak terbatas" / "Stok tidak dipantau — produk selalu bisa dijual", `limited` "Terbatas" / "Pantau stok — kelola via Stok & Opname". Then `<Show when={stockMode() === "limited"}>`: grid with **Stok saat ini** — editable NumberField when `!isEditing() || !wasTracked()`, else read-only display of `trackedOnHand()` + link `<A href="/inventory/stocktake/new">Atur via Opname</A>`; and **Stok minimum** NumberField (threshold signal, as before). `</Show>` plus hint when `wasTracked() && stockMode() === "unlimited"`: "Riwayat stok tetap tersimpan di Riwayat Stok."
4. **Resep** — existing `RecipeField` + helper paragraph unchanged.

New imports: Card parts, `A` from `@solidjs/router`, `RadioGroup`/`RadioOption`, `seedProductStock` (replace `startTracking` import), `resolveStockSteps`/`type StockMode`.

**Step 4: `cd apps/pos-app && bun run typecheck && bun run lint` — clean**

**Step 5: `cd apps/pos-app && bun run test` — all pass**

**Step 6: Commit** (ask user) — `feat(pos-app): product form cards + terbatas/tidak-terbatas stock radio`

---

### Task 5: Docs + device verification

**Files:**
- Modify: `openspec/APP-LOGGING-DOCS.md` — add near the INVENTORY rows (~L210):
  - `[JS] [INVENTORY:STOCK_SEEDED]` — db/inventory.ts — product form seeded initial balance on tracking start; includes targetId, initialQty
  - `[JS] [INVENTORY:STOCK_STEP_FAILED]` — product-form.tsx — stock step failed after product saved (non-blocking); includes error
- `logs/capture-adb-logcat.sh` — NO change needed: `INVENTORY:` already matches BASE_LOG_FILTER.

**Verification:**
1. `bun run test` + `bun run typecheck` + `bun run lint` at repo root — green.
2. Rebuild + install: `bun run app:build-apk && adb install -r apps/pos-app/sakti-pos.apk`.
3. Manual: create product Tidak terbatas → `adb shell run-as com.sakti_dev.sakti_pos` unavailable sqlite — instead verify via logs: no `STOCK_SEEDED`, sync push 200.
4. Create product Terbatas stok 24 / minimum 5 → log `[INVENTORY:STOCK_SEEDED] initialQty=24`, retail tab shows "Aman" (24 > 5).
5. Edit tracked product → Stok saat ini read-only, link opens stocktake; change threshold → saved, no seed log.
6. Switch Terbatas → Tidak terbatas → `[INVENTORY:TRACKING_STOPPED]`, history intact in Riwayat.
7. Log capture: `bun run app:log`.

**Commit** (ask user) — `docs: log prefixes for product-form stock seeding`
