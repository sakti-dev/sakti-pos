import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TabsPrimitive from "@kobalte/core/tabs";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import {
  type ComponentProps,
  createContext,
  createEffect,
  createSignal,
  type JSX,
  on,
  splitProps,
  useContext,
  type ValidComponent,
} from "solid-js";

import { cn } from "~/lib/utils";

/* ════════════════════════════════════════════════════════════════════════
   Shared variant config — used by both TabButton (plain <button>) and
   TabsTrigger (Kobalte). Active state is always `data-[selected]:`,
   so Kobalte sets the attr automatically on triggers, and TabButton
   sets it manually from the `active` prop.
   ════════════════════════════════════════════════════════════════════════ */

export const tabVariants = cva(
  "inline-flex cursor-pointer items-center transition focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        underline:
          "z-10 flex-1 justify-center px-3 py-3 font-medium text-body-sm text-muted-foreground duration-standard ease-standard hover:text-foreground data-[selected]:text-foreground",
        pill: "shrink-0 border-2 font-semibold text-[13px] duration-150",
      },
      tone: {
        primary: "",
        accent: "",
      },
      shape: {
        rounded: "",
        pill: "",
      },
    },
    compoundVariants: [
      {
        variant: "pill",
        shape: "rounded",
        class: "gap-2 whitespace-nowrap rounded-2xl px-[18px] py-2.5",
      },
      {
        variant: "pill",
        shape: "pill",
        class: "gap-1.5 rounded-full px-4 py-[7px]",
      },
      {
        variant: "pill",
        class:
          "border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground data-[selected]:border-primary data-[selected]:shadow-card",
      },
      {
        variant: "pill",
        tone: "primary",
        class:
          "data-[selected]:bg-primary data-[selected]:text-primary-foreground dark:data-[selected]:bg-accent-soft dark:data-[selected]:text-primary",
      },
      {
        variant: "pill",
        tone: "accent",
        class: "data-[selected]:bg-accent-soft data-[selected]:text-primary",
      },
    ],
    defaultVariants: {
      variant: "underline",
      tone: "primary",
      shape: "rounded",
    },
  }
);

/* ════════════════════════════════════════════════════════════════════════
   TabButton — standalone button (plain `<button>`, not tied to Kobalte).
   Sets `data-selected` manually from the `active` prop so the same
   shared `tabVariants` handles the active styling.
   ════════════════════════════════════════════════════════════════════════ */

export interface TabButtonProps {
  readonly active?: boolean;
  readonly "aria-label"?: string;
  readonly children: JSX.Element;
  readonly class?: string;
  readonly onClick: () => void;
  readonly shape?: VariantProps<typeof tabVariants>["shape"];
  readonly tone?: VariantProps<typeof tabVariants>["tone"];
}

export function TabButton(props: TabButtonProps) {
  const [local, others] = splitProps(props, [
    "active",
    "shape",
    "tone",
    "class",
    "children",
  ]);
  return (
    <button
      class={cn(
        tabVariants({
          shape: local.shape,
          tone: local.tone,
          variant: "pill",
        }),
        local.class
      )}
      data-selected={local.active ? "" : undefined}
      type="button"
      {...others}
    >
      {local.children}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Tabs compound — Kobalte-based with WAAPI directional slide animation
   ════════════════════════════════════════════════════════════════════════ */

// ── Animation constants (ssgoi snappy X provider inspired) ──
const SLIDE_PX = 30;
const SLIDE_DURATION = 250;
const SLIDE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

// ── Direction context ──
interface TabsCtx {
  currentSelected: () => string;
  direction: () => number;
  registerValue: (value: string) => void;
}

const TabsContext = createContext<TabsCtx>();

export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  const [direction, setDirection] = createSignal(0);
  const [currentSelected, setCurrentSelected] = createSignal(
    props.value ?? props.defaultValue ?? ""
  );
  const values: string[] = [];
  let prevValue = props.value ?? props.defaultValue ?? "";

  const registerValue = (value: string) => {
    if (!values.includes(value)) {
      values.push(value);
    }
  };

  const computeDirection = (old: string, next: string) => {
    const oldIdx = values.indexOf(old);
    const newIdx = values.indexOf(next);
    if (oldIdx >= 0 && newIdx >= 0) {
      setDirection(newIdx >= oldIdx ? 1 : -1);
    }
  };

  const handleChange = (newValue: string) => {
    computeDirection(prevValue, newValue);
    prevValue = newValue;
    setCurrentSelected(newValue);
    props.onChange?.(newValue);
  };

  createEffect(
    on(
      () => props.value,
      (v) => {
        if (v !== undefined && v !== prevValue) {
          computeDirection(prevValue, v);
          prevValue = v;
          setCurrentSelected(v);
        }
      },
      { defer: true }
    )
  );

  return (
    <TabsContext.Provider value={{ direction, currentSelected, registerValue }}>
      <TabsPrimitive.Root {...props} onChange={handleChange} />
    </TabsContext.Provider>
  );
}

type TabsListProps<T extends ValidComponent = "div"> =
  TabsPrimitive.TabsListProps<T> & {
    class?: string | undefined;
  };

export const TabsList = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TabsListProps<T>>
) => {
  const [local, others] = splitProps(props as TabsListProps, ["class"]);
  return (
    <TabsPrimitive.List
      class={cn("flex items-center", local.class)}
      {...others}
    />
  );
};

