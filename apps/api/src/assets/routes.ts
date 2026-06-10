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

export const assetsRoutes = new Elysia({ prefix: "/api/assets" })
  .use(authenticated)
  .post(
    "/presign-upload",
    async ({ body, session, set }) => {
      let merchantId: string;
      let contentType: string;
      try {
        merchantId = requireNonEmptyString(body.merchantId, "merchantId");
        contentType = requireNonEmptyString(body.contentType, "contentType");
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

      const objectKey =
        normalizeOptionalString(body.objectKey ?? "") ??
        `${merchantId}/assets/${normalizeOptionalString(body.assetId ?? "") ?? uuidv7()}`;

      // Collision guard: reject if objectKey already used
      const [existing] = await db
        .select({ id: assets.id })
        .from(assets)
        .where(eq(assets.objectKey, objectKey))
        .limit(1);

      if (existing) {
        set.status = 409;
        return { error: "objectKey already in use", objectKey };
      }

      const storage = getAssetStorageConfig();
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
        uploadUrl,
        objectKey,
        requiredHeaders: [{ name: "Content-Type", value: contentType }],
      };
    },
    {
      body: AssetPresignUploadRequest,
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

      if (!asset.objectKey) {
        set.status = 400;
        return { error: "Asset has no object key" };
      }

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
