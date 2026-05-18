import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import { getSyncStatus } from "~/lib/api/sync";
import { processPendingAssetJobs } from "~/lib/assets/processing";
import { hydrateMissingAssets, uploadPendingAssets } from "~/lib/assets/sync";
import { AuthStorage } from "~/lib/auth/storage";
import { createLogger } from "~/lib/logger";
import { describeError } from "~/lib/utils";
import { currentMerchantId, currentOutletId } from "./outlet";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";
export type SyncMode = "skipped" | "push_only" | "pull_only" | "full";

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
const [lastSyncTime, setLastSyncTime] = createSignal<string | null>(null);
const [lastAssetQueueCount, setLastAssetQueueCount] = createSignal(0);
const syncLogger = createLogger({
  domain: "SYNC",
  module: "sync",
});

export { lastAssetQueueCount, lastSyncTime, syncStatus };

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

let syncInterval: ReturnType<typeof setInterval> | null = null;
let inFlightSync: Promise<SyncNowResult> | null = null;
let followUpSyncRequested = false;
let inFlightAssetHydration: Promise<void> | null = null;
let followUpAssetHydrationRequested = false;

export function startSyncScheduler() {
  if (syncInterval) {
    return;
  }

  syncNow();
  syncInterval = setInterval(() => syncNow(), 5 * 60 * 1000);
}

export function stopSyncScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export interface SyncNowResult {
  mode: SyncMode;
  pull: { rows_received: number; server_time: string };
  purged: number;
  push: {
    server_time: string;
    server_wins_count: number;
    tables_synced: string[];
  };
}

interface LocalSyncState {
  last_server_watermark: string;
  local_dirty_count: number;
  needs_baseline_sync?: boolean;
}

function emptySyncResult(mode: SyncMode): SyncNowResult {
  return {
    mode,
    pull: { rows_received: 0, server_time: "" },
    purged: 0,
    push: { server_time: "", server_wins_count: 0, tables_synced: [] },
  };
}

function withMode(
  result: Omit<SyncNowResult, "mode"> | SyncNowResult,
  mode: SyncMode
) {
  return { ...result, mode };
}

async function uploadPendingProductImages(
  merchantId: string,
  sessionToken: string
): Promise<void> {
  try {
    syncLogger.info("asset_upload_queue_started", { merchantId });
    const queuedCount = await uploadPendingAssets({
      apiUrl: API_URL,
      merchantId,
      sessionToken,
    });
    setLastAssetQueueCount(queuedCount);
    syncLogger.info("asset_upload_queue_finished", {
      merchantId,
      uploadedCount: queuedCount,
    });
  } catch (error) {
    setLastAssetQueueCount(0);
    syncLogger.error("asset_upload_queue_failed", error, { merchantId });
  }
}

async function processPendingAssetProcessingJobs(): Promise<void> {
  try {
    syncLogger.info("asset_processing_jobs_started", {});
    const processedCount = await processPendingAssetJobs({ limit: 20 });
    syncLogger.info("asset_processing_jobs_finished", { processedCount });
  } catch (error) {
    syncLogger.error("asset_processing_jobs_failed", error, {});
  }
}

function hydrateProductImagesInBackground(
  merchantId: string,
  sessionToken: string
): void {
  if (inFlightAssetHydration) {
    followUpAssetHydrationRequested = true;
    return;
  }

  inFlightAssetHydration = drainAssetHydrationRequests(
    merchantId,
    sessionToken
  ).finally(() => {
    inFlightAssetHydration = null;
  });
}

async function drainAssetHydrationRequests(
  merchantId: string,
  sessionToken: string
): Promise<void> {
  do {
    followUpAssetHydrationRequested = false;
    await hydrateProductImagesOnce(merchantId, sessionToken);
  } while (followUpAssetHydrationRequested);
}

async function hydrateProductImagesOnce(
  merchantId: string,
  sessionToken: string
): Promise<void> {
  try {
    syncLogger.info("asset_hydration_started", { merchantId });
    const hydratedCount = await hydrateMissingAssets({
      apiUrl: API_URL,
      merchantId,
      sessionToken,
    });
    syncLogger.info("asset_hydration_finished", {
      hydratedCount,
      merchantId,
    });
  } catch (hydrateError) {
    syncLogger.error("asset_hydration_failed", hydrateError, {
      merchantId,
    });
  }
}

async function invokeSyncTransfer(
  command: "sync_full_resync" | "sync_now" | "sync_pull" | "sync_push",
  params: Record<string, unknown>,
  mode: SyncMode
): Promise<SyncNowResult> {
  const result = await invoke<Omit<SyncNowResult, "mode"> | SyncNowResult>(
    command,
    params
  );
  return withMode(result, mode);
}

