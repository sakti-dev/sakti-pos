import {
  TbOutlineCloud,
  TbOutlineCloudOff,
  TbOutlineCloudUpload,
  TbOutlineLoader2,
} from "solid-icons/tb";
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { createLogger } from "~/lib/logger";
import { cn } from "~/lib/utils";
import {
  formatSyncSuccessMessage,
  lastAssetQueueCount,
  syncNow,
  syncStatus,
} from "~/store/sync";

const syncStatusLogger = createLogger({
  domain: "SYNC",
  module: "sync",
  scope: "header",
});

function readOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function SyncStatusIndicator() {
  const [isOnline, setIsOnline] = createSignal(readOnlineStatus());

  onMount(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    onCleanup(() => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    });
  });

  const status = () => syncStatus();
  const isUnavailable = createMemo(
    () => !isOnline() || status() === "offline" || status() === "error"
  );
  const isSyncing = createMemo(() => status() === "syncing");
  const hasQueuedUploads = createMemo(
    () => status() === "idle" && lastAssetQueueCount() > 0
  );
  const buttonLabel = createMemo(() =>
    isSyncing() ? "Sedang menyinkronkan" : "Sinkronkan"
  );

  const handleSyncClick = async () => {
    if (isSyncing()) {
      return;
    }

    syncStatusLogger.info("manual_sync_requested", {
      browserOnline: isOnline(),
      status: status(),
    });
    try {
      const result = await syncNow();
      syncStatusLogger.info("manual_sync_succeeded", {
        mode: result.mode,
        pullRows: result.pull?.rows_received,
        serverWins: result.push?.server_wins_count,
        tablesSynced: result.push?.tables_synced,
      });
      toast.success(formatSyncSuccessMessage(result));
    } catch (error) {
      syncStatusLogger.error("manual_sync_failed", error, {
        browserOnline: isOnline(),
        status: status(),
      });
      toast.error("Gagal menyinkronkan, periksa koneksi internet");
    }
  };

  return (
    <button
      aria-label={buttonLabel()}
      class={cn(
        "flex size-10 items-center justify-center rounded-lg transition-colors",
        isSyncing()
          ? "cursor-wait"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
      disabled={isSyncing()}
      onClick={handleSyncClick}
      title={buttonLabel()}
      type="button"
    >
      <Show
        fallback={
          hasQueuedUploads() ? (
            <TbOutlineCloudUpload class="size-5 text-primary" />
          ) : (
            <TbOutlineCloud class="size-5 text-muted-foreground" />
          )
        }
        when={isSyncing() || isUnavailable()}
      >
        <Show
          fallback={
            <TbOutlineCloudOff
              class={cn(
                "size-5",
                status() === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            />
          }
          when={isSyncing()}
        >
          <TbOutlineLoader2 class="size-5 animate-spin text-primary" />
        </Show>
      </Show>
    </button>
  );
}
