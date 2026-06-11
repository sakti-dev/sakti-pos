import { t } from "elysia";
import { Register } from "../registers/registers.model";

export const Outlet = t.Object({
  id: t.String(),
  merchantId: t.String(),
  name: t.String(),
  address: t.Nullable(t.String()),
  timezone: t.String(),
  isActive: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
  receiptName: t.Nullable(t.String()),
  receiptAddress: t.Nullable(t.String()),
});

export const OutletCreateRequest = t.Object({
  merchantId: t.String(),
  name: t.String({ minLength: 1, maxLength: 100 }),
  address: t.Optional(t.String()),
  timezone: t.Optional(t.String()),
});

export const OutletCreateResponse = t.Object({
  hasRegister: t.Boolean(),
  outlet: Outlet,
  register: Register,
});

export const OutletListRequest = t.Object({
  merchantId: t.String(),
});

export const OutletListResponse = t.Object({
  outlets: t.Array(Outlet),
});

export const OutletUpdateRequest = t.Object({
  id: t.String(),
  address: t.Optional(t.String()),
  isActive: t.Optional(t.Boolean()),
  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  receiptAddress: t.Optional(t.String()),
  receiptName: t.Optional(t.String()),
  timezone: t.Optional(t.String()),
});

export const OutletUpdateResponse = t.Object({
  outlet: Outlet,
});

export type Outlet = typeof Outlet.static;
export type OutletCreateRequest = typeof OutletCreateRequest.static;
export type OutletCreateResponse = typeof OutletCreateResponse.static;
export type OutletListRequest = typeof OutletListRequest.static;
export type OutletListResponse = typeof OutletListResponse.static;
export type OutletUpdateRequest = typeof OutletUpdateRequest.static;
export type OutletUpdateResponse = typeof OutletUpdateResponse.static;
