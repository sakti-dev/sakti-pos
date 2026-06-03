import { merchants, userMerchants } from "@repo/database/api-schema";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { BadRequestError, requireNonEmptyString } from "../lib/validation";
import { MerchantCreateRequest } from "./merchants.model";

export const merchantsRoutes = new Elysia({ prefix: "/api/merchants" })
  .use(authenticated)
  .post(
    "/create",
    async ({ body, session, set }) => {
      let name: string;
      try {
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

      const now = new Date().toISOString();
      const merchant = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(merchants)
          .values({
            name,
            syncUpdatedAt: Date.now(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await tx.insert(userMerchants).values({
          joinedAt: now,
          merchantId: created.id,
          role: "owner",
          userId: session.userId,
        });

        return created;
      });

      return {
        merchant: {
          id: merchant.id,
          name: merchant.name,
          createdAt: merchant.createdAt,
          updatedAt: merchant.updatedAt,
        },
      };
    },
    {
      body: MerchantCreateRequest,
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
        merchants: results.map((row) => ({
          merchantId: row.merchantId,
          name: row.name,
          role: row.role,
        })),
      };
    },
    {}
  );
