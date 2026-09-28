import { t } from "elysia";
import type { Static } from "typebox";
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

export type Outlet = Static<typeof Outlet>;
export type OutletCreateRequest = Static<typeof OutletCreateRequest>;
export type OutletCreateResponse = Static<typeof OutletCreateResponse>;
export type OutletListRequest = Static<typeof OutletListRequest>;
export type OutletListResponse = Static<typeof OutletListResponse>;
export type OutletUpdateRequest = Static<typeof OutletUpdateRequest>;
export type OutletUpdateResponse = Static<typeof OutletUpdateResponse>;
