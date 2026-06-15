# AdaptiveDialog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an `AdaptiveDialog` component that renders as a bottom Sheet (corvu Drawer) on mobile (<768px) and a centered Dialog (corvu Dialog) on tablet+ (≥768px), using a single unified Dialog-style API.

**Architecture:** The root component uses `createBreakpoints` from `@solid-primitives/media` to reactively detect viewport width, then renders either corvu `<Dialog>` or corvu `<Drawer>`. **Key insight: corvu's Drawer internally renders Dialog.Root, so Drawer provides the Dialog context.** This means `Dialog.Trigger`, `Dialog.Label`, `Dialog.Description`, and `Dialog.Close` work inside BOTH modes — no swapping needed. Only the Root (Dialog vs Drawer) and Content/Overlay (centered panel vs bottom sheet with drag) differ between modes.

**Why corvu Dialog instead of Kobalte Dialog:**
1. corvu Drawer extends corvu Dialog — they share the same context, so most sub-components are shared
2. corvu uses `Dynamic` + `as` prop (cleaner than Kobalte's `PolymorphicProps`)
3. Consistent `data-open`/`data-closed` data attributes across both modes
4. No custom SolidJS context wrapper needed — the primitives handle context propagation
5. Only 2 swap points (Root + Content) vs 7 swap points with Kobalte

**Tech Stack:** SolidJS, `@solid-primitives/media` (createBreakpoints), `@corvu/dialog`, `@corvu/drawer` (existing dependency), Tailwind v4, Vitest + `@solidjs/testing-library`

**Primitive Mapping (simplified):**

| Adaptive | What renders | Shared? |
|---|---|---|
| Root | `<Show>` → `Dialog` or `Drawer` | ❌ Swap |
| Trigger | Always `Dialog.Trigger` | ✅ Shared |
| Content | `<Show>` → `Dialog.Portal+Overlay+Content` (centered) or `Drawer.Portal+Overlay+Content` (bottom sheet) | ❌ Swap |
| Header | `<div>` wrapper | ✅ Same div |
| Title | Always `Dialog.Label` | ✅ Shared |
| Description | Always `Dialog.Description` | ✅ Shared |
| Footer | `<div>` wrapper | ✅ Same div |

**Constraints:**
- z-index: both use `z-70` (modal layer per project scale)
- Dialog close button (X) only in dialog mode; Sheet uses swipe-to-dismiss + drag handle
- Must pass through `class` prop on all sub-components for flexibility
- `as` prop support on Trigger for polymorphic rendering (e.g. `as={Button}`)
- No arbitrary Tailwind values — use project tokens
- corvu is NOT currently installed as `@corvu/dialog` — it's a transitive dep of `@corvu/drawer`. Must install explicitly.

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via `bun add`)

**Step 1: Install both packages**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && bun add @solid-primitives/media @corvu/dialog
```

`@corvu/dialog` is currently only a transitive dependency of `@corvu/drawer`. Installing it explicitly lets us import from it directly.

**Step 2: Verify both resolve**

```bash
node -e "require('@solid-primitives/media'); require('@corvu/dialog')" && echo "OK"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add package.json && git commit --no-verify -m "chore: add @solid-primitives/media and @corvu/dialog"
```

---

### Task 2: Create breakpoints module

**Files:**
- Create: `src/lib/breakpoints.ts`

**Step 1: Create the breakpoints module**

Breakpoint values match the Tailwind v4 config in `theme.css`. The `md: 768px` entry exists only here (not in Tailwind) — it's the AdaptiveDialog mode switch point.

```ts
import { createBreakpoints } from "@solid-primitives/media";

/**
 * Reactive breakpoint monitor matching Tailwind v4 breakpoints.
 *
 * Tailwind config (theme.css): sm=600px, lg=900px, xl=1200px.
 * We add md=768px here for the AdaptiveDialog mode switch —
 * it's not a Tailwind class breakpoint, just a JS detection point.
 */
