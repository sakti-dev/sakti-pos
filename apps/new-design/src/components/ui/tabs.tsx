import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TabsPrimitive from "@kobalte/core/tabs";
import {
  createContext,
  createEffect,
  createSignal,
  type ComponentProps,
  on,
  splitProps,
  useContext,
  type ValidComponent,
} from "solid-js";

import { cn } from "~/lib/utils";

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

// ── Tabs Root (wraps Kobalte Root to track slide direction + selection) ──
function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
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

const TabsList = <T extends ValidComponent = "div">(
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

type TabsTriggerProps<T extends ValidComponent = "button"> =
  TabsPrimitive.TabsTriggerProps<T> & {
    class?: string | undefined;
  };

const TabsTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, TabsTriggerProps<T>>
) => {
  const [local, others] = splitProps(props as TabsTriggerProps, ["class"]);
  const ctx = useContext(TabsContext);
  if (ctx && props.value) {
    ctx.registerValue(props.value);
  }
  return (
    <TabsPrimitive.Trigger
      class={cn(
        "z-10 inline-flex items-center justify-center whitespace-nowrap px-3 py-3 font-medium text-body-sm text-muted-foreground transition-colors duration-standard ease-standard hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 data-[selected]:text-foreground",
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

const TabsContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TabsContentProps<T>>
) => {
  const [local, others] = splitProps(props as TabsContentProps, ["class"]);
  const ctx = useContext(TabsContext);
  const [el, setEl] = createSignal<HTMLElement>();

  // forceMount keeps all panels in DOM (refs fire once on initial render).
  // createEffect watches ctx.currentSelected() — when THIS panel becomes
  // active and direction != 0, run WAAPI slide animation.
  // This bypasses the <Show> node-recycling issue entirely.
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
      class={cn("hidden outline-none data-[selected]:block", local.class)}
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

const TabsIndicator = <T extends ValidComponent = "div">(
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

export { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger };
