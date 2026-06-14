import { A } from "@solidjs/router";
import { For } from "solid-js";
import {
  CashRegisterIcon,
  FileIcon,
  GridIcon,
  HomeIcon,
  SettingsIcon,
} from "~/assets";
import { cn } from "~/lib/utils";
import type { NavKey } from "./sidebar";

/* ── Design parameters ───────────────────────────────────────────── */
const BAR_HEIGHT = 64;
const BUTTON_SIZE = 60;
const BUTTON_RADIUS = BUTTON_SIZE / 2; // 30
const GAP = 8; // uniform clearance between button and notch edge
const NOTCH_RADIUS = BUTTON_RADIUS + GAP; // 38 — circle offset from button
const CENTER_WIDTH = 176; // fixed: notch opening (76) + 50px flat on each side

// Bézier control factor — standard circle approximation constant (0.5523)
const K = Math.round(NOTCH_RADIUS * 0.5523); // ≈ 21

/* ── Hardcoded Bézier notch path ───────────────────────────────────
   The notch is a circular arc offset from the BUTTON center (not the
   apex). Previous version centered the Bézier on the apex (cx,depth),
   which made the curve bow inward and intersect the button at the
   midsection (~0.4px clearance → visually touching).

   Correct control points for a quarter-circle centered at the button
   center (CENTER_X, 0) with radius NOTCH_RADIUS:
     P1 = entry point pulled straight DOWN (keeps curve wide)
     P2 = apex point pulled horizontally LEFT (smooth bottom)
   This gives uniform GAP clearance at every point on the curve.

   A small Q-curve lead-in/lead-out smooths the 90° tangent break
   where the arc meets the flat top edge (no sharp corner). */
const ENTRY_X = (CENTER_WIDTH - NOTCH_RADIUS * 2) / 2; // 50
const CENTER_X = CENTER_WIDTH / 2; // 88
const EXIT_X = CENTER_WIDTH - ENTRY_X; // 126
const LEAD = 6; // lead-in/lead-out curve radius for corner smoothing

const NOTCH_PATH = [
  `M0,${BAR_HEIGHT} L0,0 L${ENTRY_X - LEAD},0`,
  // Smooth corner: horizontal → vertical tangent
  `Q${ENTRY_X},0 ${ENTRY_X},${LEAD}`,
  // Left quarter-circle: entry → apex (uniform gap around button)
  `C${ENTRY_X},${K} ${CENTER_X - K},${NOTCH_RADIUS} ${CENTER_X},${NOTCH_RADIUS}`,
  // Right quarter-circle: apex → exit
  `C${CENTER_X + K},${NOTCH_RADIUS} ${EXIT_X},${K} ${EXIT_X},${LEAD}`,
  // Smooth corner: vertical → horizontal tangent
  `Q${EXIT_X},0 ${EXIT_X + LEAD},0`,
  `L${CENTER_WIDTH},0 L${CENTER_WIDTH},${BAR_HEIGHT} Z`,
].join(" ");

interface NotchNavProps {
  readonly active: NavKey;
}

const leftTabs = [
  { key: "home" as NavKey, Icon: HomeIcon, label: "Home", href: "/" },
  {
    key: "transactions" as NavKey,
    Icon: FileIcon,
    label: "Transaksi",
    href: "/transactions",
  },
];

const rightTabs = [
  {
    key: "katalog" as NavKey,
    Icon: GridIcon,
    label: "Katalog",
    href: "/katalog",
  },
  {
    key: "settings" as NavKey,
    Icon: SettingsIcon,
    label: "Pengaturan",
    href: "/pengaturan",
  },
];

export const NotchNav = (props: NotchNavProps) => {
  return (
    <nav
      aria-label="Mobile navigation"
      class="fixed right-0 bottom-0 left-0 z-[100] lg:hidden"
    >
      {/* Bar shape: left wing + center notch SVG + right wing */}
      <div
        class="relative flex items-stretch"
        style={{ height: `${BAR_HEIGHT}px` }}
      >
        <div class="flex-1 bg-card" />
        <svg
          aria-hidden="true"
          class="mt-[-0.2px] -mr-px -ml-px shrink-0"
          height={BAR_HEIGHT}
          viewBox={`0 0 ${CENTER_WIDTH} ${BAR_HEIGHT}`}
          width={CENTER_WIDTH}
        >
          <path d={NOTCH_PATH} fill="var(--color-card)" />
        </svg>
        <div class="flex-1 bg-card" />

        {/* Tab overlay — 4 tabs + transparent center spacer, evenly
           distributed with justify-around. The spacer reserves the
           center button's footprint so Katalog/Pengaturan don't
           overlap the notch gap. */}
        <div class="pointer-events-none absolute inset-0 flex items-center justify-around">
          <For each={leftTabs}>
            {(tab) => <NavTab active={props.active} tab={tab} />}
          </For>
          <div class="shrink-0" style={{ width: `${BUTTON_SIZE + 15}px` }} />
          <For each={rightTabs}>
            {(tab) => <NavTab active={props.active} tab={tab} />}
          </For>
        </div>
      </div>

      {/* Center floating button — sits in the notch */}
      <A
        aria-label="Buat Transaksi"
        class="absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_14px_rgba(0,0,0,0.18)] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95 active:duration-75"
        href="/transaction-new"
        style={{
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          bottom: `${BAR_HEIGHT - BUTTON_RADIUS}px`,
        }}
      >
        <CashRegisterIcon class="h-6 w-6" />
      </A>
    </nav>
  );
};

/* ── Individual tab ──────────────────────────────────────────────── */

function NavTab(props: {
  active: NavKey;
  tab: { key: NavKey; Icon: typeof HomeIcon; label: string; href: string };
}) {
  const isActive = () => props.active === props.tab.key;
  return (
    <A
      class="pointer-events-auto flex w-[56px] flex-col items-center justify-center gap-1 no-underline"
      end={props.tab.key === "home"}
      href={props.tab.href}
    >
      <props.tab.Icon
        class={cn(
          "h-[22px] w-[22px] transition-colors duration-200",
          isActive() ? "text-primary dark:text-accent" : "text-faint-foreground"
        )}
      />
      <span
        class={cn(
          "font-medium text-[10px] tracking-[0.02em] transition-colors duration-200",
          isActive() ? "text-foreground" : "text-faint-foreground"
        )}
      >
        {props.tab.label}
      </span>
    </A>
  );
}
