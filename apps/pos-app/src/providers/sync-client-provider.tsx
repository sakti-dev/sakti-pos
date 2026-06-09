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
import { AuthStorage } from "~/lib/auth/storage";
import { createLogger } from "~/lib/logger";
import { setSyncClient } from "~/lib/sync";
import { setSyncDataVersion } from "~/lib/use-drizzle-query";
import { scopeId } from "~/store/auth";
import { setSyncStatus } from "~/store/sync";

const syncProviderLogger = createLogger({
  domain: "SYNC",
  module: "provider",
});

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

    AuthStorage.getToken().then((token) => {
      if (token) {
        newClient
          .setHeaders({ Authorization: `Bearer ${token}` })
          .then(() => {
            syncProviderLogger.info("headers_set", { hasToken: true });
          })
          .catch((err) => {
            syncProviderLogger.error("headers_set_failed", err, {});
          });
      }
      syncProviderLogger.info("polling_starting", { scope });
      newClient
        .startPolling()
        .then(() => {
          syncProviderLogger.info("polling_started", { scope });
        })
        .catch((err) => {
          syncProviderLogger.error("polling_start_failed", err, { scope });
        });
    });

    const pending = Promise.all([
      listen("baresync://data-changed", async () => {
        setSyncDataVersion((v) => v + 1);
        await queryClient.invalidateQueries({ queryKey: ["drizzle"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        try {
          const state = await newClient.getState();
          syncProviderLogger.info("status_changed", {
            needsBaselineSync: state.needs_baseline_sync,
            localDirtyCount: state.local_dirty_count,
          });
          if (state.local_dirty_count > 0) {
            setSyncStatus("syncing");
          } else {
            setSyncStatus("idle");
          }
        } catch (err) {
          syncProviderLogger.error("status_get_state_failed", err, {});
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
