import { env } from "cloudflare:workers";
import { assets, userMerchants } from "@repo/database/api-schema";
import {
  AssetCompleteUploadRequest,
  AssetCompleteUploadResponse,
  type AssetHeader,
  AssetPresignDownloadRequest,
  AssetPresignDownloadResponse,
  AssetPresignUploadRequest,
  AssetPresignUploadResponse,
} from "@repo/protobuf/assets";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { v7 as uuidv7 } from "uuid";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { presignS3DownloadUrl, presignS3Url } from "../lib/s3-presign";
import { tsProtoPlugin } from "../lib/ts-proto-plugin";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import { encodeAsset } from "./protobuf";

async function verifyMerchantAccess(
  userId: string,
  merchantId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: userMerchants.id })
    .from(userMerchants)
    .where(
      and(
        eq(userMerchants.userId, userId),
        eq(userMerchants.merchantId, merchantId)
      )
    )
    .limit(1);
  return !!row;
}

function getAssetStorageConfig(): {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  region: string;
  secretAccessKey: string;
} {
  const bucket = env.ASSET_S3_BUCKET;
  const endpoint = env.ASSET_S3_ENDPOINT;
  const accessKeyId = env.ASSET_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.ASSET_S3_SECRET_ACCESS_KEY;
  const region = env.ASSET_S3_REGION ?? "auto";

  if (!(bucket && endpoint && accessKeyId && secretAccessKey)) {
    throw new Error("Asset storage is not configured");
  }

  return { accessKeyId, bucket, endpoint, region, secretAccessKey };
}

function normalizeOptionalString(value: string): string | null {
  return value.trim().length > 0 ? value : null;
}

