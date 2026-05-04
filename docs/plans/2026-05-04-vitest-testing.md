# Vitest Testing Setup & Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Vitest in the pos-app with SolidJS testing utilities and write comprehensive tests for all modules.

**Architecture:** Use Vitest as test runner with jsdom environment for component tests, `@solidjs/testing-library` for component rendering, and `@testing-library/user-event` for interaction simulation. Pure logic/utility modules get unit tests; components get integration-style tests via testing-library; database modules get mocked tests.

**Tech Stack:** Vitest, jsdom, @solidjs/testing-library, @testing-library/user-event, @testing-library/jest-dom, SolidJS

---

### Task 1: Install Testing Dependencies

**Files:**
- Modify: `apps/pos-app/package.json`

**Step 1: Install packages**

Run: `bun add vitest jsdom @solidjs/testing-library @testing-library/user-event @testing-library/jest-dom -d` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)

**Step 2: Verify installation**

Run: `bun pm ls 2>/dev/null | grep -E "vitest|jsdom|@solidjs/testing-library|@testing-library/user-event|@testing-library/jest-dom"` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: All 5 packages listed

**Step 3: Commit**

```bash
git add apps/pos-app/package.json apps/pos-app/bun.lock
git commit -m "chore(pos-app): add vitest and solid testing dependencies"
```

---

### Task 2: Configure Vitest

**Files:**
- Create: `apps/pos-app/vitest.config.ts`
- Modify: `apps/pos-app/tsconfig.json`
- Modify: `apps/pos-app/package.json` (scripts)

**Step 1: Create vitest.config.ts**

```typescript
import path from "node:path";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
    },
    conditions: ["development", "browser"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/__test__/*.{test,test}.{ts,tsx}"],
    css: false,
  },
});
```

**Step 2: Create test setup file**

Create `apps/pos-app/src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

**Step 3: Update tsconfig.json to add jest-dom types**

Add `"@testing-library/jest-dom"` to the `compilerOptions.types` array. The updated tsconfig.json:

```json
{
  "extends": "@repo/typescript-config/solid.json",
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"],
      "@repo/database": ["../../packages/database/src/schema.ts"]
    },
    "types": ["@testing-library/jest-dom"]
  },
  "include": ["src"],
  "exclude": ["docs/external"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Add test scripts to package.json**

Add these scripts to `apps/pos-app/package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Step 5: Verify config works**

Run: `cd /home/eekrain/CODE/sakti-pos && bun run --filter @repo/pos-app test` 
Expected: Vitest runs (may show "no test files" if existing test file doesn't match pattern, that's OK)

**Step 6: Commit**

```bash
git add apps/pos-app/vitest.config.ts apps/pos-app/src/test/setup.ts apps/pos-app/tsconfig.json apps/pos-app/package.json
git commit -m "chore(pos-app): configure vitest with solidjs support"
```

---

### Task 3: Migrate Existing Test (utils.test.ts)

**Files:**
- Delete: `apps/pos-app/src/lib/utils.test.ts`
- Create: `apps/pos-app/src/lib/__test__/utils.test.ts`

The existing `utils.test.ts` uses `bun:test`. Migrate it to vitest and move to `__test__` directory.

**Step 1: Create `__test__` directory and move file**

Create `apps/pos-app/src/lib/__test__/utils.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { cn, formatIDR } from "../utils";

describe("cn", () => {
  test("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  test("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "active")).toBe("base active");
  });

  test("deduplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("formatIDR", () => {
  test("formats zero", () => {
    expect(formatIDR(0)).toBe("Rp\u00a00");
  });

  test("formats positive amount", () => {
    expect(formatIDR(15_000)).toBe("Rp\u00a015.000");
  });

  test("formats large amount", () => {
    expect(formatIDR(1_500_000)).toBe("Rp\u00a01.500.000");
  });
});
```

**Step 2: Delete old test file**

Delete `apps/pos-app/src/lib/utils.test.ts`

**Step 3: Run test to verify**

Run: `bun run test` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: 1 test file, 6 tests passing

**Step 4: Commit**

```bash
git add apps/pos-app/src/lib/__test__/utils.test.ts
git rm apps/pos-app/src/lib/utils.test.ts
git commit -m "test(pos-app): migrate utils.test to vitest with __test__ directory"
```

---

### Task 4: Test `src/lib/toast.ts` (Signal-based state)

**Files:**
- Create: `apps/pos-app/src/lib/__test__/toast.test.ts`

**Step 1: Write tests for toast module**

```typescript
import { describe, expect, test, vi } from "vitest";
import { dismissToast, toast, toasts } from "../toast";

