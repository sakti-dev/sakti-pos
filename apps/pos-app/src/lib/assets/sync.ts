import { invoke } from "@tauri-apps/api/core";

export async function hydrateMissingAssets(input: {
  apiUrl: string;
  limit?: number;
  merchantId: string;
  sessionToken: string;
}): Promise<number> {
  return await invoke<number>("hydrate_missing_assets", {
    apiUrl: input.apiUrl,
    limit: input.limit ?? 20,
    merchantId: input.merchantId,
    sessionToken: input.sessionToken,
  });
}

export async function uploadPendingAssets(input: {
  apiUrl: string;
  merchantId: string;
  sessionToken: string;
}): Promise<number> {
  return await invoke<number>("upload_pending_assets", {
    apiUrl: input.apiUrl,
    merchantId: input.merchantId,
    sessionToken: input.sessionToken,
  });
}