export async function syncNow(): Promise<SyncNowResult> {
  if (inFlightSync) {
    followUpSyncRequested = true;
    return await inFlightSync;
  }

  inFlightSync = drainSyncRequests().finally(() => {
    inFlightSync = null;
  });
  return await inFlightSync;
}

async function drainSyncRequests(): Promise<SyncNowResult> {
  let result = await syncNowInner();
  while (followUpSyncRequested) {
    followUpSyncRequested = false;
    result = await syncNowInner();
  }
  return result;
}

function getErrorStatus(error: unknown): number | null {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return null;
}

function classifySyncError(
  error: unknown
): "auth" | "payload_too_large" | "network" | "server" | "unknown" {
  const status = getErrorStatus(error);
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 413) {
    return "payload_too_large";
  }
  if (status !== null && status >= 500) {
    return "server";
  }

  const message = describeError(error).toLowerCase();
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout")
  ) {
    return "network";
  }

  return "unknown";
}

async function syncNowInner(): Promise<SyncNowResult> {
  const outletId = currentOutletId();
  if (!outletId) {
    return emptySyncResult("skipped");
  }

  const sessionToken = await AuthStorage.getToken();
  if (!sessionToken) {
    throw new Error("Sesi tidak ditemukan. Silakan login ulang.");
  }

  setSyncStatus("syncing");
  try {
    const merchantId = currentMerchantId();
    if (merchantId) {
      await processPendingAssetProcessingJobs();
      await uploadPendingProductImages(merchantId, sessionToken);
    }

    const localState = await invoke<LocalSyncState>("get_sync_local_state", {
      outletId,
    });
    const serverStatus = await getSyncStatus({
      cursor: localState.last_server_watermark,
      outletId,
    });
    const hasLocalChanges = localState.local_dirty_count > 0;
    const hasServerChanges = serverStatus.hasChanges;
    const baseParams = {
      apiUrl: API_URL,
      outletId,
      sessionToken,
    };

    syncLogger.info("decision", {
      hasLocalChanges,
      hasServerChanges,
      cursor: serverStatus.cursor,
      localDirtyCount: localState.local_dirty_count,
      needsBaselineSync: localState.needs_baseline_sync ?? false,
      outletId,
    });

    let result: SyncNowResult;
    if (localState.needs_baseline_sync) {
      result = await invokeSyncTransfer(
        "sync_full_resync",
        { ...baseParams, tables: serverStatus.changedTables },
        "full"
      );
    } else if (!(hasLocalChanges || hasServerChanges)) {
      result = emptySyncResult("skipped");
    } else if (hasLocalChanges && hasServerChanges) {
      result = await invokeSyncTransfer(
        "sync_now",
        { ...baseParams, tables: serverStatus.changedTables },
        "full"
      );
    } else if (hasLocalChanges) {
      result = await invokeSyncTransfer("sync_push", baseParams, "push_only");
    } else {
      result = await invokeSyncTransfer(
        "sync_pull",
        { ...baseParams, tables: serverStatus.changedTables },
        "pull_only"
      );
    }

    syncLogger.info("result", {
      mode: result.mode,
      pullRows: result.pull.rows_received,
      pullServerTime: result.pull.server_time,
      purged: result.purged,
      pushServerTime: result.push.server_time,
      serverWins: result.push.server_wins_count,
      tablesSynced: result.push.tables_synced,
    });
    setLastSyncTime(result.pull.server_time);
    if (merchantId) {
      hydrateProductImagesInBackground(merchantId, sessionToken);
    }
    setSyncStatus("idle");
    return result;
  } catch (err) {
    const errorType = classifySyncError(err);
    syncLogger.error("failed", err, { apiUrl: API_URL, errorType, outletId });

    if (errorType === "auth") {
      setSyncStatus("error");
      stopSyncScheduler();
    } else {
      setSyncStatus("offline");
    }

    throw new Error(`Gagal menyinkronkan: ${describeError(err)}`);
  }
}

export async function runStartupSync(): Promise<void> {
  const outletId = currentOutletId();
  if (!outletId) {
    return;
  }

  const sessionToken = await AuthStorage.getToken();
  if (!sessionToken) {
    return;
  }

  setSyncStatus("syncing");
  try {
    await syncNow();
    setSyncStatus("idle");
  } catch {
    setSyncStatus("offline");
  }
}

export function __resetSyncStateForTests() {
  stopSyncScheduler();
  inFlightSync = null;
  followUpSyncRequested = false;
  inFlightAssetHydration = null;
  followUpAssetHydrationRequested = false;
  setSyncStatus("idle");
  setLastSyncTime(null);
  setLastAssetQueueCount(0);
}
