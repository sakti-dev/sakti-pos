import { createBreakpoints } from "@solid-primitives/media";

/**
 * Reactive breakpoint monitor matching Tailwind v4 breakpoints.
 *
 * Tailwind config (theme.css): sm=600px, lg=900px, xl=1200px.
 * We add md=768px here for the AdaptiveDialog mode switch —
 * it's not a Tailwind class breakpoint, just a JS detection point.
 */
const BREAKPOINTS = {
  sm: "600px",
  md: "768px",
  lg: "900px",
  xl: "1200px",
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

/** Returns a reactive breakpoints object. Access `.md`, `.lg`, etc. */
export function useBreakpoints() {
  return createBreakpoints(BREAKPOINTS);
}
