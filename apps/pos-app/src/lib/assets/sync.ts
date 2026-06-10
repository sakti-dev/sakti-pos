import { uploadPendingAssets } from "./upload";

export { uploadPendingAssets };

// Stub: will be implemented post-baresync cutover
export function hydrateMissingAssets(): Promise<number> {
  return Promise.resolve(0);
}
