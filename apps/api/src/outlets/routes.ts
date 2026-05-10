import { outlets, registers, userMerchants } from "@repo/database/api-schema";
import {
  OutletCreateRequest,
  OutletCreateResponse,
  OutletListRequest,
  OutletListResponse,
  OutletUpdateRequest,
  OutletUpdateResponse,
} from "@repo/protobuf/outlets";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { recordSyncEvent } from "../lib/sync-events";
import { tsProtoPlugin } from "../lib/ts-proto-plugin";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import { encodeOutlet, encodeRegister } from "../protobuf/domain";

function generateShortId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

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

export const outletsRoutes = new Elysia({ prefix: "/api/outlets" })
  .use(tsProtoPlugin)
  .use(authenticated)
  .post(
    "/create",
    async ({ body, session, set }) => {
      const request = body as OutletCreateRequest;
      let merchantId: string;
      let name: string;
      try {
        merchantId = requireNonEmptyString(request.merchantId, "merchantId");
        name = requireNonEmptyString(request.name, "name", {
          minLength: 1,
          maxLength: 100,
        });
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

      const now = new Date().toISOString();
      const [outlet] = await db
        .insert(outlets)
        .values({
          merchantId,
          name,
          address: request.hasAddress ? request.address : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const [register] = await db
        .insert(registers)
        .values({
          outletId: outlet.id,
          name: "Register 1",
          shortId: generateShortId(),
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await recordSyncEvent({
        changedAt: now,
        operation: "insert",
        rowId: outlet.id,
        scopeId: merchantId,
        scopeType: "merchant",
        tableName: "outlets",
      });
      await recordSyncEvent({
        changedAt: now,
        operation: "insert",
        rowId: register.id,
        scopeId: outlet.id,
        scopeType: "outlet",
        tableName: "registers",
      });

      return {
        hasRegister: true,
        outlet: encodeOutlet(outlet),
        register: encodeRegister(register),
      };
    },
    {
      proto: {
        req: OutletCreateRequest,
        res: OutletCreateResponse,
      },
    }
  )
  .post(
    "/list",
    async ({ body, session }) => {
      const request = body as OutletListRequest;
      throwIfFalse(
        await verifyMerchantAccess(session.userId, request.merchantId),
        new ForbiddenRequestError()
      );

      const results = await db
        .select()
        .from(outlets)
        .where(eq(outlets.merchantId, request.merchantId));

      return {
        outlets: results.map(encodeOutlet),
      };
    },
    {
      proto: {
        req: OutletListRequest,
        res: OutletListResponse,
      },
    }
  )
  .post(
    "/update",
    async ({ body, session, set }) => {
      const request = body as OutletUpdateRequest;
      const [outlet] = await db
        .select()
        .from(outlets)
        .where(eq(outlets.id, request.id))
        .limit(1);

      if (!outlet) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      throwIfFalse(
        await verifyMerchantAccess(session.userId, outlet.merchantId),
        new ForbiddenRequestError()
      );

      const now = new Date().toISOString();
      const [updated] = await db
        .update(outlets)
        .set({
          address: request.hasAddress ? request.address : outlet.address,
          isActive: request.hasIsActive ? request.isActive : outlet.isActive,
          name: request.hasName ? request.name : outlet.name,
          updatedAt: now,
        })
        .where(eq(outlets.id, request.id))
        .returning();

      await recordSyncEvent({
        changedAt: now,
        operation: "update",
        rowId: updated.id,
        scopeId: updated.merchantId,
        scopeType: "merchant",
        tableName: "outlets",
      });

      return {
        outlet: encodeOutlet(updated),
      };
    },
    {
      proto: {
        req: OutletUpdateRequest,
        res: OutletUpdateResponse,
      },
    }
  );