describe("toast", () => {
  test("adds a toast with default variant", () => {
    toast("Hello");
    const t = toasts();
    expect(t).toHaveLength(1);
    expect(t[0].message).toBe("Hello");
    expect(t[0].variant).toBe("info");
    dismissToast(t[0].id);
  });

  test("adds a toast with custom variant", () => {
    toast("Saved", "success");
    const t = toasts();
    expect(t[0].variant).toBe("success");
    dismissToast(t[0].id);
  });

  test("dismissToast removes the toast", () => {
    toast("Remove me");
    const t = toasts();
    expect(t).toHaveLength(1);
    dismissToast(t[0].id);
    expect(toasts()).toHaveLength(0);
  });

  test("auto-dismisses after timeout", () => {
    vi.useFakeTimers();
    toast("Auto");
    expect(toasts()).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(toasts()).toHaveLength(0);
    vi.useRealTimers();
  });
});
```

**Step 2: Run test to verify**

Run: `bun run test src/lib/__test__/toast.test.ts` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: 4 tests passing

**Step 3: Commit**

```bash
git add apps/pos-app/src/lib/__test__/toast.test.ts
git commit -m "test(pos-app): add tests for toast module"
```

---

### Task 5: Test `src/lib/cart.ts` (Solid Store + Signals)

**Files:**
- Create: `apps/pos-app/src/lib/__test__/cart.test.ts`

The cart module uses module-level `createStore` and `createMemo`. Testing requires careful handling since the store is a singleton. We use `clearCart()` to reset state between tests.

**Step 1: Write tests for cart module**

```typescript
import { describe, expect, test } from "vitest";
import {
  addToCart,
  cartCount,
  cartItems,
  cartTotal,
  clearCart,
  removeFromCart,
  updateQuantity,
} from "../cart";

const makeProduct = (id: number, price = 10_000) =>
  ({
    categoryId: 1,
    createdAt: "2026-01-01",
    id,
    imageUrl: null,
    isActive: true,
    name: `Product ${id}`,
    price,
    sortOrder: 0,
    updatedAt: "2026-01-01",
  }) as const;

