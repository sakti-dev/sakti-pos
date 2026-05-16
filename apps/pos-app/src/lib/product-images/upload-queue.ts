import { invoke } from "@tauri-apps/api/core";

export async function requestUploadPendingProductImages(input: {
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
