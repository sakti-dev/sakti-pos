import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import {
  currentOutletId,
  DEFAULT_CHARGE_CONFIG,
  type OutletChargeConfig,
  setChargeConfig,
} from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";

const outletLogger = createLogger({
  domain: "SETTINGS",
  module: "outlets",
});

const MIN_PERCENT = 0;
const MAX_PERCENT = 100;

/** Display name of the active outlet, or null when unknown/not loaded. */
export async function getOutletName(): Promise<string | null> {
  const outletId = currentOutletId();
  if (!outletId) {
    return null;
  }
  const rows = await db
    .select({ name: TABLE.outlets.name })
    .from(TABLE.outlets)
    .where(eq(TABLE.outlets.id, outletId));
  return rows[0]?.name ?? null;
}

export function isValidPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PERCENT &&
    value <= MAX_PERCENT
  );
}

/** Persist tax/service-charge config to the outlet row and enqueue it for
 * sync. Updates the session signal + localStorage cache on success. */
export async function saveChargeConfig(
  config: OutletChargeConfig
): Promise<void> {
  const outletId = currentOutletId();
  if (!outletId) {
    throw new Error("saveChargeConfig: no active outlet");
  }
  if (!isValidPercent(config.taxPercentage)) {
    throw new Error("saveChargeConfig: taxPercentage must be an integer 0-100");
  }
  if (!isValidPercent(config.serviceChargePercentage)) {
    throw new Error(
      "saveChargeConfig: serviceChargePercentage must be an integer 0-100"
    );
  }
  const effective: OutletChargeConfig = {
    useTax: config.useTax,
    taxPercentage: config.useTax ? config.taxPercentage : 0,
    useServiceCharge: config.useServiceCharge,
    serviceChargePercentage: config.useServiceCharge
      ? config.serviceChargePercentage
      : 0,
  };
  const now = dayjs().toISOString();

  await getSyncClient().writeTransaction(db, async (tx) => {
    const updated = await tx
      .update(TABLE.outlets)
      .set({
        useTax: effective.useTax,
        taxPercentage: effective.taxPercentage,
        useServiceCharge: effective.useServiceCharge,
        serviceChargePercentage: effective.serviceChargePercentage,
        updatedAt: now,
        isSynced: false,
      })
      .where(eq(TABLE.outlets.id, outletId))
      .returning({ id: TABLE.outlets.id });
    if (updated.length === 0) {
      throw new Error(
        "saveChargeConfig: outlet row is not present locally yet (sync pending); refusing to enqueue a phantom update"
      );
    }
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: outletId,
      table: TABLE.outlets,
    });
  });
  setChargeConfig(effective);
  outletLogger.info("charge_config_saved", {
    useTax: effective.useTax,
    taxPercentage: effective.taxPercentage,
    useServiceCharge: effective.useServiceCharge,
    serviceChargePercentage: effective.serviceChargePercentage,
  });
}

/** Read the outlet row's charge columns into the session (startup hydrate).
 * Falls back silently to the cached config when the row is unreachable. */
export async function hydrateChargeConfigFromDb(): Promise<void> {
  const outletId = currentOutletId();
  if (!outletId) {
    return;
  }
  try {
    const rows = await db
      .select({
        useTax: TABLE.outlets.useTax,
        taxPercentage: TABLE.outlets.taxPercentage,
        useServiceCharge: TABLE.outlets.useServiceCharge,
        serviceChargePercentage: TABLE.outlets.serviceChargePercentage,
      })
      .from(TABLE.outlets)
      .where(eq(TABLE.outlets.id, outletId));
    const row = rows[0];
    if (!row) {
      return;
    }
    setChargeConfig({
      useTax: row.useTax,
      taxPercentage: row.taxPercentage,
      useServiceCharge: row.useServiceCharge,
      serviceChargePercentage: row.serviceChargePercentage,
    });
    outletLogger.info("charge_config_hydrated", {
      useTax: row.useTax,
      taxPercentage: row.taxPercentage,
      useServiceCharge: row.useServiceCharge,
      serviceChargePercentage: row.serviceChargePercentage,
    });
  } catch (err) {
    outletLogger.warn("charge_config_hydrate_failed", {
      error: err instanceof Error ? err.message : String(err),
      fallback: DEFAULT_CHARGE_CONFIG,
    });
  }
}
