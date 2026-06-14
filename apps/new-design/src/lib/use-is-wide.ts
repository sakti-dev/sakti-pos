import { createRoot, createSignal } from "solid-js";

/* ── Global viewport-width signal ──────────────────────────────────
   Matches the lg breakpoint (--breakpoint-lg: 56.25rem = 900px).
   Below 900px the layout is single-column and should use the mobile
   drill-in behavior regardless of physical orientation. */

const mql =
  typeof window === "undefined"
    ? null
    : window.matchMedia("(min-width: 56.25rem)");

const [isWide, setIsWide] = createRoot(() =>
  createSignal(mql?.matches ?? false)
);

if (mql) {
  mql.addEventListener("change", (e) => setIsWide(e.matches));
}

/** Returns true when viewport is ≥ 900px (lg breakpoint). */
export function useIsWide() {
  return isWide;
}
