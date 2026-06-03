import { invoke } from "@tauri-apps/api/core";
import { createSyncClient } from "baresync/tauri";
import { SYNC_SCOPE } from "@repo/database/sync-constants";

export const syncClient = createSyncClient({ scopeId: SYNC_SCOPE, invoke });
