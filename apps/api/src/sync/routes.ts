import { outlets } from "@repo/database/api-schema";
import {
  SyncPullEventsRequest,
  SyncPullEventsResponse,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncStatusRequest,
  SyncStatusResponse,
} from "@repo/protobuf/sync";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { tsProtoPlugin } from "../lib/ts-proto-plugin";
import {
  decodePushRequestTables,
  encodePullEventsResponse,
  encodePullResponse,
  encodePushResponse,
  encodeStatusResponse,
} from "./protobuf";
import {
  handleEventPull,
  handlePull,
  handlePush,
  handleSyncStatus,
  verifyOutletAccess,
} from "./service";

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .use(tsProtoPlugin)
  .use(authenticated)
  .post(
    "/push",
    async ({ body, session, set }) => {
      const pushRequest = body as SyncPushRequest;
      throwIfFalse(
        await verifyOutletAccess(session.userId, pushRequest.outletId),
        new ForbiddenRequestError()
      );

      const [outlet] = await db
        .select({ merchantId: outlets.merchantId })
        .from(outlets)
        .where(eq(outlets.id, pushRequest.outletId))
        .limit(1);

      if (!outlet) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      let tables: Record<string, unknown[]>;
      try {
        tables = decodePushRequestTables(pushRequest.payloadJson);
      } catch {
        set.status = 400;
        return "Invalid sync payload JSON";
      }

      const result = await handlePush(
        pushRequest.outletId,
        outlet.merchantId,
        tables
      );
      return encodePushResponse(result);
    },
    {
      proto: {
        req: SyncPushRequest,
        res: SyncPushResponse,
      },
    }
  )
  .post(
    "/status",
    async ({ body, session, set }) => {
      const statusRequest = body as SyncStatusRequest;
      throwIfFalse(
        await verifyOutletAccess(session.userId, statusRequest.outletId),
        new ForbiddenRequestError()
      );

      const [outlet] = await db
        .select({ merchantId: outlets.merchantId })
        .from(outlets)
        .where(eq(outlets.id, statusRequest.outletId))
        .limit(1);

      if (!outlet) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      const result = await handleSyncStatus({
        lastServerEventId: statusRequest.lastServerEventId,
        merchantId: outlet.merchantId,
        outletId: statusRequest.outletId,
      });
      return encodeStatusResponse(result);
    },
    {
      proto: {
        req: SyncStatusRequest,
        res: SyncStatusResponse,
      },
    }
  )
  .post(
    "/pull-events",
    async ({ body, session, set }) => {
      const pullEventsRequest = body as SyncPullEventsRequest;
      throwIfFalse(
        await verifyOutletAccess(session.userId, pullEventsRequest.outletId),
        new ForbiddenRequestError()
      );

      const [outlet] = await db
        .select({ merchantId: outlets.merchantId })
        .from(outlets)
        .where(eq(outlets.id, pullEventsRequest.outletId))
        .limit(1);

      if (!outlet) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      const result = await handleEventPull({
        afterEventId: pullEventsRequest.afterEventId,
        merchantId: outlet.merchantId,
        outletId: pullEventsRequest.outletId,
      });
      return encodePullEventsResponse(result);
    },
    {
      proto: {
        req: SyncPullEventsRequest,
        res: SyncPullEventsResponse,
      },
    }
  )
  .post(
    "/pull",
    async ({ body, session, set }) => {
      const pullRequest = body as SyncPullRequest;
      throwIfFalse(
        await verifyOutletAccess(session.userId, pullRequest.outletId),
        new ForbiddenRequestError()
      );

      const [outlet] = await db
        .select({ merchantId: outlets.merchantId })
        .from(outlets)
        .where(eq(outlets.id, pullRequest.outletId))
        .limit(1);

      if (!outlet) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      const result = await handlePull(
        pullRequest.outletId,
        outlet.merchantId,
        pullRequest.tables,
        pullRequest.since
      );
      return encodePullResponse(result);
    },
    {
      proto: {
        req: SyncPullRequest,
        res: SyncPullResponse,
      },
    }
  );
