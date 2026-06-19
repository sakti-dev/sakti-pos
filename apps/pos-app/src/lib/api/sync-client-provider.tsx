import { QueryClient, useQueryClient } from "@tanstack/solid-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createSyncClient } from "baresync/tauri";
import { createEffect, onCleanup, type ParentComponent } from "solid-js";
import { setSyncClient, setSyncStatus } from "~/lib/api/sync";
import { scopeId } from "~/lib/auth/session";
import { AuthStorage } from "~/lib/auth/storage";
import { createLogger } from "~/lib/utils";

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

export const SyncClientProvider: ParentComponent = (props) => {
  const queryClient = useQueryClient();

  createEffect(() => {
    const scope = scopeId();
    if (!scope) {
      return;
    }

    const newClient = createSyncClient({ scopeId: scope, invoke });
    setSyncClient(newClient);

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
    });
  });

  return props.children;
};
