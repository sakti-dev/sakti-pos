import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import { currentMerchantId } from "~/lib/auth/session";
import { db, TABLE } from "./index";

type PaymentSettingsRow = typeof TABLE.paymentSettings.$inferSelect;

export interface PaymentSettingsPatch {
  readonly qrisDinamisEnabled?: boolean;
  readonly qrisStaticPayload?: string | null;
  readonly qrisStatisEnabled?: boolean;
}

export async function getPaymentSettings(): Promise<
  PaymentSettingsRow | undefined
> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    return;
  }

  const [row] = await db
    .select()
    .from(TABLE.paymentSettings)
    .where(eq(TABLE.paymentSettings.merchantId, merchantId))
    .limit(1);
  return row;
}

/**
 * Upsert the merchant's single payment_settings row (create if absent) and
 * enqueue the change for sync. Only provided fields are updated.
 */
export async function upsertPaymentSettings(
  patch: PaymentSettingsPatch
): Promise<PaymentSettingsRow> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    throw new Error("upsertPaymentSettings: no active merchant");
  }

  const now = dayjs().toISOString();

  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [existing] = await tx
      .select()
      .from(TABLE.paymentSettings)
      .where(eq(TABLE.paymentSettings.merchantId, merchantId))
      .limit(1);

    if (!existing) {
      const [row] = await tx
        .insert(TABLE.paymentSettings)
        .values({
          merchantId,
          qrisStaticPayload: patch.qrisStaticPayload ?? null,
          qrisStatisEnabled: patch.qrisStatisEnabled ?? false,
          qrisDinamisEnabled: patch.qrisDinamisEnabled ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: row.id,
        table: TABLE.paymentSettings,
      });
      return row;
    }

    const [row] = await tx
      .update(TABLE.paymentSettings)
      .set({
        qrisStaticPayload:
          patch.qrisStaticPayload === undefined
            ? existing.qrisStaticPayload
            : patch.qrisStaticPayload,
        qrisStatisEnabled:
          patch.qrisStatisEnabled === undefined
            ? existing.qrisStatisEnabled
            : patch.qrisStatisEnabled,
        qrisDinamisEnabled:
          patch.qrisDinamisEnabled === undefined
            ? existing.qrisDinamisEnabled
            : patch.qrisDinamisEnabled,
        updatedAt: now,
        isSynced: false,
      })
      .where(eq(TABLE.paymentSettings.merchantId, merchantId))
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: TABLE.paymentSettings,
    });
    return row;
  });
}
