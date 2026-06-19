import type { SyncClient } from "baresync/tauri";
import { createSignal } from "solid-js";
import { API_URL } from "~/lib/api/eden";
import { currentMerchantId, currentOutletId } from "~/lib/auth/session";
import { AuthStorage } from "~/lib/auth/storage";
import { createLogger, describeError } from "~/lib/utils";

// --- Sync client singleton ---

let currentClient: SyncClient | null = null;

export function getSyncClient(): SyncClient {
  if (!currentClient) {
    throw new Error(
      "Sync client not initialized. Ensure SyncClientProvider is mounted."
    );
  }
  return currentClient;
}

export function setSyncClient(client: SyncClient | null) {
  currentClient = client;
}

// --- Sync status signals ---

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
const [lastAssetQueueCount, setLastAssetQueueCount] = createSignal(0);
const syncLogger = createLogger({
  domain: "SYNC",
  module: "sync",
});

export { lastAssetQueueCount, setSyncStatus, syncStatus };

interface SyncNowResult {
  mode: string;
  pull: { rows_received: number; server_time: string } | null;
  purged: number;
  push: {
    rejected_tables?: string[];
    server_time: string;
    server_wins_count: number;
    tables_synced: string[];
  } | null;
}

export function formatSyncSuccessMessage(result: SyncNowResult): string {
  if (result.mode === "NoOp") {
    return "Data sudah terbaru";
  }

  if (result.mode === "PullOnly") {
    const rows = result.pull?.rows_received ?? 0;
    return `Sinkronisasi berhasil (${rows} diterima)`;
  }

  const sentTables = result.push?.tables_synced.length ?? 0;
  if (result.mode === "PushOnly") {
    return `Sinkronisasi berhasil (${sentTables} tabel dikirim)`;
  }

  const rows = result.pull?.rows_received ?? 0;
  return `Sinkronisasi berhasil (${rows} diterima, ${sentTables} tabel dikirim, ${result.purged} dibersihkan)`;
}

// --- Asset pipeline (TODO: port lib/assets/* in a separate change) ---

function uploadPendingAssets(
  _merchantId: string,
  _sessionToken: string
): Promise<number> {
  return Promise.resolve(0);
}
function hydrateMissingAssets(): Promise<number> {
  return Promise.resolve(0);
}
function recoverAssets(): Promise<void> {
  return Promise.resolve();
}

async function uploadPendingProductImages(
  merchantId: string,
  sessionToken: string
): Promise<void> {
  try {
    const queuedCount = await uploadPendingAssets(merchantId, sessionToken);
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

function hydrateProductImagesInBackground(
  merchantId: string,
  sessionToken: string
): void {
  drainAssetHydrationRequests(merchantId, sessionToken).catch(() => {});
}

async function drainAssetHydrationRequests(
  merchantId: string,
  _sessionToken: string
): Promise<void> {
  try {
    syncLogger.info("asset_hydration_started", { merchantId });
    const hydratedCount = await hydrateMissingAssets();
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

// --- Orchestration ---

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
    // 1. Core sync: push dirty rows, pull server changes
    const client = getSyncClient();
    await client.setHeaders({ Authorization: `Bearer ${sessionToken}` });
    const raw = (await client.syncNow()) as SyncNowResult | null;

    if (!raw || raw.mode === "NoOp") {
      setSyncStatus("idle");
      return {
        mode: "NoOp",
        pull: { rows_received: 0, server_time: "" },
        purged: 0,
        push: { server_time: "", server_wins_count: 0, tables_synced: [] },
      };
    }

    const result = raw as SyncNowResult;

    syncLogger.info("result", {
      mode: result.mode,
      pullRows: result.pull?.rows_received,
      pullServerTime: result.pull?.server_time,
      purged: result.purged,
      pushServerTime: result.push?.server_time,
      serverWins: result.push?.server_wins_count,
      tablesSynced: result.push?.tables_synced,
    });

    // 2. Upload compressed assets to object storage
    const merchantId = currentMerchantId();
    if (merchantId) {
      await uploadPendingProductImages(merchantId, sessionToken);
    }

    // 3. Hydrate missing assets in the background
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
    await syncNow();
    setSyncStatus("idle");
  } catch {
    if (syncStatus() !== "error") {
      setSyncStatus("offline");
    }
  }

  recoverAssets().catch(() => {});
}
