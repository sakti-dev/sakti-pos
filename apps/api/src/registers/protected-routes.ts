import { outlets, registers, userMerchants } from "@repo/database/api-schema";
import { DeleteResponse } from "@repo/protobuf/common";
import {
  RegisterCreateRequest,
  RegisterCreateResponse,
  RegisterDeleteRequest,
  RegisterListRequest,
  RegisterListResponse,
} from "@repo/protobuf/registers";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { tsProtoPlugin } from "../lib/ts-proto-plugin";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import { encodeRegister } from "../protobuf/domain";

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 8; index += 1) {
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

export const protectedRegisterRoutes = new Elysia({ prefix: "/api/registers" })
  .use(tsProtoPlugin)
  .use(authenticated)
  .post(
    "/create",
    async ({ body, session, set }) => {
      const request = body as RegisterCreateRequest;
      let outletId: string;
      let name: string;
      try {
        outletId = requireNonEmptyString(request.outletId, "outletId");
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
        await verifyOutletOwnership(session.userId, outletId),
        new ForbiddenRequestError()
      );

      const now = new Date().toISOString();
      const pairingCode = generatePairingCode();
      const pairingExpiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const register = await db.transaction(async (tx) => {
        const [result] = await tx
          .insert(registers)
          .values({
            outletId,
            name,
            shortId: generateShortId(),
            pairingCode,
            pairingExpiresAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return result;
      });

      return {
        register: encodeRegister(register),
      };
    },
    {
      proto: {
        req: RegisterCreateRequest,
        res: RegisterCreateResponse,
      },
    }
  )
  .post(
    "/list",
    async ({ body, session }) => {
      const request = body as RegisterListRequest;
      throwIfFalse(
        await verifyOutletOwnership(session.userId, request.outletId),
        new ForbiddenRequestError()
      );

      const results = await db
        .select()
        .from(registers)
        .where(eq(registers.outletId, request.outletId));

      return {
        registers: results.map(encodeRegister),
      };
    },
    {
      proto: {
        req: RegisterListRequest,
        res: RegisterListResponse,
      },
    }
  )
  .post(
    "/delete",
    async ({ body, session, set }) => {
      const request = body as RegisterDeleteRequest;
      const [register] = await db
        .select()
        .from(registers)
        .where(eq(registers.id, request.id))
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
      await db.transaction(async (tx) => {
        await tx
          .update(registers)
          .set({ isActive: false, updatedAt: now })
          .where(eq(registers.id, request.id));
      });

      return { success: true };
    },
    {
      proto: {
        req: RegisterDeleteRequest,
        res: DeleteResponse,
      },
    }
  );