describe("cart", () => {
  test("starts empty", () => {
    clearCart();
    expect(cartItems()).toHaveLength(0);
    expect(cartTotal()).toBe(0);
    expect(cartCount()).toBe(0);
  });

  test("addToCart adds a new item", () => {
    clearCart();
    addToCart(makeProduct(1));
    expect(cartItems()).toHaveLength(1);
    expect(cartCount()).toBe(1);
    expect(cartTotal()).toBe(10_000);
    clearCart();
  });

  test("addToCart increments quantity for existing product", () => {
    clearCart();
    addToCart(makeProduct(1));
    addToCart(makeProduct(1));
    expect(cartItems()).toHaveLength(1);
    expect(cartItems()[0].quantity).toBe(2);
    expect(cartTotal()).toBe(20_000);
    clearCart();
  });

  test("updateQuantity changes quantity", () => {
    clearCart();
    addToCart(makeProduct(1));
    updateQuantity(1, 5);
    expect(cartItems()[0].quantity).toBe(5);
    expect(cartTotal()).toBe(50_000);
    clearCart();
  });

  test("updateQuantity with 0 or negative removes item", () => {
    clearCart();
    addToCart(makeProduct(1));
    updateQuantity(1, 0);
    expect(cartItems()).toHaveLength(0);
    clearCart();
  });

  test("removeFromCart removes the item", () => {
    clearCart();
    addToCart(makeProduct(1));
    addToCart(makeProduct(2));
    removeFromCart(1);
    expect(cartItems()).toHaveLength(1);
    expect(cartItems()[0].product.id).toBe(2);
    clearCart();
  });

  test("clearCart empties the cart", () => {
    clearCart();
    addToCart(makeProduct(1));
    addToCart(makeProduct(2));
    clearCart();
    expect(cartItems()).toHaveLength(0);
  });

  test("cartTotal calculates correctly with multiple items", () => {
    clearCart();
    addToCart(makeProduct(1, 15_000));
    addToCart(makeProduct(1, 15_000));
    addToCart(makeProduct(2, 25_000));
    expect(cartTotal()).toBe(55_000);
    expect(cartCount()).toBe(3);
    clearCart();
  });
});
```

**Step 2: Run test to verify**

Run: `bun run test src/lib/__test__/cart.test.ts` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: 8 tests passing

**Step 3: Commit**

```bash
git add apps/pos-app/src/lib/__test__/cart.test.ts
git commit -m "test(pos-app): add tests for cart module"
```

---

### Task 6: Test `src/lib/auth-provider.ts` (Mocked DB)

**Files:**
- Create: `apps/pos-app/src/lib/__test__/auth-provider.test.ts`

**Step 1: Write tests for auth-provider**

The module depends on `db` (drizzle) and `bcryptjs`. We mock `~/db` and test the pure logic.

```typescript
import bcrypt from "bcryptjs";
import { describe, expect, test, vi } from "vitest";

vi.mock("~/db", () => ({
  db: {
    run: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [
          {
            id: 1,
            isActive: true,
            name: "Owner",
            pin: "$2a$10$hashedpin",
            role: "owner",
          },
        ]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

describe("auth-provider", () => {
  test("hashPin returns a bcrypt hash", async () => {
    const { hashPin } = await import("../auth-provider");
    const hash = await hashPin("123456");
    expect(hash).not.toBe("123456");
    expect(hash.startsWith("$2a$")).toBe(true);
  });

  test("verifyPin succeeds with correct pin", async () => {
    const pin = "123456";
    const hash = await bcrypt.hash(pin, 10);
    const { verifyPin } = await import("../auth-provider");

    vi.mocked(vi.mocked(await import("~/db")).db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => [
          {
            id: 1,
            isActive: true,
            name: "Owner",
            pin: hash,
            role: "owner",
          },
        ]),
      })),
    } as never);

    const user = await verifyPin(1, pin);
    expect(user.name).toBe("Owner");
    expect(user.role).toBe("owner");
  });
});
```

**Step 2: Run test to verify**

Run: `bun run test src/lib/__test__/auth-provider.test.ts` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: Tests passing

**Step 3: Commit**

```bash
git add apps/pos-app/src/lib/__test__/auth-provider.test.ts
git commit -m "test(pos-app): add tests for auth-provider module"
```

---

### Task 7: Test `src/db/orders.ts` (Mocked DB - Pure logic)

**Files:**
- Create: `apps/pos-app/src/db/__test__/orders.test.ts`

The database functions use drizzle queries and Tauri invoke. We mock both to test the business logic.

**Step 1: Write tests for order logic**

Focus on testing `getNextOrderNumber` (exported indirectly) and data transformation logic by mocking `db` and `invoke`.

```typescript
import { describe, expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("~/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

describe("createOrder", () => {
  test("calls invoke with correct SQL statements", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockedInvoke = vi.mocked(invoke);

    const { db } = await import("~/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => []),
        })),
      })),
    } as never);

    mockedInvoke.mockResolvedValue({ last_insert_id: 1, rows_affected: 1 });

    const { createOrder } = await import("../orders");
    const orderNumber = await createOrder({
      amountPaid: 20_000,
      changeAmount: 0,
      items: [
        { price: 10_000, product_id: 1, product_name: "Nasi Goreng", qty: 2 },
      ],
      paymentMethod: "cash",
      total: 20_000,
      userId: 1,
    });

    expect(orderNumber).toMatch(/^\d{4}-\d{2}-\d{2}-001$/);
    expect(mockedInvoke).toHaveBeenCalledWith("run_sql_batch", {
      statements: expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("INSERT INTO orders"),
        }),
      ]),
    });
  });
});
```

**Step 2: Run test to verify**

Run: `bun run test src/db/__test__/orders.test.ts` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: Tests passing

**Step 3: Commit**

```bash
git add apps/pos-app/src/db/__test__/orders.test.ts
git commit -m "test(pos-app): add tests for orders db module"
```

---

### Task 8: Test `src/components/ui/pinpad.tsx` (Component Test)

**Files:**
- Create: `apps/pos-app/src/components/ui/__test__/pinpad.test.tsx`

**Step 1: Write component tests for PinPad**

```typescript
import { describe, expect, test } from "vitest";
import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import PinPad from "../pinpad";

