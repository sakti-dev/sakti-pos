import { staff, userMerchants } from "@repo/database/api-schema";
import { DeleteResponse } from "@repo/protobuf/common";
import {
  StaffCreateRequest,
  StaffCreateResponse,
  StaffCurrentRequest,
  StaffCurrentResponse,
  StaffDeleteRequest,
  StaffListRequest,
  StaffListResponse,
  StaffUpdatePinRequest,
  StaffUpdatePinResponse,
} from "@repo/protobuf/staff";
import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { recordSyncEvent } from "../lib/sync-events";
import { tsProtoPlugin } from "../lib/ts-proto-plugin";
import {
  BadRequestError,
  requireNonEmptyString,
  requirePin,
} from "../lib/validation";
import { encodeStaff } from "../protobuf/domain";

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

function encodeCurrentStaffResponse(input: {
  claimed: boolean;
  reason?: string;
  staff?: Parameters<typeof encodeStaff>[0] | null;
}): StaffCurrentResponse {
  return {
    claimed: input.claimed,
    hasStaff: input.staff != null,
    reason: input.reason ?? "",
    staff: input.staff ? encodeStaff(input.staff) : undefined,
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
  .use(tsProtoPlugin)
  .use(authenticated)
  .post(
    "/current",
    async ({ body, session }) => {
      const request = body as StaffCurrentRequest;
      const membership = await getMerchantMembership(
        session.userId,
        request.merchantId
      );

      if (!membership) {
        return encodeCurrentStaffResponse({
          claimed: false,
          reason: "not-allowed",
          staff: null,
        });
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
          pin: staff.pin,
        })
        .from(staff)
        .where(
          and(
            eq(staff.merchantId, request.merchantId),
            eq(staff.cloudUserId, session.userId),
            eq(staff.isActive, true)
          )
        )
        .limit(1);

      if (mappedStaff) {
        return encodeCurrentStaffResponse({
          claimed: false,
          staff: mappedStaff,
        });
      }

      if (membership.role !== "owner") {
        return encodeCurrentStaffResponse({
          claimed: false,
          reason: "not-allowed",
          staff: null,
        });
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
            pin: staff.pin,
          })
          .from(staff)
          .where(
            and(
              eq(staff.merchantId, request.merchantId),
              eq(staff.role, "owner"),
              eq(staff.isActive, true),
              isNull(staff.cloudUserId)
            )
          )
          .limit(2);

        if (ownerRows.length === 0) {
          return encodeCurrentStaffResponse({
            claimed: false,
            reason: "no-staff",
            staff: null,
          });
        }

        if (ownerRows.length > 1) {
          return encodeCurrentStaffResponse({
            claimed: false,
            reason: "ambiguous-owner",
            staff: null,
          });
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
            pin: staff.pin,
          });

        if (!claimedOwner) {
          return encodeCurrentStaffResponse({
            claimed: false,
            reason: "no-staff",
            staff: null,
          });
        }

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "update",
            rowId: claimedOwner.id,
            scopeId: request.merchantId,
            scopeType: "merchant",
            tableName: "staff",
          },
          tx
        );

        return encodeCurrentStaffResponse({
          claimed: true,
          staff: claimedOwner,
        });
      });
    },
    {
      proto: {
        req: StaffCurrentRequest,
        res: StaffCurrentResponse,
      },
    }
  )
  .post(
    "/create",
    async ({ body, session, set }) => {
      const request = body as StaffCreateRequest;
      let merchantId: string;
      let name: string;
      let pin: string;
      try {
        merchantId = requireNonEmptyString(request.merchantId, "merchantId");
        name = requireNonEmptyString(request.name, "name", {
          minLength: 1,
          maxLength: 100,
        });
        pin = requirePin(request.pin);
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
            outletId: request.hasOutletId ? request.outletId : null,
            name,
            pin: pinHash,
            role: requireRole(request.role),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "insert",
            rowId: result.id,
            scopeId: merchantId,
            scopeType: "merchant",
            tableName: "staff",
          },
          tx
        );

        return result;
      });

      return {
        staff: encodeStaff({
          ...created,
          pin: created.pin ?? null,
        }),
      };
    },
    {
      proto: {
        req: StaffCreateRequest,
        res: StaffCreateResponse,
      },
    }
  )
  .post(
    "/list",
    async ({ body, session }) => {
      const request = body as StaffListRequest;
      throwIfFalse(
        await verifyMerchantAccess(session.userId, request.merchantId),
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
          pin: staff.pin,
        })
        .from(staff)
        .where(eq(staff.merchantId, request.merchantId));

      return {
        staff: results.map((row) =>
          encodeStaff({
            ...row,
            pin: row.pin ?? null,
          })
        ),
      };
    },
    {
      proto: {
        req: StaffListRequest,
        res: StaffListResponse,
      },
    }
  )
  .post(
    "/update-pin",
    async ({ body, session, set }) => {
      const request = body as StaffUpdatePinRequest;
      let pin: string;
      try {
        pin = requirePin(request.pin);
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
        .where(eq(staff.id, request.id))
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
          .where(eq(staff.id, request.id))
          .returning();

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "update",
            rowId: request.id,
            scopeId: existing.merchantId,
            scopeType: "merchant",
            tableName: "staff",
          },
          tx
        );

        return result;
      });

      return {
        staff: encodeStaff({
          ...updated,
          pin: updated.pin ?? null,
        }),
      };
    },
    {
      proto: {
        req: StaffUpdatePinRequest,
        res: StaffUpdatePinResponse,
      },
    }
  )
  .post(
    "/delete",
    async ({ body, session, set }) => {
      const request = body as StaffDeleteRequest;
      const [existing] = await db
        .select({ merchantId: staff.merchantId })
        .from(staff)
        .where(eq(staff.id, request.id))
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
          .where(eq(staff.id, request.id));

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "delete",
            rowId: request.id,
            scopeId: existing.merchantId,
            scopeType: "merchant",
            tableName: "staff",
          },
          tx
        );
      });

      return {
        success: true,
      };
    },
    {
      proto: {
        req: StaffDeleteRequest,
        res: DeleteResponse,
      },
    }
  );
