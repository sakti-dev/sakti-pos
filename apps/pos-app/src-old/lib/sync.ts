import type { SyncClient } from "baresync/tauri";

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
