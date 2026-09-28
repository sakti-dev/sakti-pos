import { t } from "elysia";
import type { Static } from "typebox";
import { SessionMerchant } from "../auth/auth.model";

export const Merchant = t.Object({
  id: t.String(),
  name: t.String(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const MerchantCreateRequest = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
});

export const MerchantCreateResponse = t.Object({
  merchant: Merchant,
});

export const MerchantListResponse = t.Object({
  merchants: t.Array(SessionMerchant),
});

export type Merchant = Static<typeof Merchant>;
export type MerchantCreateRequest = Static<typeof MerchantCreateRequest>;
export type MerchantCreateResponse = Static<typeof MerchantCreateResponse>;
export type MerchantListResponse = Static<typeof MerchantListResponse>;
