import type { SsgoiConfig, SsgoiPathTransition } from "@ssgoi/solid";
import { axis, fade, sheet } from "@ssgoi/solid/view-transitions";

/* ── Path groups ─────────────────────────────────────────────────── */

const SHELL_PATHS = ["/", "/transactions", "/pengaturan"] as const;
const AUTH_PATHS = ["/login", "/register", "/pin"] as const;

/* ── Shell ↔ Shell: axis slide ───────────────────────────────────── */

function createShellSlides(): SsgoiPathTransition[] {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 900;
  if (isMobile) {
    return axis({ paths: [...SHELL_PATHS], type: "x", variant: "snappy" });
  }
  return axis({ paths: [...SHELL_PATHS], type: "y", variant: "default" });
}

/* ── Root config ─────────────────────────────────────────────────── */

export const rootConfig: SsgoiConfig = {
  transitions: [
    // Shell ↔ Shell
    ...createShellSlides(),

    // Flow → Flow: sheet scale (rises from bottom, bg scales behind)
    sheet({ enter: "/payment", exit: "/transaction-new", type: "scale" }),
    sheet({ enter: "/receipt", exit: "/payment", type: "scale" }),

    // Auth ↔ Auth: fade
    fade({ paths: [...AUTH_PATHS] }),

    // Shell → Flow: sheet in (any shell page → transaction-new)
    sheet({ enter: "/transaction-new", exit: "/", type: "scale" }),
    sheet({ enter: "/transaction-new", exit: "/transactions", type: "scale" }),
    sheet({ enter: "/transaction-new", exit: "/pengaturan", type: "scale" }),
  ],
};
