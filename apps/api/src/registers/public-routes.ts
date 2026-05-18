import { outlets, registers } from "@repo/database/api-schema";
import {
  RegisterPairRequest,
  RegisterPairResponse,
} from "@repo/protobuf/registers";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
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
      return await db.transaction(async (tx) => {
        const [updatedRegister] = await tx
          .update(registers)
          .set({
            pairingCode: null,
            pairingExpiresAt: null,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(registers.id, register.id),
              eq(registers.pairingCode, request.pairingCode)
            )
          )
          .returning();

        if (!updatedRegister) {
          set.status = 400;
          return { error: "Pairing code expired" };
        }

        const [outlet] = await tx
          .select()
          .from(outlets)
          .where(eq(outlets.id, updatedRegister.outletId))
          .limit(1);

        return {
          hasOutlet: !!outlet,
          outlet: outlet ? encodeOutlet(outlet) : undefined,
          register: encodeRegister(updatedRegister),
        };
      });
    },
    {
      proto: {
        req: RegisterPairRequest,
        res: RegisterPairResponse,
      },
    }
  );