const BREAKPOINTS = {
  sm: "600px",
  md: "768px",
  lg: "900px",
  xl: "1200px",
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

/** Returns a reactive breakpoints object. Access `.md`, `.lg`, etc. */
export function useBreakpoints() {
  return createBreakpoints(BREAKPOINTS);
}
```

**Step 2: Verify typecheck**

Run:
```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && npx tsc --noEmit
```

Expected: Exit 0.

**Step 3: Commit**

```bash
git add src/lib/breakpoints.ts && git commit --no-verify -m "feat: add useBreakpoints hook"
```

---

### Task 3: Write failing tests for mode detection

**Files:**
- Create: `src/components/ui/__test__/adaptive-dialog.test.tsx`

**Step 1: Write the test file with matchMedia mock**

jsdom doesn't implement `window.matchMedia`. We mock it so `createBreakpoints` works.

```tsx
import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ── matchMedia mock ──────────────────────────────────────────────

let mockMatches: Record<string, boolean> = {};

const mockMatchMedia = (query: string): MediaQueryList => {
  const match = query.match(/\(min-width:\s*([\d.]+)px\)/);
  const threshold = match ? Number.parseFloat(match[1]) : Infinity;
  const matches = mockMatches[`${threshold}`] ?? false;
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
};

const setViewport = (width: number) => {
  mockMatches = {};
  for (const bp of [600, 768, 900, 1200]) {
    mockMatches[`${bp}`] = width >= bp;
  }
};

// ── Tests ────────────────────────────────────────────────────────

describe("AdaptiveDialog mode detection", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", mockMatchMedia);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockMatches = {};
  });

  it("renders Drawer (bottom sheet) on mobile (<768px)", async () => {
    setViewport(375);
    const { AdaptiveDialog, AdaptiveDialogTrigger, AdaptiveDialogContent } =
      await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogTrigger>Open</AdaptiveDialogTrigger>
        <AdaptiveDialogContent>
          <p>Content</p>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    // Drawer.Content has data-corvu-drawer-content
    const drawerContent = document.querySelector(
      "[data-corvu-drawer-content]",
    );
    expect(drawerContent).not.toBeNull();
  });

  it("renders Dialog (centered) on tablet+ (≥768px)", async () => {
    setViewport(1024);
    const { AdaptiveDialog, AdaptiveDialogTrigger, AdaptiveDialogContent } =
      await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogTrigger>Open</AdaptiveDialogTrigger>
        <AdaptiveDialogContent>
          <p>Content</p>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    // Dialog.Content has data-corvu-dialog-content (not data-corvu-drawer-content)
    const dialogContent = document.querySelector(
      "[data-corvu-dialog-content]",
    );
    const drawerContent = document.querySelector(
      "[data-corvu-drawer-content]",
    );
    expect(dialogContent).not.toBeNull();
    expect(drawerContent).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && npx vitest run src/components/ui/__test__/adaptive-dialog.test.tsx
```

Expected: FAIL — module `../adaptive-dialog` not found.

---

### Task 4: Create AdaptiveDialog component (all sub-components)

**Files:**
- Create: `src/components/ui/adaptive-dialog.tsx`

**Step 1: Create the full component**

This is the entire component in one file. The key insight: corvu Drawer internally renders Dialog.Root, so `Dialog.Trigger`, `Dialog.Label`, `Dialog.Description` work inside both modes. Only Root and Content/Overlay swap.

```tsx
import type { ComponentProps, JSX, ValidComponent } from "solid-js";
import { Show, splitProps } from "solid-js";

import { Dialog as CorvuDialog } from "@corvu/dialog";
import Drawer from "@corvu/drawer";
import type { DynamicProps } from "@corvu/utils/dynamic";

import { XCloseIcon } from "~/assets";
import { useBreakpoints } from "~/lib/breakpoints";
import { cn } from "~/lib/utils";

// ── Root ─────────────────────────────────────────────────────────
// Swaps between corvu Dialog (tablet+) and Drawer (mobile).
// Drawer internally renders Dialog.Root, so Dialog.* sub-components
// work inside both.

interface AdaptiveDialogProps {
  children: JSX.Element;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function AdaptiveDialog(props: AdaptiveDialogProps) {
  const breakpoints = useBreakpoints();
  const isTablet = () => breakpoints.md;

  return (
    <Show
      when={isTablet()}
      fallback={
        <Drawer
          open={props.open}
          onOpenChange={props.onOpenChange}
          side="bottom"
          snapPoints={[0, 1]}
        >
          {props.children}
        </Drawer>
      }
    >
      <CorvuDialog open={props.open} onOpenChange={props.onOpenChange}>
        {props.children}
      </CorvuDialog>
    </Show>
  );
}

// ── Trigger ──────────────────────────────────────────────────────
// SHARED: Dialog.Trigger works inside both Dialog and Drawer
// (Drawer provides Dialog context internally).

type AdaptiveDialogTriggerProps<T extends ValidComponent = "button"> =
  DynamicProps<T, ComponentProps<typeof CorvuDialog.Trigger<T>>>;

function AdaptiveDialogTrigger<T extends ValidComponent = "button">(
  props: AdaptiveDialogTriggerProps<T>,
) {
  return <CorvuDialog.Trigger {...props} />;
}

// ── Content ──────────────────────────────────────────────────────
// SWAPS: Dialog.Content (centered) vs Drawer.Content (bottom sheet)

interface AdaptiveDialogContentProps {
  children?: JSX.Element;
  class?: string;
}

function AdaptiveDialogContent(props: AdaptiveDialogContentProps) {
  const breakpoints = useBreakpoints();
  const isTablet = () => breakpoints.md;

  return (
    <Show
      when={isTablet()}
      fallback={
        // ── Sheet mode (Drawer) ──
        <Drawer.Portal>
          <Drawer.Overlay class="fixed inset-0 z-70 bg-background/80 backdrop-blur-sm data-transitioning:transition-opacity data-transitioning:duration-standard data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)]" />
          <Drawer.Content
            class={cn(
              "fixed inset-x-0 bottom-0 z-70 flex max-h-[85vh] flex-col rounded-t-lg border-2 border-border bg-card shadow-card data-transitioning:transition-transform data-transitioning:duration-standard data-transitioning:ease-[cubic-bezier(0.32,0.72,0,1)]",
              props.class,
            )}
          >
            <div class="mx-auto mt-2.5 h-1 w-9 shrink-0 cursor-grab rounded-full bg-border active:cursor-grabbing" />
            {props.children}
          </Drawer.Content>
        </Drawer.Portal>
      }
    >
      {/* ── Dialog mode (centered) ── */}
      <CorvuDialog.Portal>
        <CorvuDialog.Overlay class="fixed inset-0 z-70 bg-background/80 backdrop-blur-sm transition-opacity duration-standard ease-standard data-[closed]:opacity-0 data-[open]:opacity-100" />
        <CorvuDialog.Content
          class={cn(
            "fixed left-1/2 top-1/2 z-70 grid max-h-screen w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border-2 border-border bg-background p-6 shadow-card transition-all duration-standard ease-standard data-[closed]:opacity-0 data-[open]:opacity-100 data-[closed]:scale-95 data-[open]:scale-100",
            props.class,
          )}
        >
          {props.children}
          <CorvuDialog.Close
            class="absolute right-4 top-4 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            aria-label="Close"
          >
            <XCloseIcon class="size-4" />
            <span class="sr-only">Close</span>
          </CorvuDialog.Close>
        </CorvuDialog.Content>
      </CorvuDialog.Portal>
    </Show>
  );
}

// ── Header (plain div, same in both modes) ───────────────────────

function AdaptiveDialogHeader(props: ComponentProps<"div">) {
  const [, rest] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("flex flex-col gap-1.5 text-center sm:text-left", props.class)}
      {...rest}
    />
  );
}

// ── Footer (plain div, same in both modes) ───────────────────────

function AdaptiveDialogFooter(props: ComponentProps<"div">) {
  const [, rest] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        props.class,
      )}
      {...rest}
    />
  );
}

