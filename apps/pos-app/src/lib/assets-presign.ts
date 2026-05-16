import {
  AssetPresignDownloadRequest,
  AssetPresignDownloadResponse,
} from "@repo/protobuf/assets";
import { protoFetch } from "~/lib/api/client";
import type { PresignedDownloadAsset } from "./assets/types";

export async function presignAssetDownload(input: {
  assetId: string;
}): Promise<PresignedDownloadAsset> {
  return await protoFetch(
    "api/assets/presign-download",
    { req: AssetPresignDownloadRequest, res: AssetPresignDownloadResponse },
    { assetId: input.assetId }
  );
}
