import type { Asset } from "@repo/protobuf/assets";

export function encodeAsset(row: {
  byteSize: number;
  contentHash: string;
  contentType: string;
  createdAt?: string | null;
  createdByUserId?: string | null;
  deletedAt?: string | null;
  height?: number | null;
  id: string;
  kind: string;
  merchantId: string;
  objectKey: string;
  originalFilename?: string | null;
  status: string;
  updatedAt?: string | null;
  width?: number | null;
}): Asset {
  return {
    byteSize: row.byteSize,
    contentHash: row.contentHash,
    contentType: row.contentType,
    createdAt: row.createdAt ?? "",
    createdByUserId: row.createdByUserId ?? "",
    deletedAt: row.deletedAt ?? "",
    height: row.height ?? 0,
    id: row.id,
    kind: row.kind,
    merchantId: row.merchantId,
    objectKey: row.objectKey,
    originalFilename: row.originalFilename ?? "",
    status: row.status,
    updatedAt: row.updatedAt ?? "",
    width: row.width ?? 0,
  };
}
