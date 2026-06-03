import { SYNC_SCOPE } from "@sync-contract/constants";
import { invoke } from "@tauri-apps/api/core";
import { createSyncClient } from "baresync/tauri";

export const syncClient = createSyncClient({ scopeId: SYNC_SCOPE, invoke });
