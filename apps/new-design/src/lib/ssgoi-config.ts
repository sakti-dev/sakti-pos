import type { SsgoiConfig, SsgoiPathTransition } from "@ssgoi/solid";
import { axis, drill, fade } from "@ssgoi/solid/view-transitions";

/* ── ordered path transitions ──────────────────────────────────── */

const SHELL_PATHS = ["/", "/transactions", "/pengaturan"] as const;

function createSlideTransitions(): SsgoiPathTransition[] {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 900;

  return axis({
    paths: [...SHELL_PATHS],
    type: isMobile ? "x" : "y",
    variant: isMobile ? "snappy" : "default",
  });
}

/* ── shell config ──────────────────────────────────────────────── */

/**
 * Shell page transition config — used inside AppShell's <main>.
 * Uses SSGOI's built-in axis transition: Y (desktop sidebar) / X (mobile bottom nav).
 */
export const shellConfig: SsgoiConfig = {
  transitions: createSlideTransitions(),
};

/* ── flow config (transaction-new → payment → receipt) ────────── */

/**
 * Transaction flow transition config.
 * drill(parallax): iOS-style hierarchical navigation.
 */
export const flowConfig: SsgoiConfig = {
  transitions: [
    drill({ enter: "/payment", exit: "/transaction-new", type: "parallax" }),
    drill({ enter: "/receipt", exit: "/payment", type: "parallax" }),
  ],
};

/* ── auth config (login ↔ register ↔ pin) ─────────────────────── */

/**
 * Auth page transition config — calm cross-fade between auth pages.
 */
export const authConfig: SsgoiConfig = {
  transitions: [fade({ paths: ["/login", "/register", "/pin"] })],
};
