import { merchants, userMerchants } from "@repo/database/api-schema";
import { Empty } from "@repo/protobuf/common";
import {
  MerchantCreateRequest,
  MerchantCreateResponse,
  MerchantListResponse,
} from "@repo/protobuf/merchants";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { recordSyncEvent } from "../lib/sync-events";
import { tsProtoPlugin } from "../lib/ts-proto-plugin";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import { encodeMerchant, encodeSessionMerchant } from "../protobuf/domain";

export const merchantsRoutes = new Elysia({ prefix: "/api/merchants" })
  .use(tsProtoPlugin)
  .use(authenticated)
  .post(
    "/create",
    async ({ body, session, set }) => {
      const request = body as MerchantCreateRequest;
      let name: string;
      try {
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

      const now = new Date().toISOString();
      const [merchant] = await db
        .insert(merchants)
        .values({
          name,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await db.insert(userMerchants).values({
        joinedAt: now,
        merchantId: merchant.id,
        role: "owner",
        userId: session.userId,
      });

      await recordSyncEvent({
        changedAt: now,
        operation: "insert",
        rowId: merchant.id,
        scopeId: merchant.id,
        scopeType: "merchant",
        tableName: "merchants",
      });

      return {
        merchant: encodeMerchant(merchant),
      };
    },
    {
      proto: {
        req: MerchantCreateRequest,
        res: MerchantCreateResponse,
      },
    }
  )
  .post(
    "/list",
    async ({ session }) => {
      const results = await db
        .select({
          merchantId: userMerchants.merchantId,
          name: merchants.name,
          role: userMerchants.role,
        })
        .from(userMerchants)
        .innerJoin(merchants, eq(userMerchants.merchantId, merchants.id))
        .where(eq(userMerchants.userId, session.userId));

      return {
        merchants: results.map(encodeSessionMerchant),
      };
    },
    {
      proto: {
        req: Empty,
        res: MerchantListResponse,
      },
    }
  );
