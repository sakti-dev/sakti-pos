/**
 * Route zone detection — determines which chrome (sidebar, notch nav, FAB)
 * appears for each route. Keeps routing rules in one place so AppShell stays thin.
 */

// ── Types ──

export type NavKey = "home" | "inventory" | "settings" | "transactions";
export type Zone = "auth" | "flow" | "shell";

// ── Auth routes (full-screen, no app chrome) ──

const AUTH_ROUTES: RegExp[] = [/^\/auth\//];

// ── Flow routes (full-screen, SubPageShell, no sidebar/notch) ──

const FLOW_ROUTES: RegExp[] = [
  /^\/catalog$/,
  /^\/catalog\/(product|variant|category)\//,
  /^\/inventory\/(stocktake|goods-receipt|history)(?:\/.*)?$/,
  /^\/onboarding(?:\/.*)?$/,
  /^\/transactions\/cash-register/,
  /^\/transactions\/payment/,
  /^\/transactions\/receipt/,
];

/** Settings sub-pages are full-screen drill-in on narrow screens */
const SETTING_SUBPAGE_RE = /^\/setting\/.+$/;

// ── Nav mapping ──

const NAV_MAP: Array<{ pattern: RegExp; nav: NavKey }> = [
  { pattern: /^\/$/, nav: "home" },
  { pattern: /^\/transactions$/, nav: "transactions" },
  { pattern: /^\/inventory$/, nav: "inventory" },
  { pattern: /^\/setting/, nav: "settings" },
];

// ── FAB ──

export const FAB_PATHS = ["/", "/transactions"] as const;

// ── Resolvers ──

export function getZone(pathname: string, isWide: boolean): Zone {
  if (AUTH_ROUTES.some((re) => re.test(pathname))) {
    return "auth";
  }
  if (FLOW_ROUTES.some((re) => re.test(pathname))) {
    return "flow";
  }
  if (!isWide && SETTING_SUBPAGE_RE.test(pathname)) {
    return "flow";
  }
  return "shell";
}

export function getNavKey(pathname: string): NavKey {
  for (const { pattern, nav } of NAV_MAP) {
    if (pattern.test(pathname)) {
      return nav;
    }
  }
  return "home";
}
