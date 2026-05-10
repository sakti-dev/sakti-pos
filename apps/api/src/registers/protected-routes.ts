import { outlets, registers, userMerchants } from "@repo/database/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { recordSyncEvent } from "../lib/sync-events";

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateShortId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function verifyOutletOwnership(
  userId: string,
  outletId: string
): Promise<boolean> {
  const [outlet] = await db
    .select({ merchantId: outlets.merchantId })
    .from(outlets)
    .where(eq(outlets.id, outletId))
    .limit(1);

  if (!outlet) {
    return false;
  }

  const [membership] = await db
    .select({ id: userMerchants.id })
    .from(userMerchants)
    .where(
      and(
        eq(userMerchants.userId, userId),
        eq(userMerchants.merchantId, outlet.merchantId)
      )
    )
    .limit(1);

  return !!membership;
}

export const protectedRegisterRoutes = new Elysia({ prefix: "/api" })
  .use(authenticated)
  .post(
    "/outlets/:outletId/registers",
    async ({ body, params: { outletId }, session }) => {
      throwIfFalse(
        await verifyOutletOwnership(session.userId, outletId),
        new ForbiddenRequestError()
      );

      const now = new Date().toISOString();
      const pairingCode = generatePairingCode();
      const pairingExpiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const [register] = await db
        .insert(registers)
        .values({
          outletId,
          name: body.name,
          shortId: generateShortId(),
          pairingCode,
          pairingExpiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await recordSyncEvent({
        changedAt: now,
        operation: "insert",
        rowId: register.id,
        scopeId: outletId,
        scopeType: "outlet",
        tableName: "registers",
      });

      return register;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
      }),
    }
  )
  .get(
    "/outlets/:outletId/registers",
    async ({ params: { outletId }, session }) => {
      throwIfFalse(
        await verifyOutletOwnership(session.userId, outletId),
        new ForbiddenRequestError()
      );

      return db
        .select()
        .from(registers)
        .where(eq(registers.outletId, outletId));
    }
  )
  .delete("/registers/:id", async ({ params: { id }, session, set }) => {
    const [register] = await db
      .select()
      .from(registers)
      .where(eq(registers.id, id))
      .limit(1);

    if (!register) {
      set.status = 404;
      return { error: "Register not found" };
    }

    throwIfFalse(
      await verifyOutletOwnership(session.userId, register.outletId),
      new ForbiddenRequestError()
    );

    const now = new Date().toISOString();
    await db
      .update(registers)
      .set({ isActive: false, updatedAt: now })
      .where(eq(registers.id, id));

    await recordSyncEvent({
      changedAt: now,
      operation: "update",
      rowId: id,
      scopeId: register.outletId,
      scopeType: "outlet",
      tableName: "registers",
    });

    return { success: true };
  });
