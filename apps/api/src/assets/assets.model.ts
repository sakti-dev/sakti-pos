import { t } from "elysia";

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
  kind: t.String(),
  contentType: t.String(),
  contentHash: t.String(),
  byteSize: t.Number(),
  assetId: t.Optional(t.String()),
  objectKey: t.Optional(t.String()),
  originalFilename: t.Optional(t.String()),
  width: t.Optional(t.Number()),
  height: t.Optional(t.Number()),
});

export const AssetPresignUploadResponse = t.Object({
  asset: Asset,
  requiredHeaders: t.Array(AssetHeader),
  uploadUrl: t.String(),
});

export const AssetCompleteUploadRequest = t.Object({
  assetId: t.String(),
  objectKey: t.String(),
  contentHash: t.String(),
  byteSize: t.Number(),
});

export const AssetCompleteUploadResponse = t.Object({
  asset: Asset,
});

export const AssetPresignDownloadRequest = t.Object({
  assetId: t.String(),
});

export const AssetPresignDownloadResponse = t.Object({
  downloadUrl: t.String(),
});

export type Asset = typeof Asset.static;
export type AssetHeader = typeof AssetHeader.static;
export type AssetPresignUploadRequest = typeof AssetPresignUploadRequest.static;
export type AssetPresignUploadResponse =
  typeof AssetPresignUploadResponse.static;
export type AssetCompleteUploadRequest =
  typeof AssetCompleteUploadRequest.static;
export type AssetCompleteUploadResponse =
  typeof AssetCompleteUploadResponse.static;
export type AssetPresignDownloadRequest =
  typeof AssetPresignDownloadRequest.static;
export type AssetPresignDownloadResponse =
  typeof AssetPresignDownloadResponse.static;
