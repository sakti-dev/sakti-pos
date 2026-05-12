import {
  merchants,
  outlets,
  registers,
  userMerchants,
} from "@repo/database/api-schema";
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
      const payload = body as OutletCreateRequest;
      let merchantId: string;
      let name: string;
      try {
        merchantId = requireNonEmptyString(payload.merchantId, "merchantId");
        name = requireNonEmptyString(payload.name, "name", {
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

      const [merchant] = await db
        .select({ name: merchants.name })
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);

      const now = new Date().toISOString();
      const { outlet, register } = await db.transaction(async (tx) => {
        const [createdOutlet] = await tx
          .insert(outlets)
          .values({
            merchantId,
            name,
            address: payload.hasAddress ? payload.address : null,
            receiptAddress: payload.hasAddress ? payload.address : null,
            receiptName: merchant?.name ?? name,
            timezone: payload.timezone || "Asia/Jakarta",
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        const [createdRegister] = await tx
          .insert(registers)
          .values({
            outletId: createdOutlet.id,
            name: "Register 1",
            shortId: generateShortId(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "insert",
            rowId: createdOutlet.id,
            scopeId: merchantId,
            scopeType: "merchant",
            tableName: "outlets",
          },
          tx
        );
        await recordSyncEvent(
          {
            changedAt: now,
            operation: "insert",
            rowId: createdRegister.id,
            scopeId: createdOutlet.id,
            scopeType: "outlet",
            tableName: "registers",
          },
          tx
        );

        return { outlet: createdOutlet, register: createdRegister };
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
      const payload = body as OutletListRequest;
      throwIfFalse(
        await verifyMerchantAccess(session.userId, payload.merchantId),
        new ForbiddenRequestError()
      );

      const results = await db
        .select()
        .from(outlets)
        .where(eq(outlets.merchantId, payload.merchantId));

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
      const payload = body as OutletUpdateRequest;
      const [outlet] = await db
        .select()
        .from(outlets)
        .where(eq(outlets.id, payload.id))
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
      const updated = await db.transaction(async (tx) => {
        const [result] = await tx
          .update(outlets)
          .set({
            address: payload.hasAddress ? payload.address : outlet.address,
            isActive: payload.hasIsActive ? payload.isActive : outlet.isActive,
            name: payload.hasName ? payload.name : outlet.name,
            receiptAddress: payload.hasReceiptAddress
              ? payload.receiptAddress
              : outlet.receiptAddress,
            receiptName: payload.hasReceiptName
              ? payload.receiptName
              : outlet.receiptName,
            timezone: payload.hasTimezone ? payload.timezone : outlet.timezone,
            updatedAt: now,
          })
          .where(eq(outlets.id, payload.id))
          .returning();

        if (!result) {
          return;
        }

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "update",
            rowId: result.id,
            scopeId: result.merchantId,
            scopeType: "merchant",
            tableName: "outlets",
          },
          tx
        );

        return result;
      });

      if (!updated) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

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
