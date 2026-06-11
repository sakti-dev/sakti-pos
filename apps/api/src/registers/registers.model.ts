import { t } from "elysia";

export const Register = t.Object({
  id: t.String(),
  outletId: t.String(),
  name: t.String(),
  shortId: t.String(),
  pairingCode: t.Nullable(t.String()),
  pairingExpiresAt: t.Nullable(t.String()),
  isActive: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const RegisterCreateRequest = t.Object({
  outletId: t.String(),
  name: t.String({ minLength: 1, maxLength: 100 }),
});

export const RegisterCreateResponse = t.Object({
  register: Register,
});

export const RegisterListRequest = t.Object({
  outletId: t.String(),
});

export const RegisterListResponse = t.Object({
  registers: t.Array(Register),
});

export const RegisterDeleteRequest = t.Object({
  id: t.String(),
});

export const RegisterPairRequest = t.Object({
  pairingCode: t.String(),
});

export const RegisterPairResponse = t.Object({
  hasOutlet: t.Boolean(),
  outlet: t.Optional(
    t.Object({
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
    })
  ),
  register: Register,
});

export const DeleteResponse = t.Object({
  success: t.Boolean(),
});

export type Register = typeof Register.static;
export type RegisterCreateRequest = typeof RegisterCreateRequest.static;
export type RegisterCreateResponse = typeof RegisterCreateResponse.static;
export type RegisterListRequest = typeof RegisterListRequest.static;
export type RegisterListResponse = typeof RegisterListResponse.static;
export type RegisterDeleteRequest = typeof RegisterDeleteRequest.static;
export type RegisterPairRequest = typeof RegisterPairRequest.static;
export type RegisterPairResponse = typeof RegisterPairResponse.static;
export type DeleteResponse = typeof DeleteResponse.static;
