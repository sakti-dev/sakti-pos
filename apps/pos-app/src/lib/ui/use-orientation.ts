import { createRoot, createSignal } from "solid-js";

/* ── Global orientation signal ─────────────────────────────────────
   Eagerly initialized at module load via createRoot so the signal lives
   for the app's lifetime (no disposal). matchMedia is the CSS-native
   source of truth and updates live on rotation/resize. */

const mql =
  typeof window === "undefined"
    ? null
    : window.matchMedia("(orientation: portrait)");

const [isPortrait, setIsPortrait] = createRoot(() =>
  createSignal(mql?.matches ?? false)
);

if (mql) {
  mql.addEventListener("change", (e) => setIsPortrait(e.matches));
}

/** Returns true when the viewport is in portrait orientation. */
export function useOrientation() {
  return isPortrait;
}
