import type { SsgoiConfig, SsgoiPathTransition } from "@ssgoi/solid";
import { axis, drill, fade } from "@ssgoi/solid/view-transitions";

/* ── Path groups ─────────────────────────────────────────────────── */

const SHELL_PATHS = ["/", "/transactions", "/pengaturan"] as const;
const FLOW_PATHS = ["/transaction-new", "/payment", "/receipt"] as const;
const AUTH_PATHS = ["/login", "/register", "/pin"] as const;

/* ── Shell ↔ Shell: axis slide ───────────────────────────────────── */

function createShellSlides(): SsgoiPathTransition[] {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 900;
  return axis({
    paths: [...SHELL_PATHS],
    type: isMobile ? "x" : "y",
    variant: isMobile ? "snappy" : "default",
  });
}

/* ── Root config ─────────────────────────────────────────────────── */

export const rootConfig: SsgoiConfig = {
  transitions: [
    // Shell ↔ Shell
    ...createShellSlides(),

    // Flow → Flow: drill parallax
    drill({ enter: "/payment", exit: "/transaction-new", type: "parallax" }),
    drill({ enter: "/receipt", exit: "/payment", type: "parallax" }),

    // Auth ↔ Auth: fade
    fade({ paths: [...AUTH_PATHS] }),

    // Shell → Flow: drill in (any shell page → transaction-new)
    drill({ enter: "/transaction-new", exit: "/", type: "parallax" }),
    drill({ enter: "/transaction-new", exit: "/transactions", type: "parallax" }),
    drill({ enter: "/transaction-new", exit: "/pengaturan", type: "parallax" }),
  ],
};
