import { QueryClient, useQueryClient } from "@tanstack/solid-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSyncClient, type SyncClient } from "baresync/tauri";
import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  type ParentComponent,
  useContext,
} from "solid-js";
import { setSyncClient } from "~/lib/sync";
import { setSyncDataVersion } from "~/lib/use-drizzle-query";
import { scopeId } from "~/store/auth";
import { setSyncStatus } from "~/store/sync";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const SyncClientContext = createContext<SyncClient>();

export const SyncClientProvider: ParentComponent = (props) => {
  const queryClient = useQueryClient();
  const [client, setClient] = createSignal<SyncClient | null>(null);

  createEffect(() => {
    const scope = scopeId();
    if (!scope) {
      return;
    }

    const newClient = createSyncClient({ scopeId: scope, invoke });
    setSyncClient(newClient);
    setClient(newClient);

    newClient.startPolling().catch(() => {});

    const pending = Promise.all([
      listen("baresync://data-changed", async () => {
        setSyncDataVersion((v) => v + 1);
        await queryClient.invalidateQueries({ queryKey: ["drizzle"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        try {
          const state = await newClient.getState();
          if (state.needs_baseline_sync || state.local_dirty_count > 0) {
            setSyncStatus("syncing");
          } else {
            setSyncStatus("idle");
          }
        } catch {
          // ignore
        }
      }),
    ]);

    pending.catch(() => undefined);

    onCleanup(async () => {
      pending.then(([unlistenDataChanged, unlistenStatusChanged]) => {
        unlistenDataChanged();
        unlistenStatusChanged();
      });
      await newClient.stopPolling().catch(() => {});
      setSyncClient(null);
      setClient(null);
    });
  });

  return (
    <SyncClientContext.Provider value={client()!}>
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
