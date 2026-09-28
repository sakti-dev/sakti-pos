import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import { createLogger } from "~/lib/utils";

const logger = createLogger({ domain: "QRIS", module: "detection" });

const MONITORED_PACKAGES_STORAGE_KEY = "sakti-pos:qris-monitored-packages";
const INSTALLED_APPS_CACHE_KEY = "sakti-pos:qris-installed-apps";
const NOTIFICATION_ACCESS_CACHE_KEY =
  "sakti-pos:qris-notification-access-granted";
const SLOW_ICON_THRESHOLD_MS = 100;

const elapsedMs = (startedAt: number): number =>
  Math.round(performance.now() - startedAt);

export interface QrisAppInfo {
  readonly appName: string;
  readonly packageName: string;
}

export interface QrisPaymentEvent {
  readonly amountRupiah: number;
  readonly appLabel: string;
  readonly packageName: string;
  readonly postTimeMillis: number;
  readonly rawText: string;
}

export type EventMatchStatus = "match" | "mismatch" | "stale";

export interface EventMatch {
  readonly event: QrisPaymentEvent;
  readonly status: EventMatchStatus;
}

export const eventKey = (event: QrisPaymentEvent): string =>
  `${event.packageName}:${event.postTimeMillis}:${event.amountRupiah}`;

export const mergeEvents = (
  existing: readonly QrisPaymentEvent[],
  incoming: readonly QrisPaymentEvent[]
): QrisPaymentEvent[] => {
  const byKey = new Map(existing.map((event) => [eventKey(event), event]));
  for (const event of incoming) {
    byKey.set(eventKey(event), event);
  }
  return [...byKey.values()].sort(
    (a, b) => a.postTimeMillis - b.postTimeMillis
  );
};

export const evaluateEvents = (
  events: readonly QrisPaymentEvent[],
  pendingTotalRupiah: number,
  sessionAnchorMillis: number | null
): EventMatch[] =>
  events.map((event) => {
    if (event.amountRupiah !== pendingTotalRupiah) {
      return { event, status: "mismatch" satisfies EventMatchStatus };
    }
    const anchored =
      sessionAnchorMillis !== null &&
      event.postTimeMillis >= sessionAnchorMillis;
    return {
      event,
      status: anchored
        ? ("match" satisfies EventMatchStatus)
        : ("stale" satisfies EventMatchStatus),
    };
  });

export const newestMatch = (
  matches: readonly EventMatch[]
): EventMatch | null => {
  let newest: EventMatch | null = null;
  for (const match of matches) {
    if (match.status !== "match") {
      continue;
    }
    if (
      newest === null ||
      match.event.postTimeMillis >= newest.event.postTimeMillis
    ) {
      newest = match;
    }
  }
  return newest;
};

const sortApps = (apps: readonly QrisAppInfo[]): QrisAppInfo[] =>
  [...apps].sort((a, b) => a.appName.localeCompare(b.appName));

const persistInstalledAppsCache = (apps: readonly QrisAppInfo[]): void => {
  try {
    window.localStorage.setItem(
      INSTALLED_APPS_CACHE_KEY,
      JSON.stringify(apps.map((app) => [app.appName, app.packageName]))
    );
  } catch (error) {
    logger.warn("APP_LIST_CACHE_WRITE_FAILED", { error: String(error) });
  }
};

