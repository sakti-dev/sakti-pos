import { t } from "elysia";
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

export type Merchant = typeof Merchant.static;
export type MerchantCreateRequest = typeof MerchantCreateRequest.static;
export type MerchantCreateResponse = typeof MerchantCreateResponse.static;
export type MerchantListResponse = typeof MerchantListResponse.static;
