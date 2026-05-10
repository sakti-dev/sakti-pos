import { outlets, registers } from "@repo/database/api-schema";
import {
  RegisterPairRequest,
  RegisterPairResponse,
} from "@repo/protobuf/registers";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { recordSyncEvent } from "../lib/sync-events";
import { tsProtoPlugin } from "../lib/ts-proto-plugin";
import { encodeOutlet, encodeRegister } from "../protobuf/domain";

export const publicRegisterRoutes = new Elysia({ prefix: "/api/registers" })
  .use(tsProtoPlugin)
  .post(
    "/pair",
    async ({ body, set }) => {
      const request = body as RegisterPairRequest;
      const [register] = await db
        .select()
        .from(registers)
        .where(eq(registers.pairingCode, request.pairingCode))
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
        hasOutlet: !!outlet,
        outlet: outlet ? encodeOutlet(outlet) : undefined,
        register: encodeRegister(register),
      };
    },
    {
      proto: {
        req: RegisterPairRequest,
        res: RegisterPairResponse,
      },
    }
  );