const user = userEvent.setup();

describe("PinPad", () => {
  test("renders pin dots", () => {
    const { container } = render(() => <PinPad onSubmit={() => {}} />);
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBe(6);
  });

  test("fills dots as digits are entered", async () => {
    const { getByText, container } = render(() => (
      <PinPad onSubmit={() => {}} />
    ));
    await user.click(getByText("1"));
    await user.click(getByText("2"));
    const filledDots = container.querySelectorAll(".bg-primary");
    expect(filledDots.length).toBe(2);
  });

  test("calls onSubmit with pin when OK is pressed after entering max digits", async () => {
    const onSubmit = vi.fn();
    const { getByText } = render(() => <PinPad onSubmit={onSubmit} />);
    await user.click(getByText("1"));
    await user.click(getByText("2"));
    await user.click(getByText("3"));
    await user.click(getByText("4"));
    await user.click(getByText("5"));
    await user.click(getByText("6"));
    await user.click(getByText("OK"));
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  test("does not submit when pin is incomplete", async () => {
    const onSubmit = vi.fn();
    const { getByText } = render(() => <PinPad onSubmit={onSubmit} />);
    await user.click(getByText("1"));
    await user.click(getByText("2"));
    await user.click(getByText("OK"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("delete removes last digit", async () => {
    const { getByText, container } = render(() => (
      <PinPad onSubmit={() => {}} />
    ));
    await user.click(getByText("1"));
    await user.click(getByText("2"));
    expect(container.querySelectorAll(".bg-primary").length).toBe(2);
    await user.click(getByText("⌫"));
    expect(container.querySelectorAll(".bg-primary").length).toBe(1);
  });
});
```

**Step 2: Run test to verify**

Run: `bun run test src/components/ui/__test__/pinpad.test.tsx` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: 5 tests passing

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/ui/__test__/pinpad.test.tsx
git commit -m "test(pos-app): add component tests for PinPad"
```

---

### Task 9: Test `src/components/daily-summary.tsx` (Component Test)

**Files:**
- Create: `apps/pos-app/src/components/__test__/daily-summary.test.tsx`

**Step 1: Write component tests for DailySummaryBar**

```typescript
import { describe, expect, test } from "vitest";
import { render } from "@solidjs/testing-library";
import { DailySummaryBar } from "../daily-summary";
import type { DailySummary } from "~/db/orders";

const mockSummary: DailySummary = {
  cashTotal: 50_000,
  orderCount: 5,
  qrisTotal: 30_000,
  totalRevenue: 80_000,
};

describe("DailySummaryBar", () => {
  test("renders nothing when data is undefined", () => {
    const { container } = render(() => <DailySummaryBar data={undefined} />);
    expect(container.textContent).toBe("");
  });

  test("renders summary data when provided", () => {
    const { getByText } = render(() => (
      <DailySummaryBar data={mockSummary} />
    ));
    expect(getByText("5")).toBeInTheDocument();
    expect(getByText("Rp\u00a080.000")).toBeInTheDocument();
    expect(getByText("Rp\u00a050.000")).toBeInTheDocument();
    expect(getByText("Rp\u00a030.000")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify**

Run: `bun run test src/components/__test__/daily-summary.test.tsx` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: 2 tests passing

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/__test__/daily-summary.test.tsx
git commit -m "test(pos-app): add component tests for DailySummaryBar"
```

---

### Task 10: Test `src/components/order-card.tsx` (Component Test)

**Files:**
- Create: `apps/pos-app/src/components/__test__/order-card.test.tsx`

**Step 1: Write component tests for OrderCard**

```typescript
import { describe, expect, test } from "vitest";
import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { OrderCard } from "../order-card";
import type { OrderItemRow, OrderRow } from "~/db/orders";

const mockOrder: OrderRow = {
  amountPaid: 30_000,
  changeAmount: 10_000,
  createdAt: "2026-05-04T10:30:00.000Z",
  id: 1,
  orderNumber: "2026-05-04-001",
  paymentMethod: "cash",
  status: "completed",
  total: 20_000,
  userId: 1,
  userName: "Kasir 1",
};

const mockItems: OrderItemRow[] = [
  { id: 1, productName: "Nasi Goreng", quantity: 2, subtotal: 20_000, unitPrice: 10_000 },
];

const user = userEvent.setup();

describe("OrderCard", () => {
  test("renders order number and total", () => {
    const { getByText } = render(() => (
      <OrderCard order={mockOrder} items={mockItems} />
    ));
    expect(getByText("2026-05-04-001")).toBeInTheDocument();
    expect(getByText("Rp\u00a020.000")).toBeInTheDocument();
  });

  test("shows completed status", () => {
    const { getByText } = render(() => (
      <OrderCard order={mockOrder} items={mockItems} />
    ));
    expect(getByText("Selesai")).toBeInTheDocument();
  });

  test("shows cancelled status", () => {
    const cancelledOrder = { ...mockOrder, status: "cancelled" as const };
    const { getByText } = render(() => (
      <OrderCard order={cancelledOrder} items={mockItems} />
    ));
    expect(getByText("Batal")).toBeInTheDocument();
  });

  test("expands to show items on click", async () => {
    const { getByText } = render(() => (
      <OrderCard order={mockOrder} items={mockItems} />
    ));
    const orderNumber = getByText("2026-05-04-001");
    await user.click(orderNumber);
    expect(getByText("Nasi Goreng")).toBeInTheDocument();
    expect(getByText("Tunai")).toBeInTheDocument();
  });

  test("shows cancel button when status is completed and onCancel provided", async () => {
    const onCancel = vi.fn();
    const { getByText } = render(() => (
      <OrderCard order={mockOrder} items={mockItems} onCancel={onCancel} />
    ));
    await user.click(getByText("2026-05-04-001"));
    expect(getByText("Batalkan Pesanan")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify**

Run: `bun run test src/components/__test__/order-card.test.tsx` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: 5 tests passing

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/__test__/order-card.test.tsx
git commit -m "test(pos-app): add component tests for OrderCard"
```

---

### Task 11: Test `src/components/confirm-drawer.tsx` (Component Test)

**Files:**
- Create: `apps/pos-app/src/components/__test__/confirm-drawer.test.tsx`

**Step 1: Write component tests for ConfirmDrawer**

```typescript
import { describe, expect, test } from "vitest";
import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { ConfirmDrawer } from "../confirm-drawer";

const user = userEvent.setup();

describe("ConfirmDrawer", () => {
  test("renders title and message when open", () => {
    const { getByText } = render(() => (
      <ConfirmDrawer
        message="Are you sure?"
        onClose={() => {}}
        onConfirm={() => {}}
        open={true}
        title="Confirm"
      />
    ));
    expect(getByText("Confirm")).toBeInTheDocument();
    expect(getByText("Are you sure?")).toBeInTheDocument();
  });

  test("calls onClose when cancel button is clicked", async () => {
    const onClose = vi.fn();
    const { getByText } = render(() => (
      <ConfirmDrawer
        message="Are you sure?"
        onClose={onClose}
        onConfirm={() => {}}
        open={true}
        title="Confirm"
      />
    ));
    await user.click(getByText("Batal"));
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onConfirm and onClose when confirm button is clicked", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { getByText } = render(() => (
      <ConfirmDrawer
        message="Are you sure?"
        onClose={onClose}
        onConfirm={onConfirm}
        open={true}
        title="Confirm"
      />
    ));
    await user.click(getByText("Hapus"));
    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("renders custom confirm label", () => {
    const { getByText } = render(() => (
      <ConfirmDrawer
        confirmLabel="Delete All"
        message="Are you sure?"
        onClose={() => {}}
        onConfirm={() => {}}
        open={true}
        title="Confirm"
      />
    ));
    expect(getByText("Delete All")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify**

Run: `bun run test src/components/__test__/confirm-drawer.test.tsx` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: 4 tests passing

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/__test__/confirm-drawer.test.tsx
git commit -m "test(pos-app): add component tests for ConfirmDrawer"
```

---

### Task 12: Add Coverage (Optional Enhancement)

**Files:**
- Modify: `apps/pos-app/package.json`

**Step 1: Install coverage package**

Run: `bun add @vitest/coverage-v8 -d` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)

**Step 2: Add coverage config to vitest.config.ts**

Add to the `test` section:

```typescript
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html"],
  include: ["src/**/*.{ts,tsx}"],
  exclude: ["src/test/**", "src/**/*.test.{ts,tsx}", "src/vite-env.d.ts"],
},
```

**Step 3: Run coverage**

Run: `bun run test:coverage` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: Coverage report printed to console

**Step 4: Commit**

```bash
git add apps/pos-app/package.json apps/pos-app/vitest.config.ts
git commit -m "chore(pos-app): add vitest coverage configuration"
```

---

### Task 13: Final Verification

**Step 1: Run all tests**

Run: `bun run test` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: All test files passing

**Step 2: Run lint check**

Run: `bun run lint` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: No errors

**Step 3: Run type check**

Run: `bun run check-types` (workdir: `/home/eekrain/CODE/sakti-pos/apps/pos-app`)
Expected: No errors

---

## Test Summary

| Module | Test Type | Test File |
|--------|-----------|-----------|
| `lib/utils.ts` | Unit | `lib/__test__/utils.test.ts` |
| `lib/toast.ts` | Unit (signals) | `lib/__test__/toast.test.ts` |
| `lib/cart.ts` | Unit (store/memo) | `lib/__test__/cart.test.ts` |
| `lib/auth-provider.ts` | Unit (mocked DB) | `lib/__test__/auth-provider.test.ts` |
| `db/orders.ts` | Unit (mocked DB/invoke) | `db/__test__/orders.test.ts` |
| `components/ui/pinpad.tsx` | Component | `components/ui/__test__/pinpad.test.tsx` |
| `components/daily-summary.tsx` | Component | `components/__test__/daily-summary.test.tsx` |
| `components/order-card.tsx` | Component | `components/__test__/order-card.test.tsx` |
| `components/confirm-drawer.tsx` | Component | `components/__test__/confirm-drawer.test.tsx` |

**Total: ~9 test files, ~40+ test cases**
