import { t } from "elysia";
import type { Static } from "typebox";

export const PaymentSettings = t.Object({
  id: t.String(),
  merchantId: t.String(),
  qrisStaticPayload: t.Nullable(t.String()),
  qrisStatisEnabled: t.Boolean(),
  qrisDinamisEnabled: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const PaymentSettingsGetRequest = t.Object({
  merchantId: t.String(),
});

export const PaymentSettingsGetResponse = t.Object({
  paymentSettings: t.Nullable(PaymentSettings),
});

export const PaymentSettingsUpsertRequest = t.Object({
  merchantId: t.String(),
  qrisStaticPayload: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
  qrisDinamisEnabled: t.Optional(t.Boolean()),
  qrisStatisEnabled: t.Optional(t.Boolean()),
});

export const PaymentSettingsUpsertResponse = t.Object({
  paymentSettings: PaymentSettings,
});

export type PaymentSettings = Static<typeof PaymentSettings>;
export type PaymentSettingsGetRequest = Static<
  typeof PaymentSettingsGetRequest
>;
export type PaymentSettingsGetResponse = Static<
  typeof PaymentSettingsGetResponse
>;
export type PaymentSettingsUpsertRequest = Static<
  typeof PaymentSettingsUpsertRequest
>;
export type PaymentSettingsUpsertResponse = Static<
  typeof PaymentSettingsUpsertResponse
>;
