import {
  merchants,
  outlets,
  registers,
  userMerchants,
} from "@sync-contract/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import {
  OutletCreateRequest,
  OutletListRequest,
  OutletUpdateRequest,
} from "../outlets/outlets.model";

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

function encodeOutlet(row: {
  address: string | null;
  createdAt?: string;
  id: string;
  isActive: boolean;
  merchantId: string;
  name: string;
  receiptAddress: string | null;
  receiptName: string | null;
  timezone?: string | null;
  updatedAt?: string;
}) {
  return {
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    address: row.address,
    timezone: row.timezone ?? "Asia/Jakarta",
    isActive: row.isActive,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    receiptName: row.receiptName,
    receiptAddress: row.receiptAddress,
  };
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

export const outletsRoutes = new Elysia({ prefix: "/api/outlets" })
  .use(authenticated)
  .post(
    "/create",
    async ({ body, session, set }) => {
      let merchantId: string;
      let name: string;
      try {
        merchantId = requireNonEmptyString(body.merchantId, "merchantId");
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
            address: body.address ?? null,
            receiptAddress: body.address ?? null,
            receiptName: merchant?.name ?? name,
            timezone: body.timezone || "Asia/Jakarta",
            syncUpdatedAt: Date.now(),
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
            syncUpdatedAt: Date.now(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return { outlet: createdOutlet, register: createdRegister };
      });

      return {
        hasRegister: true,
        outlet: encodeOutlet(outlet),
        register: encodeRegister(register),
      };
    },
    {
      body: OutletCreateRequest,
    }
  )
  .post(
    "/list",
    async ({ body, session }) => {
      throwIfFalse(
        await verifyMerchantAccess(session.userId, body.merchantId),
        new ForbiddenRequestError()
      );

      const results = await db
        .select()
        .from(outlets)
        .where(eq(outlets.merchantId, body.merchantId));

      return {
        outlets: results.map(encodeOutlet),
      };
    },
    {
      body: OutletListRequest,
    }
  )
  .post(
    "/update",
    async ({ body, session, set }) => {
      const [outlet] = await db
        .select()
        .from(outlets)
        .where(eq(outlets.id, body.id))
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
            address: body.address === undefined ? outlet.address : body.address,
            isActive:
              body.isActive === undefined ? outlet.isActive : body.isActive,
            name: body.name === undefined ? outlet.name : body.name,
            receiptAddress:
              body.receiptAddress === undefined
                ? outlet.receiptAddress
                : body.receiptAddress,
            receiptName:
              body.receiptName === undefined
                ? outlet.receiptName
                : body.receiptName,
            timezone:
              body.timezone === undefined ? outlet.timezone : body.timezone,
            updatedAt: now,
          })
          .where(eq(outlets.id, body.id))
          .returning();

        if (!result) {
          return;
        }

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
      body: OutletUpdateRequest,
    }
  );
