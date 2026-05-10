import { merchants, userMerchants } from "@repo/database/api-schema";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { recordSyncEvent } from "../lib/sync-events";

export const merchantsRoutes = new Elysia({ prefix: "/api/merchants" })
  .use(authenticated)
  .post(
    "/",
    async ({ body, session }) => {
      const now = new Date().toISOString();
      const [merchant] = await db
        .insert(merchants)
        .values({
          name: body.name,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await db.insert(userMerchants).values({
        userId: session.userId,
        merchantId: merchant.id,
        role: "owner",
        joinedAt: now,
      });

      await recordSyncEvent({
        changedAt: now,
        operation: "insert",
        rowId: merchant.id,
        scopeId: merchant.id,
        scopeType: "merchant",
        tableName: "merchants",
      });

      return merchant;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
      }),
    }
  )
  .get("/", async ({ session }) => {
    const results = await db
      .select({
        merchantId: userMerchants.merchantId,
        name: merchants.name,
        role: userMerchants.role,
      })
      .from(userMerchants)
      .innerJoin(merchants, eq(userMerchants.merchantId, merchants.id))
      .where(eq(userMerchants.userId, session.userId));
    return results;
  });
