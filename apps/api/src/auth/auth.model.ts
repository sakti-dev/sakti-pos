import { t } from "elysia";
import type { Static } from "typebox";

export const ApiUser = t.Object({
  id: t.String(),
  email: t.String(),
  name: t.String(),
});

export const SessionMerchant = t.Object({
  merchantId: t.String(),
  name: t.String(),
  role: t.String(),
});

export const AuthRegisterRequest = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8 }),
  name: t.String({ minLength: 1, maxLength: 100 }),
});

export const AuthLoginRequest = t.Object({
  email: t.String({ format: "email" }),
  password: t.String(),
});

export const AuthResponse = t.Object({
  sessionToken: t.String(),
  user: ApiUser,
});

export const AuthSessionResponse = t.Object({
  hasUser: t.Boolean(),
  merchants: t.Array(SessionMerchant),
  user: t.Optional(ApiUser),
});

export const LogoutResponse = t.Object({
  success: t.Boolean(),
});

export const GoogleExchangeRequest = t.Object({
  code: t.String(),
});

export type ApiUser = Static<typeof ApiUser>;
export type SessionMerchant = Static<typeof SessionMerchant>;
export type AuthRegisterRequest = Static<typeof AuthRegisterRequest>;
export type AuthLoginRequest = Static<typeof AuthLoginRequest>;
export type AuthResponse = Static<typeof AuthResponse>;
export type AuthSessionResponse = Static<typeof AuthSessionResponse>;
export type LogoutResponse = Static<typeof LogoutResponse>;
