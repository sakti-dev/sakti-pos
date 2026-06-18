import type { SsgoiConfig, SsgoiPathTransition } from "@ssgoi/solid";
import { axis, drill, fade } from "@ssgoi/solid/view-transitions";

/* ── Path groups ─────────────────────────────────────────────────── */

const SHELL_PATHS = ["/", "/transactions", "/inventory", "/setting"] as const;
const AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/pin"] as const;

/* ── Root config factory ───────────────────────────────────────────
   Pure: takes the current orientation so the caller can drive it
   reactively (matchMedia). Portrait screens slide on X (feels like
   swiping pages); landscape screens slide on Y (feels like scrolling
   sections). The axis choice is made per-navigation, not cached at
   module load. */
export function createRootConfig(isPortrait: boolean): SsgoiConfig {
  const shellSlides: SsgoiPathTransition[] = isPortrait
    ? axis({ paths: [...SHELL_PATHS], type: "x", variant: "snappy" })
    : axis({ paths: [...SHELL_PATHS], type: "y", variant: "default" });

  return {
    transitions: [
      // Shell ↔ Shell
      ...shellSlides,

      // Flow → Flow: drill parallax
      drill({
        enter: "/transactions/payment",
        exit: "/transactions/cash-register",
        type: "parallax",
      }),
      drill({
        enter: "/transactions/receipt",
        exit: "/transactions/payment",
        type: "parallax",
      }),

      // Auth ↔ Auth: fade
      fade({ paths: [...AUTH_PATHS] }),

      // Shell → Flow: drill in (any shell page → cash-register)
      drill({
        enter: "/transactions/cash-register",
        exit: "/",
        type: "parallax",
      }),
      drill({
        enter: "/transactions/cash-register",
        exit: "/transactions",
        type: "parallax",
      }),
      drill({
        enter: "/transactions/cash-register",
        exit: "/setting",
        type: "parallax",
      }),
      drill({
        enter: "/transactions/cash-register",
        exit: "/inventory",
        type: "parallax",
      }),

      // Shell → Catalog (drill in from dashboard)
      drill({ enter: "/catalog", exit: "/", type: "parallax" }),

      // Setting → section sub-pages (mobile drill-in, like iOS Settings)
      drill({ enter: "/setting/*", exit: "/setting", type: "parallax" }),

      // Catalog → form sub-pages (full-screen drill-in)
      drill({
        enter: "/catalog/category/*",
        exit: "/catalog",
        type: "parallax",
      }),
      drill({
        enter: "/catalog/variant/*",
        exit: "/catalog",
        type: "parallax",
      }),
      drill({
        enter: "/catalog/product/*",
        exit: "/catalog",
        type: "parallax",
      }),

      // Inventory → form sub-pages (full-screen drill-in)
      drill({
        enter: "/inventory/stocktake/*",
        exit: "/inventory",
        type: "parallax",
      }),
      drill({
        enter: "/inventory/goods-receipt/*",
        exit: "/inventory",
        type: "parallax",
      }),
      drill({
        enter: "/inventory/history",
        exit: "/inventory",
        type: "parallax",
      }),
    ],
  };
}