export const readCachedInstalledApps = (): QrisAppInfo[] => {
  try {
    const raw = window.localStorage.getItem(INSTALLED_APPS_CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const apps = parsed.flatMap((entry): QrisAppInfo[] => {
      if (
        Array.isArray(entry) &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string"
      ) {
        return [{ appName: entry[0], packageName: entry[1] }];
      }
      return [];
    });
    return sortApps(apps);
  } catch {
    return [];
  }
};

export const listInstalledApps = async (): Promise<QrisAppInfo[]> => {
  const startedAt = performance.now();
  const apps = await invoke<QrisAppInfo[]>("qris_get_installed_apps");
  logger.info("APP_LIST_LOADED", {
    count: apps.length,
    durationMs: elapsedMs(startedAt),
  });
  const sorted = sortApps(apps);
  persistInstalledAppsCache(sorted);
  return sorted;
};

/**
 * Warm the installed-apps cache in the background so the settings section
 * can render from cache even on the first navigation of a session. The
 * invoke can queue for seconds behind Android main-thread work right after
 * boot, so callers must not await this on any interactive path.
 */
export const warmInstalledAppsCache = async (): Promise<void> => {
  try {
    await listInstalledApps();
    logger.info("APP_LIST_CACHE_WARMED", {
      count: readCachedInstalledApps().length,
    });
  } catch (error) {
    logger.warn("APP_LIST_CACHE_WARM_FAILED", { error: String(error) });
  }
};

const ICON_HYDRATION_CONCURRENCY = 3;

const iconCache = new Map<string, string>();
const failedIcons = new Set<string>();
const hydrated = new Set<string>();
let hydrating = false;

const [appIcons, setAppIcons] = createSignal<ReadonlyMap<string, string>>(
  new Map()
);

export { appIcons };

/**
 * Fetch app icons one by one after the list has rendered so the initial
 * navigation and paint never wait on icon encoding. Results are cached for
 * the app lifetime; failures are remembered so they are not retried.
 */
export const hydrateAppIcons = async (
  apps: readonly QrisAppInfo[]
): Promise<void> => {
  if (hydrating) {
    return;
  }
  hydrating = true;
  try {
    const queue = apps
      .map((app) => app.packageName)
      .filter((packageName) => !hydrated.has(packageName));
    for (const packageName of queue) {
      hydrated.add(packageName);
    }
    const requested = queue.length;
    const startedAt = performance.now();
    let fetched = 0;
    let failed = 0;
    let maxMs = 0;
    let totalMs = 0;
    const workers = Array.from(
      { length: Math.min(ICON_HYDRATION_CONCURRENCY, queue.length) },
      async () => {
        for (;;) {
          const packageName = queue.shift();
          if (packageName === undefined) {
            return;
          }
          const iconStartedAt = performance.now();
          try {
            const iconDataUrl = await invoke<string | null>(
              "qris_get_app_icon",
              { packageName }
            );
            const duration = elapsedMs(iconStartedAt);
            fetched++;
            totalMs += duration;
            maxMs = Math.max(maxMs, duration);
            if (duration > SLOW_ICON_THRESHOLD_MS) {
              logger.warn("APP_ICON_SLOW", {
                packageName,
                durationMs: duration,
              });
            }
            if (iconDataUrl === null) {
              failedIcons.add(packageName);
            } else {
              iconCache.set(packageName, iconDataUrl);
              setAppIcons(new Map(iconCache));
            }
          } catch (error) {
            logger.warn("APP_ICON_FETCH_FAILED", {
              packageName,
              error: String(error),
            });
            failedIcons.add(packageName);
            failed++;
          }
        }
      }
    );
    await Promise.all(workers);
    logger.info("ICONS_HYDRATED", {
      requested,
      fetched,
      failed,
      totalMs: elapsedMs(startedAt),
      maxSingleMs: maxMs,
      avgSingleMs: fetched > 0 ? Math.round(totalMs / fetched) : 0,
    });
  } finally {
    hydrating = false;
  }
};

export const readStoredMonitoredPackages = (): string[] => {
  try {
    const raw = window.localStorage.getItem(MONITORED_PACKAGES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
};

const writeStoredMonitoredPackages = (packages: readonly string[]): void => {
  try {
    window.localStorage.setItem(
      MONITORED_PACKAGES_STORAGE_KEY,
      JSON.stringify(packages)
    );
  } catch (error) {
    logger.warn("MONITORED_PACKAGES_STORE_WRITE_FAILED", {
      error: String(error),
    });
  }
};

export const getNativeMonitoredPackages = async (): Promise<string[]> =>
  await invoke<string[]>("qris_get_allowed_packages");

export const saveMonitoredPackages = async (
  packages: readonly string[]
): Promise<void> => {
  writeStoredMonitoredPackages(packages);
  await invoke("qris_set_allowed_packages", { packages: [...packages] });
  logger.info("MONITORED_PACKAGES_SAVED", { count: packages.length });
};

export const syncStoredPackagesToNative = async (): Promise<void> => {
  const stored = readStoredMonitoredPackages();
  if (stored.length === 0) {
    return;
  }
  const startedAt = performance.now();
  try {
    await invoke("qris_set_allowed_packages", { packages: stored });
    logger.info("MONITORED_PACKAGES_SYNCED_TO_NATIVE", {
      count: stored.length,
      durationMs: elapsedMs(startedAt),
    });
  } catch (error) {
    logger.error("MONITORED_PACKAGES_SYNC_TO_NATIVE_FAILED", String(error));
  }
};

export const readCachedNotificationAccess = (): boolean | null => {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_ACCESS_CACHE_KEY);
    return raw === null ? null : raw === "true";
  } catch {
    return null;
  }
};

export const isNotificationAccessGranted = async (): Promise<boolean> => {
  const granted = await invoke<boolean>("qris_is_notification_access_granted");
  try {
    window.localStorage.setItem(
      NOTIFICATION_ACCESS_CACHE_KEY,
      granted ? "true" : "false"
    );
  } catch {
    // Cache write is best-effort; the live value still returns.
  }
  return granted;
};

export const openNotificationAccessSettings = async (): Promise<void> => {
  await invoke("qris_open_notification_access_settings");
};

const [paymentEvents, setPaymentEvents] = createSignal<
  readonly QrisPaymentEvent[]
>([]);

export { paymentEvents };

const drainPaymentEvents = async (): Promise<void> => {
  const startedAt = performance.now();
  try {
    const events = await invoke<QrisPaymentEvent[]>("qris_get_recent_events");
    if (events.length > 0) {
      logger.info("EVENT_DRAINED", {
        count: events.length,
        durationMs: elapsedMs(startedAt),
      });
    }
    setPaymentEvents((current) => mergeEvents(current, events));
  } catch (error) {
    logger.warn("EVENT_DRAIN_FAILED", { error: String(error) });
  }
};

export const refreshPaymentEvents = drainPaymentEvents;

let captureStarted = false;

export const startPaymentEventCapture = (): void => {
  if (captureStarted) {
    return;
  }
  captureStarted = true;
  drainPaymentEvents().catch(() => {
    captureStarted = false;
  });
  addPluginListener<QrisPaymentEvent>(
    "qris-bridge",
    "payment-event",
    (event) => {
      logger.info("EVENT_RECEIVED", {
        packageName: event.packageName,
        amountRupiah: event.amountRupiah,
      });
      setPaymentEvents((current) => mergeEvents(current, [event]));
    }
  ).catch((error: unknown) => {
    logger.warn("EVENT_LISTENER_REGISTER_FAILED", { error: String(error) });
  });
};

let sessionAnchorMillis: number | null = null;

export const beginPaymentSession = (): void => {
  sessionAnchorMillis = Date.now();
  logger.info("SESSION_BEGUN", { anchorMillis: sessionAnchorMillis });
};

export const endPaymentSession = (): void => {
  sessionAnchorMillis = null;
};

export const getSessionAnchor = (): number | null => sessionAnchorMillis;