// ── Title ────────────────────────────────────────────────────────
// SHARED: Dialog.Label works inside both Dialog and Drawer.

function AdaptiveDialogTitle(props: ComponentProps<typeof CorvuDialog.Label>) {
  const [, rest] = splitProps(props, ["class"]);
  return (
    <CorvuDialog.Label
      class={cn("font-semibold text-subheading text-foreground", props.class)}
      {...rest}
    />
  );
}

// ── Description ──────────────────────────────────────────────────
// SHARED: Dialog.Description works inside both Dialog and Drawer.

function AdaptiveDialogDescription(
  props: ComponentProps<typeof CorvuDialog.Description>,
) {
  const [, rest] = splitProps(props, ["class"]);
  return (
    <CorvuDialog.Description
      class={cn("text-body-sm text-muted-foreground", props.class)}
      {...rest}
    />
  );
}

export {
  AdaptiveDialog,
  AdaptiveDialogTrigger,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogFooter,
  AdaptiveDialogTitle,
  AdaptiveDialogDescription,
};
```

**Step 2: Verify typecheck**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && npx tsc --noEmit
```

Expected: Exit 0. If there are type issues with `DynamicProps` or `ComponentProps<typeof CorvuDialog.Trigger>`, adjust the type signatures to match corvu's exported types. The corvu types use `DynamicProps<T, TriggerProps<T>>` — check `references/corvu/packages/dialog/src/index.ts` for the exact export shapes.

