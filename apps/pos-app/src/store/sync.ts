import { SYNC_SCOPE } from "@repo/database/sync-constants";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSyncClient, type SyncClient } from "baresync/tauri";
import { createSignal } from "solid-js";
import { processPendingAssetJobs } from "~/lib/assets/processing";
import { hydrateMissingAssets, uploadPendingAssets } from "~/lib/assets/sync";
import { AuthStorage } from "~/lib/auth/storage";
import { API_URL } from "~/lib/api/eden";
import { createLogger } from "~/lib/logger";
import { describeError } from "~/lib/utils";
import { currentMerchantId, currentOutletId } from "./outlet";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
const [lastSyncTime, setLastSyncTime] = createSignal<string | null>(null);
const [lastAssetQueueCount, setLastAssetQueueCount] = createSignal(0);
const syncLogger = createLogger({
  domain: "SYNC",
  module: "sync",
});

export { lastAssetQueueCount, lastSyncTime, syncStatus };

let syncClient: SyncClient | null = null;
let cleanupListeners: (() => Promise<void>) | null = null;

export function getSyncClient(): SyncClient {
  if (!syncClient) {
    syncClient = createSyncClient({
      scopeId: SYNC_SCOPE,
      invoke,
    });
  }
  return syncClient;
}

export function startSyncScheduler() {
  const client = getSyncClient();
  client.startPolling();
}

export function stopSyncScheduler() {
  const client = getSyncClient();
  client.stopPolling().catch(() => {});
}

export async function startEventListeners(): Promise<void> {
  if (cleanupListeners) {
    return;
  }

  let disposed = false;
  const unlisteners: (() => Promise<void>)[] = [];

  const unlistenData = await listen("baresync://data-changed", () => {
    syncLogger.info("data_changed", {});
  });
  const unlistenStatus = await listen(
    "baresync://sync-status-changed",
    async () => {
      try {
        const client = getSyncClient();
        const state = await client.getState();
        if (state.needs_baseline_sync) {
          setSyncStatus("syncing");
        } else if (state.local_dirty_count > 0) {
          setSyncStatus("syncing");
        } else {
          setSyncStatus("idle");
        }
        setLastSyncTime(new Date().toISOString());
      } catch {
        // ignore
      }
    }
  );

  unlisteners.push(
    async () => {
      await unlistenData();
    },
    async () => {
      await unlistenStatus();
    }
  );

  cleanupListeners = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const unlisten of unlisteners) {
      await unlisten();
    }
    cleanupListeners = null;
  };
}

export function stopEventListeners(): void {
  if (cleanupListeners) {
    cleanupListeners();
  }
}

interface SyncNowResult {
  mode: string;
  pull: { rows_received: number; server_time: string };
  purged: number;
  push: {
    rejected_tables?: string[];
    server_time: string;
    server_wins_count: number;
    tables_synced: string[];
  };
}

export function formatSyncSuccessMessage(result: SyncNowResult): string {
  if (result.mode === "NoOp") {
    return "Data sudah terbaru";
  }

  if (result.mode === "PullOnly") {
    return `Sinkronisasi berhasil (${result.pull.rows_received} diterima)`;
  }

  const sentTables = result.push.tables_synced.length;
  if (result.mode === "PushOnly") {
    return `Sinkronisasi berhasil (${sentTables} tabel dikirim)`;
  }

  return `Sinkronisasi berhasil (${result.pull.rows_received} diterima, ${sentTables} tabel dikirim, ${result.purged} dibersihkan)`;
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
  drainAssetHydrationRequests(merchantId, sessionToken).catch(() => {});
}

async function drainAssetHydrationRequests(
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

export async function syncNow(): Promise<SyncNowResult> {
  const outletId = currentOutletId();
  if (!outletId) {
    return {
      mode: "NoOp",
      pull: { rows_received: 0, server_time: "" },
      purged: 0,
      push: { server_time: "", server_wins_count: 0, tables_synced: [] },
    };
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

    const client = getSyncClient();
    const result = (await client.syncNow()) as SyncNowResult;

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
    const message = describeError(err);
    syncLogger.error("failed", err, { apiUrl: API_URL, outletId });

    if (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("auth")
    ) {
      setSyncStatus("error");
      stopSyncScheduler();
    } else {
      setSyncStatus("offline");
    }

    throw new Error(`Gagal menyinkronkan: ${message}`);
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
    await startEventListeners();
    startSyncScheduler();
    await syncNow();
    setSyncStatus("idle");
  } catch {
    if (syncStatus() !== "error") {
      setSyncStatus("offline");
    }
  }
}
