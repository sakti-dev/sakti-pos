import { env } from "cloudflare:workers";
import { assets, userMerchants } from "@sync-contract/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { v7 as uuidv7 } from "uuid";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { presignS3DownloadUrl, presignS3Url } from "../lib/s3-presign";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import {
  AssetCompleteUploadRequest,
  AssetPresignDownloadRequest,
  AssetPresignUploadRequest,
} from "./assets.model";

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

function safeNumberToNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value)) {
    throw new BadRequestError(`${fieldName} must be a finite number`);
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new BadRequestError(`${fieldName} exceeds safe integer range`);
  }
  if (value < 0) {
    throw new BadRequestError(`${fieldName} must be non-negative`);
  }
  return value;
}

function encodeAsset(row: {
  byteSize: number;
  contentHash: string;
  contentType: string;
  createdAt: string;
  height: number | null;
  id: string;
  kind: string;
  merchantId: string;
  objectKey: string;
  originalFilename: string | null;
  status: string;
  updatedAt: string;
  width: number | null;
}) {
  return {
    id: row.id,
    merchantId: row.merchantId,
    objectKey: row.objectKey,
    kind: row.kind,
    contentType: row.contentType,
    contentHash: row.contentHash,
    byteSize: row.byteSize,
    status: row.status,
    originalFilename: row.originalFilename,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const assetsRoutes = new Elysia({ prefix: "/api/assets" })
  .use(authenticated)
  .post(
    "/presign-upload",
    async ({ body, session, set }) => {
      let merchantId: string;
      let kind: string;
      let contentType: string;
      let contentHash: string;
      let byteSize: number;
      try {
        merchantId = requireNonEmptyString(body.merchantId, "merchantId");
        kind = requireNonEmptyString(body.kind, "kind", {
          maxLength: 100,
        });
        contentType = requireNonEmptyString(body.contentType, "contentType");
        contentHash = requireNonEmptyString(body.contentHash, "contentHash");
        byteSize = safeNumberToNumber(body.byteSize, "byteSize");
        if (byteSize <= 0) {
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

      const providedAssetId = normalizeOptionalString(body.assetId ?? "");
      const providedObjectKey = normalizeOptionalString(body.objectKey ?? "");
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
          existingAsset.merchantId !== merchantId ||
          existingAsset.objectKey !== objectKey ||
          existingAsset.contentHash !== contentHash ||
          existingAsset.byteSize !== byteSize ||
          existingAsset.contentType !== contentType ||
          existingAsset.kind !== kind
        ) {
          set.status = 409;
          return {
            error: "Asset metadata conflicts with existing content hash",
          };
        }

        if (existingAsset.status === "ready") {
          return {
            asset: encodeAsset(existingAsset),
            requiredHeaders: [],
            uploadUrl: "",
          };
        }

        const [asset] = await db
          .update(assets)
          .set({
            byteSize,
            contentHash,
            contentType,
            deletedAt: null,
            height: normalizeOptionalNumber(body.height ?? 0),
            kind,
            merchantId,
            objectKey,
            originalFilename: normalizeOptionalString(
              body.originalFilename ?? ""
            ),
            status: "pending_upload",
            updatedAt: now,
            width: normalizeOptionalNumber(body.width ?? 0),
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

        return {
          asset: encodeAsset(asset),
          requiredHeaders: [{ name: "Content-Type", value: contentType }],
          uploadUrl,
        };
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
          originalFilename: normalizeOptionalString(
            body.originalFilename ?? ""
          ),
          status: "pending_upload",
          syncUpdatedAt: Date.now(),
          updatedAt: now,
          width: normalizeOptionalNumber(body.width ?? 0),
          height: normalizeOptionalNumber(body.height ?? 0),
        })
        .returning();

      return {
        asset: encodeAsset(asset),
        requiredHeaders: [{ name: "Content-Type", value: contentType }],
        uploadUrl,
      };
    },
    {
      body: AssetPresignUploadRequest,
    }
  )
  .post(
    "/complete-upload",
    async ({ body, session, set }) => {
      let assetId: string;
      let objectKey: string;
      let contentHash: string;
      let byteSize: number;
      try {
        assetId = requireNonEmptyString(body.assetId, "assetId");
        objectKey = requireNonEmptyString(body.objectKey, "objectKey");
        contentHash = requireNonEmptyString(body.contentHash, "contentHash");
        byteSize = safeNumberToNumber(body.byteSize, "byteSize");
        if (byteSize <= 0) {
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

      return {
        asset: encodeAsset(readyAsset),
      };
    },
    {
      body: AssetCompleteUploadRequest,
    }
  )
  .post(
    "/presign-download",
    async ({ body, session, set }) => {
      let assetId: string;
      try {
        assetId = requireNonEmptyString(body.assetId, "assetId");
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

      return {
        downloadUrl,
      };
    },
    {
      body: AssetPresignDownloadRequest,
    }
  );