export type TabsTriggerProps<T extends ValidComponent = "button"> =
  TabsPrimitive.TabsTriggerProps<T> & {
    class?: string | undefined;
    shape?: VariantProps<typeof tabVariants>["shape"];
    tone?: VariantProps<typeof tabVariants>["tone"];
    variant?: VariantProps<typeof tabVariants>["variant"];
  };

export const TabsTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, TabsTriggerProps<T>>
) => {
  const [local, others] = splitProps(props as TabsTriggerProps, [
    "class",
    "shape",
    "tone",
    "variant",
  ]);
  const ctx = useContext(TabsContext);
  if (ctx && props.value) {
    ctx.registerValue(props.value);
  }
  return (
    <TabsPrimitive.Trigger
      class={cn(
        tabVariants({
          shape: local.shape,
          tone: local.tone,
          variant: local.variant,
        }),
        local.class
      )}
      {...others}
    />
  );
};

type TabsContentProps<T extends ValidComponent = "div"> =
  TabsPrimitive.TabsContentProps<T> & {
    class?: string | undefined;
  };

export const TabsContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TabsContentProps<T>>
) => {
  const [local, others] = splitProps(props as TabsContentProps, ["class"]);
  const ctx = useContext(TabsContext);
  const [el, setEl] = createSignal<HTMLElement>();

  createEffect(
    on(
      () => ctx?.currentSelected(),
      (selected) => {
        if (!selected || selected !== props.value) {
          return;
        }
        const dir = ctx?.direction() ?? 0;
        if (dir === 0) {
          return;
        }
        const target = el();
        if (!target) {
          return;
        }
        target.animate(
          [
            {
              opacity: 0,
              transform: `translate3d(${dir * SLIDE_PX}px, 0, 0)`,
            },
            { opacity: 1, transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: SLIDE_DURATION,
            easing: SLIDE_EASING,
            fill: "forwards",
          }
        );
      },
      { defer: true }
    )
  );

  return (
    <TabsPrimitive.Content
      class={cn("hidden outline-none data-selected:block", local.class)}
      forceMount
      ref={setEl}
      {...others}
    />
  );
};

type TabsIndicatorProps<T extends ValidComponent = "div"> =
  TabsPrimitive.TabsIndicatorProps<T> & {
    class?: string | undefined;
  };

export const TabsIndicator = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TabsIndicatorProps<T>>
) => {
  const [local, others] = splitProps(props as TabsIndicatorProps, ["class"]);
  return (
    <TabsPrimitive.Indicator
      class={cn(
        "absolute transition-all duration-standard ease-[cubic-bezier(0.32,0.72,0,1)] data-[orientation=vertical]:-right-px data-[orientation=horizontal]:-bottom-px data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5",
        local.class
      )}
      {...others}
    />
  );
};
