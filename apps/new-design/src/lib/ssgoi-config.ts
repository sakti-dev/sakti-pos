import type { SsgoiConfig, SsgoiPathTransition } from "@ssgoi/solid";
import { axis, drill, fade } from "@ssgoi/solid/view-transitions";

/* ── Path groups ─────────────────────────────────────────────────── */

const SHELL_PATHS = ["/", "/transactions", "/katalog", "/pengaturan"] as const;
const AUTH_PATHS = ["/login", "/register", "/pin"] as const;

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
      drill({ enter: "/payment", exit: "/transaction-new", type: "parallax" }),
      drill({ enter: "/receipt", exit: "/payment", type: "parallax" }),

      // Auth ↔ Auth: fade
      fade({ paths: [...AUTH_PATHS] }),

      // Shell → Flow: drill in (any shell page → transaction-new)
      drill({ enter: "/transaction-new", exit: "/", type: "parallax" }),
      drill({
        enter: "/transaction-new",
        exit: "/transactions",
        type: "parallax",
      }),
      drill({
        enter: "/transaction-new",
        exit: "/pengaturan",
        type: "parallax",
      }),
      drill({
        enter: "/transaction-new",
        exit: "/katalog",
        type: "parallax",
      }),

      // Pengaturan → section sub-pages (mobile drill-in, like iOS Settings)
      drill({ enter: "/pengaturan/*", exit: "/pengaturan", type: "parallax" }),
    ],
  };
}
