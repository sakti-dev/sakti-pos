import { t } from "elysia";
import type { Static } from "typebox";

export const Asset = t.Object({
  id: t.String(),
  merchantId: t.String(),
  objectKey: t.String(),
  kind: t.String(),
  contentType: t.String(),
  contentHash: t.String(),
  byteSize: t.Number(),
  status: t.String(),
  originalFilename: t.Nullable(t.String()),
  width: t.Nullable(t.Number()),
  height: t.Nullable(t.Number()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const AssetHeader = t.Object({
  name: t.String(),
  value: t.String(),
});

export const AssetPresignUploadRequest = t.Object({
  merchantId: t.String(),
  contentType: t.String(),
  assetId: t.Optional(t.String()),
  objectKey: t.Optional(t.String()),
});

export const AssetPresignUploadResponse = t.Object({
  uploadUrl: t.String(),
  objectKey: t.String(),
  requiredHeaders: t.Array(AssetHeader),
});

export const AssetPresignDownloadRequest = t.Object({
  assetId: t.String(),
});

export const AssetPresignDownloadResponse = t.Object({
  downloadUrl: t.String(),
});

export type Asset = Static<typeof Asset>;
export type AssetHeader = Static<typeof AssetHeader>;
export type AssetPresignUploadRequest = Static<
  typeof AssetPresignUploadRequest
>;
export type AssetPresignUploadResponse = Static<
  typeof AssetPresignUploadResponse
>;
export type AssetPresignDownloadRequest = Static<
  typeof AssetPresignDownloadRequest
>;
export type AssetPresignDownloadResponse = Static<
  typeof AssetPresignDownloadResponse
>;