function normalizeOptionalNumber(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildRequiredHeaders(contentType: string): AssetHeader[] {
  return [{ name: "Content-Type", value: contentType }];
}

function isAssetMetadataCompatible(
  asset: {
    byteSize: number;
    contentHash: string;
    contentType: string;
    kind: string;
    merchantId: string;
    objectKey: string;
  },
  input: {
    byteSize: number;
    contentHash: string;
    contentType: string;
    kind: string;
    merchantId: string;
    objectKey: string;
  }
): boolean {
  return (
    asset.merchantId === input.merchantId &&
    asset.objectKey === input.objectKey &&
    asset.contentHash === input.contentHash &&
    asset.byteSize === input.byteSize &&
    asset.contentType === input.contentType &&
    asset.kind === input.kind
  );
}

export const assetsRoutes = new Elysia({ prefix: "/api/assets" })
  .use(tsProtoPlugin)
  .use(authenticated)
  .post(
    "/presign-upload",
    async ({ body, session, set }) => {
      const request = body as AssetPresignUploadRequest;
      let merchantId: string;
      let kind: string;
      let contentType: string;
      let contentHash: string;
      let byteSize: number;
      try {
        merchantId = requireNonEmptyString(request.merchantId, "merchantId");
        kind = requireNonEmptyString(request.kind, "kind", {
          maxLength: 100,
        });
        contentType = requireNonEmptyString(request.contentType, "contentType");
        contentHash = requireNonEmptyString(request.contentHash, "contentHash");
        byteSize = request.byteSize;
        if (!Number.isFinite(byteSize) || byteSize <= 0) {
          throw new BadRequestError("byteSize harus lebih besar dari 0");
        }
      } catch (error) {
        if (error instanceof BadRequestError) {
          set.status = error.status;
          return { error: error.message };
        }
        throw error;
      }

      throwIfFalse(
        await verifyMerchantAccess(session.userId, merchantId),
        new ForbiddenRequestError()
      );

      const providedAssetId = normalizeOptionalString(request.assetId);
      const providedObjectKey = normalizeOptionalString(request.objectKey);
      const resolvedAssetId = providedAssetId ?? uuidv7();
      const objectKey =
        providedObjectKey ?? `${merchantId}/assets/${resolvedAssetId}`;
      const now = new Date().toISOString();
      const storage = getAssetStorageConfig();
      const [existingAsset] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.merchantId, merchantId),
            eq(assets.objectKey, objectKey)
          )
        )
        .limit(1);

      if (existingAsset) {
        if (
          !isAssetMetadataCompatible(existingAsset, {
            byteSize,
            contentHash,
            contentType,
            kind,
            merchantId,
            objectKey,
          })
        ) {
          set.status = 409;
          return {
            error: "Asset metadata conflicts with existing content hash",
          };
        }

        if (existingAsset.status === "ready") {
          return AssetPresignUploadResponse.create({
            asset: encodeAsset(existingAsset),
            requiredHeaders: [],
            uploadUrl: "",
          });
        }

        const [asset] = await db
          .update(assets)
          .set({
            byteSize,
            contentHash,
            contentType,
            deletedAt: null,
            height: normalizeOptionalNumber(request.height),
            kind,
            merchantId,
            objectKey,
            originalFilename: normalizeOptionalString(request.originalFilename),
            status: "pending_upload",
            updatedAt: now,
            width: normalizeOptionalNumber(request.width),
          })
          .where(eq(assets.id, existingAsset.id))
          .returning();

        const uploadUrl = await presignS3Url({
          accessKeyId: storage.accessKeyId,
          bucket: storage.bucket,
          contentType,
          endpoint: storage.endpoint,
          expiresInSeconds: 900,
          method: "PUT",
          objectKey,
          payloadHash: "UNSIGNED-PAYLOAD",
          region: storage.region,
          secretAccessKey: storage.secretAccessKey,
        });

        return AssetPresignUploadResponse.create({
          asset: encodeAsset(asset),
          requiredHeaders: buildRequiredHeaders(contentType),
          uploadUrl,
        });
      }

      const uploadUrl = await presignS3Url({
        accessKeyId: storage.accessKeyId,
        bucket: storage.bucket,
        contentType,
        endpoint: storage.endpoint,
        expiresInSeconds: 900,
        method: "PUT",
        objectKey,
        payloadHash: "UNSIGNED-PAYLOAD",
        region: storage.region,
        secretAccessKey: storage.secretAccessKey,
      });
      const [asset] = await db
        .insert(assets)
        .values({
          byteSize,
          contentHash,
          contentType,
          createdAt: now,
          id: resolvedAssetId,
          kind,
          merchantId,
          objectKey,
          originalFilename: normalizeOptionalString(request.originalFilename),
          status: "pending_upload",
          updatedAt: now,
          width: normalizeOptionalNumber(request.width),
          height: normalizeOptionalNumber(request.height),
        })
        .returning();

      return AssetPresignUploadResponse.create({
        asset: encodeAsset(asset),
        requiredHeaders: buildRequiredHeaders(contentType),
        uploadUrl,
      });
    },
    {
      proto: {
        req: AssetPresignUploadRequest,
        res: AssetPresignUploadResponse,
      },
    }
  )
  .post(
    "/complete-upload",
    async ({ body, session, set }) => {
      const request = body as AssetCompleteUploadRequest;
      let assetId: string;
      let objectKey: string;
      let contentHash: string;
      let byteSize: number;
      try {
        assetId = requireNonEmptyString(request.assetId, "assetId");
        objectKey = requireNonEmptyString(request.objectKey, "objectKey");
        contentHash = requireNonEmptyString(request.contentHash, "contentHash");
        byteSize = request.byteSize;
        if (!Number.isFinite(byteSize) || byteSize <= 0) {
          throw new BadRequestError("byteSize harus lebih besar dari 0");
        }
      } catch (error) {
        if (error instanceof BadRequestError) {
          set.status = error.status;
          return { error: error.message };
        }
        throw error;
      }

      const [asset] = await db
        .select()
        .from(assets)
        .where(eq(assets.id, assetId))
        .limit(1);

      if (!asset) {
        set.status = 404;
        return { error: "Asset not found" };
      }

      throwIfFalse(
        await verifyMerchantAccess(session.userId, asset.merchantId),
        new ForbiddenRequestError()
      );
      if (
        asset.objectKey !== objectKey ||
        asset.contentHash !== contentHash ||
        asset.byteSize !== byteSize
      ) {
        set.status = 400;
        return { error: "Asset metadata does not match" };
      }

      const now = new Date().toISOString();
      const [readyAsset] = await db
        .update(assets)
        .set({
          status: "ready",
          updatedAt: now,
        })
        .where(eq(assets.id, assetId))
        .returning();

      return AssetCompleteUploadResponse.create({
        asset: encodeAsset(readyAsset),
      });
    },
    {
      proto: {
        req: AssetCompleteUploadRequest,
        res: AssetCompleteUploadResponse,
      },
    }
  )
  .post(
    "/presign-download",
    async ({ body, session, set }) => {
      const request = body as AssetPresignDownloadRequest;
      let assetId: string;
      try {
        assetId = requireNonEmptyString(request.assetId, "assetId");
      } catch (error) {
        if (error instanceof BadRequestError) {
          set.status = error.status;
          return { error: error.message };
        }
        throw error;
      }

      const [asset] = await db
        .select()
        .from(assets)
        .where(eq(assets.id, assetId))
        .limit(1);

      if (!asset) {
        set.status = 404;
        return { error: "Asset not found" };
      }

      throwIfFalse(
        await verifyMerchantAccess(session.userId, asset.merchantId),
        new ForbiddenRequestError()
      );

      const storage = getAssetStorageConfig();
      const downloadUrl = await presignS3DownloadUrl({
        accessKeyId: storage.accessKeyId,
        bucket: storage.bucket,
        endpoint: storage.endpoint,
        expiresInSeconds: 900,
        objectKey: asset.objectKey,
        region: storage.region,
        secretAccessKey: storage.secretAccessKey,
      });

      return AssetPresignDownloadResponse.create({
        downloadUrl,
      });
    },
    {
      proto: {
        req: AssetPresignDownloadRequest,
        res: AssetPresignDownloadResponse,
      },
    }
  );
