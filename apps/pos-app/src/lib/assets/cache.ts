import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/**
 * Resolve an asset ID to a displayable URL.
 *
 * Resolution order: compressed file → preview (if jobId provided) → null.
 * Returns null if the asset is not yet cached locally.
 */
export async function resolveAssetUrl(
  assetId: string | null | undefined,
  jobId?: string | null
): Promise<string | null> {
  if (!assetId) {
    return null;
  }

  const result: { localPath: string } | null = await invoke(
    "plugin:image-pipeline|get_asset_path",
    { assetId, jobId: jobId ?? null }
  );

  if (!result) {
    return null;
  }

  return convertFileSrc(result.localPath);
}