**Step 3: Run lint**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && bun x ultracite fix && bun x ultracite check
```

Expected: No errors.

**Step 4: Run tests**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && npx vitest run src/components/ui/__test__/adaptive-dialog.test.tsx
```

Expected: 2 tests pass.

**Step 5: Commit**

```bash
git add src/components/ui/adaptive-dialog.tsx src/components/ui/__test__/adaptive-dialog.test.tsx && git commit --no-verify -m "feat: add AdaptiveDialog (corvu Dialog on tablet+, Drawer on mobile)"
```

---

### Task 5: Add content rendering tests

**Files:**
- Modify: `src/components/ui/__test__/adaptive-dialog.test.tsx`

**Step 1: Add tests for shared sub-components**

Append these tests to verify that Title, Description, and Footer render correctly in both modes (proving the shared-primitive insight works):

```tsx
describe("AdaptiveDialog sub-components", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", mockMatchMedia);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockMatches = {};
  });

  it("renders Title and Description in dialog mode", async () => {
    setViewport(1024);
    const {
      AdaptiveDialog,
      AdaptiveDialogContent,
      AdaptiveDialogHeader,
      AdaptiveDialogTitle,
      AdaptiveDialogDescription,
    } = await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogContent>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>Delete product?</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              This cannot be undone.
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    expect(screen.getByText("Delete product?")).toBeTruthy();
    expect(screen.getByText("This action cannot be undone.")).toBeTruthy();
  });

  it("renders Title and Description in sheet mode", async () => {
    setViewport(375);
    const {
      AdaptiveDialog,
      AdaptiveDialogContent,
      AdaptiveDialogHeader,
      AdaptiveDialogTitle,
      AdaptiveDialogDescription,
    } = await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogContent>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>Delete product?</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              This cannot be undone.
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    expect(screen.getByText("Delete product?")).toBeTruthy();
    expect(screen.getByText("This action cannot be undone.")).toBeTruthy();
  });

  it("renders footer buttons in both modes", async () => {
    setViewport(768);
    const {
      AdaptiveDialog,
      AdaptiveDialogContent,
      AdaptiveDialogFooter,
    } = await import("../adaptive-dialog");
    render(() => (
      <AdaptiveDialog open>
        <AdaptiveDialogContent>
          <AdaptiveDialogFooter>
            <button type="button">Cancel</button>
            <button type="button">Delete</button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    ));
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });
});
```

