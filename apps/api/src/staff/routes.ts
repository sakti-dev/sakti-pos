import { staff, userMerchants } from "@repo/database/api-schema";
import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import {
  BadRequestError,
  requireNonEmptyString,
  requirePin,
} from "../lib/validation";
import {
  StaffCreateRequest,
  StaffCurrentRequest,
  StaffDeleteRequest,
  StaffListRequest,
  StaffUpdatePinRequest,
} from "./staff.model";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_LENGTH = 256;
const PBKDF2_ALGORITHM = "SHA-256";

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const keyMaterial = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_ALGORITHM,
    },
    key,
    PBKDF2_HASH_LENGTH
  );
  const hashArray = Array.from(new Uint8Array(keyMaterial));
  const saltHex = Array.from(salt)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = hashArray
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
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

async function getMerchantMembership(userId: string, merchantId: string) {
  const [row] = await db
    .select({ id: userMerchants.id, role: userMerchants.role })
    .from(userMerchants)
    .where(
      and(
        eq(userMerchants.userId, userId),
        eq(userMerchants.merchantId, merchantId)
      )
    )
    .limit(1);
  return row ?? null;
}

function encodeStaff(row: {
  createdAt?: string;
  id: string;
  merchantId: string;
  outletId: string | null;
  name: string;
  role: string;
  isActive: boolean;
  updatedAt?: string;
}) {
  return {
    id: row.id,
    merchantId: row.merchantId,
    outletId: row.outletId,
    name: row.name,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

function requireRole(
  value: string | undefined
): "cashier" | "manager" | "owner" {
  if (value === undefined || value === "") {
    return "cashier";
  }
  if (value === "cashier" || value === "manager" || value === "owner") {
    return value;
  }
  throw new BadRequestError("role is invalid");
}

export const staffRoutes = new Elysia({ prefix: "/api/staff" })
  .use(authenticated)
  .post(
    "/current",
    async ({ body, session }) => {
      const membership = await getMerchantMembership(
        session.userId,
        body.merchantId
      );

      if (!membership) {
        return {
          claimed: false,
          hasStaff: false,
          reason: "not-allowed",
          staff: undefined,
        };
      }

      const [mappedStaff] = await db
        .select({
          createdAt: staff.createdAt,
          id: staff.id,
          merchantId: staff.merchantId,
          outletId: staff.outletId,
          name: staff.name,
          role: staff.role,
          isActive: staff.isActive,
          updatedAt: staff.updatedAt,
        })
        .from(staff)
        .where(
          and(
            eq(staff.merchantId, body.merchantId),
            eq(staff.cloudUserId, session.userId),
            eq(staff.isActive, true)
          )
        )
        .limit(1);

      if (mappedStaff) {
        return {
          claimed: false,
          hasStaff: true,
          reason: "",
          staff: encodeStaff(mappedStaff),
        };
      }

      if (membership.role !== "owner") {
        return {
          claimed: false,
          hasStaff: false,
          reason: "not-allowed",
          staff: undefined,
        };
      }

      return await db.transaction(async (tx) => {
        const ownerRows = await tx
          .select({
            createdAt: staff.createdAt,
            id: staff.id,
            merchantId: staff.merchantId,
            outletId: staff.outletId,
            name: staff.name,
            role: staff.role,
            isActive: staff.isActive,
            updatedAt: staff.updatedAt,
          })
          .from(staff)
          .where(
            and(
              eq(staff.merchantId, body.merchantId),
              eq(staff.role, "owner"),
              eq(staff.isActive, true),
              isNull(staff.cloudUserId)
            )
          )
          .limit(2);

        if (ownerRows.length === 0) {
          return {
            claimed: false,
            hasStaff: false,
            reason: "no-staff",
            staff: undefined,
          };
        }

        if (ownerRows.length > 1) {
          return {
            claimed: false,
            hasStaff: false,
            reason: "ambiguous-owner",
            staff: undefined,
          };
        }

        const now = new Date().toISOString();
        const [claimedOwner] = await tx
          .update(staff)
          .set({
            cloudUserId: session.userId,
            updatedAt: now,
          })
          .where(and(eq(staff.id, ownerRows[0].id), isNull(staff.cloudUserId)))
          .returning({
            createdAt: staff.createdAt,
            id: staff.id,
            merchantId: staff.merchantId,
            outletId: staff.outletId,
            name: staff.name,
            role: staff.role,
            isActive: staff.isActive,
            updatedAt: staff.updatedAt,
          });

        if (!claimedOwner) {
          return {
            claimed: false,
            hasStaff: false,
            reason: "no-staff",
            staff: undefined,
          };
        }

        return {
          claimed: true,
          hasStaff: true,
          reason: "",
          staff: encodeStaff(claimedOwner),
        };
      });
    },
    {
      body: StaffCurrentRequest,
    }
  )
  .post(
    "/create",
    async ({ body, session, set }) => {
      let merchantId: string;
      let name: string;
      let pin: string;
      try {
        merchantId = requireNonEmptyString(body.merchantId, "merchantId");
        name = requireNonEmptyString(body.name, "name", {
          minLength: 1,
          maxLength: 100,
        });
        pin = requirePin(body.pin);
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

      const pinHash = await hashPin(pin);
      const now = new Date().toISOString();

      const created = await db.transaction(async (tx) => {
        const [result] = await tx
          .insert(staff)
          .values({
            merchantId,
            outletId: body.outletId ?? null,
            name,
            pin: pinHash,
            role: requireRole(body.role),
            syncUpdatedAt: Date.now(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return result;
      });

      return {
        staff: encodeStaff({
          ...created,
          outletId: created.outletId,
        }),
      };
    },
    {
      body: StaffCreateRequest,
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
        .select({
          createdAt: staff.createdAt,
          id: staff.id,
          merchantId: staff.merchantId,
          outletId: staff.outletId,
          name: staff.name,
          role: staff.role,
          isActive: staff.isActive,
          updatedAt: staff.updatedAt,
        })
        .from(staff)
        .where(eq(staff.merchantId, body.merchantId));

      return {
        staff: results.map((row) => encodeStaff(row)),
      };
    },
    {
      body: StaffListRequest,
    }
  )
  .post(
    "/update-pin",
    async ({ body, session, set }) => {
      let pin: string;
      try {
        pin = requirePin(body.pin);
      } catch (error) {
        if (error instanceof BadRequestError) {
          set.status = error.status;
          return { error: error.message };
        }
        throw error;
      }

      const [existing] = await db
        .select({ merchantId: staff.merchantId })
        .from(staff)
        .where(eq(staff.id, body.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return { error: "Staff not found" };
      }

      throwIfFalse(
        await verifyMerchantAccess(session.userId, existing.merchantId),
        new ForbiddenRequestError()
      );

      const pinHash = await hashPin(pin);
      const now = new Date().toISOString();
      const updated = await db.transaction(async (tx) => {
        const [result] = await tx
          .update(staff)
          .set({ pin: pinHash, updatedAt: now })
          .where(eq(staff.id, body.id))
          .returning();

        return result;
      });

      return {
        staff: encodeStaff({
          ...updated,
          outletId: updated.outletId,
        }),
      };
    },
    {
      body: StaffUpdatePinRequest,
    }
  )
  .post(
    "/delete",
    async ({ body, session, set }) => {
      const [existing] = await db
        .select({ merchantId: staff.merchantId })
        .from(staff)
        .where(eq(staff.id, body.id))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return { error: "Staff not found" };
      }

      throwIfFalse(
        await verifyMerchantAccess(session.userId, existing.merchantId),
        new ForbiddenRequestError()
      );

      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx
          .update(staff)
          .set({
            isActive: false,
            deletedAt: now,
            updatedAt: now,
          })
          .where(eq(staff.id, body.id));
      });

      return {
        success: true,
      };
    },
    {
      body: StaffDeleteRequest,
    }
  );
