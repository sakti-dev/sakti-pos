import { useQueryClient } from "@tanstack/solid-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSyncClient, type SyncClient } from "baresync/tauri";
import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  type ParentComponent,
} from "solid-js";
import { SYNC_SCOPE } from "@repo/database/sync-constants";
import { setSyncDataVersion } from "~/lib/use-drizzle-query";
import { setSyncStatus } from "~/store/sync";

const SyncClientContext = createContext<SyncClient>();

export const SyncClientProvider: ParentComponent = (props) => {
  const queryClient = useQueryClient();

  const [client] = createSignal(
    createSyncClient({
      scopeId: SYNC_SCOPE,
      invoke,
    })
  );

  createEffect(() => {
    client().startPolling();
    onCleanup(() => client().stopPolling().catch(() => {}));
  });

  createEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void> | void) | null = null;

    const pending = Promise.all([
      listen("baresync://data-changed", async () => {
        setSyncDataVersion((v) => v + 1);
        await queryClient.invalidateQueries({ queryKey: ["drizzle"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        try {
          const state = await client().getState();
          if (state.needs_baseline_sync || state.local_dirty_count > 0) {
            setSyncStatus("syncing");
          } else {
            setSyncStatus("idle");
          }
        } catch {
          // ignore
        }
      }),
    ]).then(([unlistenDataChanged, unlistenStatusChanged]) => {
      const release = async () => {
        await Promise.all([unlistenDataChanged(), unlistenStatusChanged()]);
      };
      if (disposed) {
        release();
        return;
      }
      cleanup = release;
    });
    pending.catch(() => undefined);

    onCleanup(() => {
      disposed = true;
      if (cleanup) cleanup();
    });
  });

  return (
    <SyncClientContext.Provider value={client()}>
      {props.children}
    </SyncClientContext.Provider>
  );
};

export function useSyncClient(): SyncClient {
  const client = useContext(SyncClientContext);
  if (!client) {
    throw new Error("useSyncClient must be used within SyncClientProvider");
  }
  return client;
}