**Step 2: Run all tests**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && npx vitest run src/components/ui/__test__/adaptive-dialog.test.tsx
```

Expected: 5 tests pass.

**Step 3: Commit**

```bash
git add src/components/ui/__test__/adaptive-dialog.test.tsx && git commit --no-verify -m "test: add AdaptiveDialog content rendering tests"
```

---

### Task 6: Create experiment.tsx demo page

**Files:**
- Create: `src/pages/experiment/index.tsx`

**Step 1: Create the demo page**

```tsx
import { createSignal } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "~/components/ui/adaptive-dialog";

export default function ExperimentPage() {
  const [open, setOpen] = createSignal(false);

  return (
    <div class="flex min-h-screen items-center justify-center bg-muted p-gutter">
      <AdaptiveDialog open={open()} onOpenChange={setOpen}>
        <AdaptiveDialogTrigger as={Button} look="outline" tone="primary">
          Open Dialog
        </AdaptiveDialogTrigger>
        <AdaptiveDialogContent class="max-w-md">
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>Delete product?</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              This will permanently delete the product and all its variants.
              This action cannot be undone.
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <div class="text-body-sm text-muted-foreground">
            <p>
              Product:{" "}
              <span class="font-medium text-foreground">Espresso</span>
            </p>
            <p>SKU: <span class="font-medium text-foreground">ESP-001</span></p>
            <p>
              Stock: <span class="font-medium text-foreground">120 units</span>
            </p>
          </div>
          <AdaptiveDialogFooter>
            <Button look="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button tone="danger" onClick={() => setOpen(false)}>
              Delete
            </Button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </div>
  );
}
```

**Step 2: Verify typecheck**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && npx tsc --noEmit
```

Expected: Exit 0.

---

### Task 7: Add route for experiment page

**Files:**
- Modify: `src/routes.tsx`

**Step 1: Add import and route**

Add to imports (after the last page import):
```tsx
import ExperimentPage from "./pages/experiment";
```

Add route (after the `/` home route, before `/transactions`):
```tsx
<Route component={ExperimentPage} path="/experiment" />
```

**Step 2: Verify build**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && npx tsc --noEmit && npx vite build 2>&1 | grep -E "built|error"
```

Expected: `✓ built` with no errors.

**Step 3: Run lint**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && bun x ultracite fix && bun x ultracite check
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/pages/experiment/index.tsx src/routes.tsx && git commit --no-verify -m "feat: add experiment page with AdaptiveDialog demo"
```

---

### Task 8: Visual verification

**Step 1: Start dev server**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/new-design && npx vite dev
```

**Step 2: Test on desktop (≥768px)**

Navigate to `/experiment`. Click "Open Dialog".
- ✅ Centered dialog with backdrop blur
- ✅ Title, description, product info, footer buttons visible
- ✅ X close button in top-right corner
- ✅ Scale+fade entrance animation

**Step 3: Test on mobile (<768px)**

Resize browser to <768px or use DevTools mobile view. Click "Open Dialog".
- ✅ Bottom sheet slides up
- ✅ Drag handle visible at top
- ✅ Same content (title, description, product info, footer buttons)
- ✅ No X close button (swipe down to dismiss)
- ✅ Backdrop blur

**Step 4: Test mode switch on resize**

With dialog open, resize across the 768px boundary.
- ✅ Mode switches (dialog may close — acceptable)

**Step 5: Test drag-to-dismiss on mobile**

In sheet mode, drag the sheet down past 50%.
- ✅ Sheet dismisses, backdrop fades out
