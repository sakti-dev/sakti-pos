import { t } from "elysia";

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

export type ApiUser = typeof ApiUser.static;
export type SessionMerchant = typeof SessionMerchant.static;
export type AuthRegisterRequest = typeof AuthRegisterRequest.static;
export type AuthLoginRequest = typeof AuthLoginRequest.static;
export type AuthResponse = typeof AuthResponse.static;
export type AuthSessionResponse = typeof AuthSessionResponse.static;
export type LogoutResponse = typeof LogoutResponse.static;
