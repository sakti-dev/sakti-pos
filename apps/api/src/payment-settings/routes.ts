import { paymentSettings, userMerchants } from "@sync-contract/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import {
  PaymentSettingsGetRequest,
  PaymentSettingsUpsertRequest,
} from "./payment-settings.model";

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

export const paymentSettingsRoutes = new Elysia({
  prefix: "/api/payment-settings",
})
  .use(authenticated)
  .post(
    "/get",
    async ({ body, session }) => {
      throwIfFalse(
        await verifyMerchantAccess(session.userId, body.merchantId),
        new ForbiddenRequestError()
      );

      const [row] = await db
        .select()
        .from(paymentSettings)
        .where(eq(paymentSettings.merchantId, body.merchantId))
        .limit(1);

      return { paymentSettings: row ?? null };
    },
    {
      body: PaymentSettingsGetRequest,
    }
  )
  .post(
    "/upsert",
    async ({ body, session }) => {
      throwIfFalse(
        await verifyMerchantAccess(session.userId, body.merchantId),
        new ForbiddenRequestError()
      );

      const [existing] = await db
        .select()
        .from(paymentSettings)
        .where(eq(paymentSettings.merchantId, body.merchantId))
        .limit(1);

      const now = new Date().toISOString();

      if (!existing) {
        const [created] = await db
          .insert(paymentSettings)
          .values({
            merchantId: body.merchantId,
            qrisStaticPayload: body.qrisStaticPayload ?? null,
            qrisStatisEnabled: body.qrisStatisEnabled ?? false,
            qrisDinamisEnabled: body.qrisDinamisEnabled ?? false,
            syncUpdatedAt: Date.now(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return { paymentSettings: created };
      }

      const [updated] = await db
        .update(paymentSettings)
        .set({
          qrisStaticPayload:
            body.qrisStaticPayload === undefined
              ? existing.qrisStaticPayload
              : body.qrisStaticPayload,
          qrisStatisEnabled:
            body.qrisStatisEnabled === undefined
              ? existing.qrisStatisEnabled
              : body.qrisStatisEnabled,
          qrisDinamisEnabled:
            body.qrisDinamisEnabled === undefined
              ? existing.qrisDinamisEnabled
              : body.qrisDinamisEnabled,
          syncUpdatedAt: Date.now(),
          updatedAt: now,
        })
        .where(eq(paymentSettings.merchantId, body.merchantId))
        .returning();

      return { paymentSettings: updated };
    },
    {
      body: PaymentSettingsUpsertRequest,
    }
  );
