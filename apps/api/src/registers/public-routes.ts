import { outlets, registers } from "@sync-contract/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { RegisterPairRequest } from "./registers.model";

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

export const publicRegisterRoutes = new Elysia({
  prefix: "/api/registers",
}).post(
  "/pair",
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
            eq(registers.pairingCode, body.pairingCode)
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
    body: RegisterPairRequest,
  }
);
