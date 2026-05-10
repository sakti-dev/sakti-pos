import { outlets, registers } from "@repo/database/api-schema";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { recordSyncEvent } from "../lib/sync-events";

export const publicRegisterRoutes = new Elysia({ prefix: "/api" }).post(
  "/registers/pair",
  async ({ body, set }) => {
    const [register] = await db
      .select()
      .from(registers)
      .where(eq(registers.pairingCode, body.pairingCode))
      .limit(1);

    if (!register) {
      set.status = 400;
      return { error: "Invalid pairing code" };
    }

    if (
      !register.pairingExpiresAt ||
      new Date(register.pairingExpiresAt) < new Date()
    ) {
      set.status = 400;
      return { error: "Pairing code expired" };
    }

    const now = new Date().toISOString();
    await db
      .update(registers)
      .set({
        pairingCode: null,
        pairingExpiresAt: null,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(registers.id, register.id));

    await recordSyncEvent({
      changedAt: now,
      operation: "update",
      rowId: register.id,
      scopeId: register.outletId,
      scopeType: "outlet",
      tableName: "registers",
    });

    const [outlet] = await db
      .select()
      .from(outlets)
      .where(eq(outlets.id, register.outletId))
      .limit(1);

    return {
      register: {
        id: register.id,
        name: register.name,
        shortId: register.shortId,
      },
      outlet: outlet ?? null,
    };
  },
  {
    body: t.Object({
      pairingCode: t.String({
        minLength: 8,
        maxLength: 8,
        pattern: "^[A-Z0-9]{8}$",
      }),
    }),
  }
);
