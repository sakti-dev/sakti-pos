import { outlets, registers, userMerchants } from "@repo/database/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import {
  RegisterCreateRequest,
  RegisterDeleteRequest,
  RegisterListRequest,
} from "./registers.model";

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

function encodeRegister(row: {
  createdAt?: string;
  id: string;
  isActive: boolean;
  name: string;
  outletId: string;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  shortId: string;
  updatedAt?: string;
}) {
  return {
    id: row.id,
    outletId: row.outletId,
    name: row.name,
    shortId: row.shortId,
    pairingCode: row.pairingCode,
    pairingExpiresAt: row.pairingExpiresAt,
    isActive: row.isActive,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

export const protectedRegisterRoutes = new Elysia({ prefix: "/api/registers" })
  .use(authenticated)
  .post(
    "/create",
    async ({ body, session, set }) => {
      let outletId: string;
      let name: string;
      try {
        outletId = requireNonEmptyString(body.outletId, "outletId");
        name = requireNonEmptyString(body.name, "name", {
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
            syncUpdatedAt: Date.now(),
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
      body: RegisterCreateRequest,
    }
  )
  .post(
    "/list",
    async ({ body, session }) => {
      throwIfFalse(
        await verifyOutletOwnership(session.userId, body.outletId),
        new ForbiddenRequestError()
      );

      const results = await db
        .select()
        .from(registers)
        .where(eq(registers.outletId, body.outletId));

      return {
        registers: results.map(encodeRegister),
      };
    },
    {
      body: RegisterListRequest,
    }
  )
  .post(
    "/delete",
    async ({ body, session, set }) => {
      const [register] = await db
        .select()
        .from(registers)
        .where(eq(registers.id, body.id))
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
          .where(eq(registers.id, body.id));
      });

      return { success: true };
    },
    {
      body: RegisterDeleteRequest,
    }
  );
