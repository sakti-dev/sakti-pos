import { outlets, registers, userMerchants } from "@repo/database/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { recordSyncEvent } from "../lib/sync-events";

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

export const outletsRoutes = new Elysia({ prefix: "/api" })
  .use(authenticated)
  .post(
    "/merchants/:merchantId/outlets",
    async ({ body, params: { merchantId }, session }) => {
      throwIfFalse(
        await verifyMerchantAccess(session.userId, merchantId),
        new ForbiddenRequestError()
      );

      const now = new Date().toISOString();
      const [outlet] = await db
        .insert(outlets)
        .values({
          merchantId,
          name: body.name,
          address: body.address ?? null,
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

      return { ...outlet, register };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        address: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/merchants/:merchantId/outlets",
    async ({ params: { merchantId }, session }) => {
      throwIfFalse(
        await verifyMerchantAccess(session.userId, merchantId),
        new ForbiddenRequestError()
      );

      const results = await db
        .select()
        .from(outlets)
        .where(eq(outlets.merchantId, merchantId));
      return results;
    }
  )
  .patch(
    "/outlets/:id",
    async ({ body, params: { id }, session, set }) => {
      const [outlet] = await db
        .select()
        .from(outlets)
        .where(eq(outlets.id, id))
        .limit(1);

      if (!outlet) {
        set.status = 404;
        return { error: "Outlet not found" };
      }

      throwIfFalse(
        await verifyMerchantAccess(session.userId, outlet.merchantId),
        new ForbiddenRequestError()
      );

      const [updated] = await db
        .update(outlets)
        .set({ ...body, updatedAt: new Date().toISOString() })
        .where(eq(outlets.id, id))
        .returning();

      await recordSyncEvent({
        changedAt: updated.updatedAt,
        operation: "update",
        rowId: updated.id,
        scopeId: updated.merchantId,
        scopeType: "merchant",
        tableName: "outlets",
      });

      return updated;
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        address: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
      }),
    }
  );
