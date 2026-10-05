import { createSignal } from "solid-js";
import { eden } from "~/lib/api/eden";
import { runStartupSync } from "~/lib/api/sync";
import { currentOutletId } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";

const startupLogger = createLogger({
  domain: "AUTH",
  module: "startup",
});

const FLAG_PREFIX = "sakti:startup:done:";
const BLOCKING_ATTEMPTS = 2;
const RETRY_DELAY_MS = 800;

/**
 * True while a first-run handshake is in flight — the auth provider gates
 * rendering on this so home never renders without the outlet's wallets.
 * Stays true (nothing to gate) for background runs.
 */
const [startupReady, setStartupReady] = createSignal(true);

const hasCompletedStartup = (outletId: string): boolean =>
  localStorage.getItem(FLAG_PREFIX + outletId) === "1";

const markCompleted = (outletId: string): void => {
  localStorage.setItem(FLAG_PREFIX + outletId, "1");
};

async function callStartup(outletId: string): Promise<void> {
  const result = await eden.api.startup.post({ outletId });
  if (result.error) {
    throw new Error(`startup handshake failed for ${outletId}`);
  }
}

/**
 * Handshake + immediate sync: the handshake may create rows server-side
 * (default wallets) — pull them down now instead of waiting for the poll
 * interval, so home renders with real data.
 */
async function handshake(outletId: string): Promise<void> {
  await callStartup(outletId);
  await runStartupSync();
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Blocking first-run handshake: one retry, then proceed degraded (the
 * server's stateless steps self-heal on the next successful call).
 */
async function runBlocking(outletId: string): Promise<void> {
  setStartupReady(false);
  try {
    for (let attempt = 1; attempt <= BLOCKING_ATTEMPTS; attempt++) {
      try {
        await handshake(outletId);
        markCompleted(outletId);
        startupLogger.info("startup_completed", {
          blocking: true,
          outlet_id: outletId,
        });
        return;
      } catch (error) {
        startupLogger.warn("startup_attempt_failed", {
          attempt,
          outlet_id: outletId,
          reason: error instanceof Error ? error.message : String(error),
        });
        if (attempt < BLOCKING_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }
    startupLogger.warn("startup_degraded", { outlet_id: outletId });
  } finally {
    setStartupReady(true);
  }
}

/** Subsequent runs: fire-and-forget — the endpoint is idempotent. */
function runInBackground(outletId: string): void {
  handshake(outletId)
    .then(() => {
      markCompleted(outletId);
      startupLogger.info("startup_completed", {
        background: true,
        outlet_id: outletId,
      });
    })
    .catch((error: unknown) => {
      startupLogger.warn("startup_background_failed", {
        outlet_id: outletId,
        reason: error instanceof Error ? error.message : String(error),
      });
    });
}

/**
 * Ensure the outlet's server-side invariants via the startup handshake.
 * Called whenever the session + outlet context is ready: the device's
 * first run for the outlet blocks (gated via `startupReady`), every
 * later run goes to the background.
 */
export function ensureStartup(): void {
  const outletId = currentOutletId();
  if (!outletId) {
    return;
  }
  if (hasCompletedStartup(outletId)) {
    runInBackground(outletId);
    return;
  }
  runBlocking(outletId);
}

export const isStartupReady = (): boolean => startupReady();
