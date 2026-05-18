import { outlets } from "@repo/database/api-schema";
import {
  SyncPullBatchRequest,
  SyncPullBatchResponse,
  SyncPushBatchRequest,
  SyncPushBatchResponse,
  SyncStatusRequest,
  SyncStatusResponse,
} from "@repo/protobuf/sync";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { tsProtoCodec, tsProtoPlugin } from "../lib/ts-proto-plugin";
import { ConflictRequestError } from "../lib/validation";
import {
  computePushBatchRequestHash,
  decodePushBatchRequest,
  encodePullBatchResponse,
  encodePushBatchResponse,
  encodeStatusResponse,
} from "./protobuf";
import {
  handlePushBatch,
  handleRowStatePullBatch,
  handleRowStateSyncStatus,
  verifyOutletAccess,
} from "./service";

const MAX_PUSH_BATCH_ROWS = 2000;
const MAX_PUSH_BATCH_BYTES = 2 * 1024 * 1024;

const syncPushBatchRequestCodec = tsProtoCodec(SyncPushBatchRequest);
const syncPushBatchResponseCodec = tsProtoCodec(SyncPushBatchResponse);
const syncStatusRequestCodec = tsProtoCodec(SyncStatusRequest);
const syncStatusResponseCodec = tsProtoCodec(SyncStatusResponse);
const syncPullBatchRequestCodec = tsProtoCodec(SyncPullBatchRequest);
const syncPullBatchResponseCodec = tsProtoCodec(SyncPullBatchResponse);

function countPushBatchRows(
  changes: ReturnType<typeof decodePushBatchRequest>
) {
  let total = 0;
  for (const tableChanges of Object.values(changes)) {
    total += tableChanges.changedRows.length + tableChanges.deletedIds.length;
  }
  return total;
}

async function getOutletMerchantId(outletId: string): Promise<string | null> {
  const [outlet] = await db
    .select({ merchantId: outlets.merchantId })
    .from(outlets)
    .where(eq(outlets.id, outletId))
    .limit(1);

  return outlet?.merchantId ?? null;
}

async function assertOutletAccess(input: {
  outletId: string;
  sessionUserId: string;
}) {
  throwIfFalse(
    await verifyOutletAccess(input.sessionUserId, input.outletId),
    new ForbiddenRequestError()
  );
}

function isInvalidPullCursorError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("invalid pull batch cursor")
  );
}

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .use(tsProtoPlugin)
  .use(authenticated)
  .post(
    "/push",
    async ({ body, session, set }) => {
      const pushRequest = body as SyncPushBatchRequest;
      const merchantId = await getOutletMerchantId(pushRequest.outletId);

      if (!merchantId) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      await assertOutletAccess({
        outletId: pushRequest.outletId,
        sessionUserId: session.userId,
      });

      if (!pushRequest.idempotencyKey.trim()) {
        set.status = 400;
        return "Sync push requires an idempotency key";
      }

      if (!pushRequest.clientId.trim()) {
        set.status = 400;
        return "Sync push requires a client id";
      }

      if (
        SyncPushBatchRequest.encode(pushRequest).finish().byteLength >
        MAX_PUSH_BATCH_BYTES
      ) {
        set.status = 413;
        return "Sync push batch is too large";
      }

      let changes: ReturnType<typeof decodePushBatchRequest>;
      try {
        changes = decodePushBatchRequest(pushRequest);
      } catch {
        set.status = 400;
        return "Invalid sync batch payload";
      }

      if (countPushBatchRows(changes) > MAX_PUSH_BATCH_ROWS) {
        set.status = 413;
        return "Sync push batch has too many rows";
      }

      const requestHash = await computePushBatchRequestHash(pushRequest);

      try {
        const result = await handlePushBatch(
          pushRequest.outletId,
          merchantId,
          pushRequest.clientId,
          changes,
          pushRequest.idempotencyKey,
          requestHash
        );
        return encodePushBatchResponse(result);
      } catch (error) {
        if (error instanceof ConflictRequestError) {
          set.status = error.status;
          return error.toResponse();
        }
        throw error;
      }
    },
    {
      proto: {
        req: syncPushBatchRequestCodec,
        res: syncPushBatchResponseCodec,
      },
    }
  )
  .post(
    "/status",
    async ({ body, session, set }) => {
      const statusRequest = body as SyncStatusRequest;
      const merchantId = await getOutletMerchantId(statusRequest.outletId);

      if (!merchantId) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      await assertOutletAccess({
        outletId: statusRequest.outletId,
        sessionUserId: session.userId,
      });

      try {
        const result = await handleRowStateSyncStatus({
          cursor: statusRequest.cursor,
          merchantId,
          outletId: statusRequest.outletId,
        });
        return encodeStatusResponse(result);
      } catch (error) {
        if (isInvalidPullCursorError(error)) {
          set.status = 400;
          return (error as Error).message;
        }
        throw error;
      }
    },
    {
      proto: {
        req: syncStatusRequestCodec,
        res: syncStatusResponseCodec,
      },
    }
  )
  .post(
    "/pull",
    async ({ body, session, set }) => {
      const pullBatchRequest = body as SyncPullBatchRequest;
      const merchantId = await getOutletMerchantId(pullBatchRequest.outletId);

      if (!merchantId) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      await assertOutletAccess({
        outletId: pullBatchRequest.outletId,
        sessionUserId: session.userId,
      });

      try {
        const result = await handleRowStatePullBatch({
          cursor: pullBatchRequest.cursor,
          limit: pullBatchRequest.limit,
          merchantId,
          outletId: pullBatchRequest.outletId,
          tables: pullBatchRequest.tables,
        });
        return encodePullBatchResponse(result);
      } catch (error) {
        if (isInvalidPullCursorError(error)) {
          set.status = 400;
          return (error as Error).message;
        }
        throw error;
      }
    },
    {
      proto: {
        req: syncPullBatchRequestCodec,
        res: syncPullBatchResponseCodec,
      },
    }
  );
