import {
  AuthLoginRequest,
  AuthRegisterRequest,
  AuthResponse,
  AuthSessionResponse,
  LogoutResponse,
} from "@repo/protobuf/auth";
import { Empty } from "@repo/protobuf/common";
import { protoFetch } from "./client";

export const authApi = {
  register: (payload: AuthRegisterRequest) =>
    protoFetch(
      "api/auth/register",
      { req: AuthRegisterRequest, res: AuthResponse },
      payload
    ),
  login: (payload: AuthLoginRequest) =>
    protoFetch(
      "api/auth/login",
      { req: AuthLoginRequest, res: AuthResponse },
      payload
    ),
  logout: () =>
    protoFetch("api/auth/logout", { req: Empty, res: LogoutResponse }, {}),
  session: () =>
    protoFetch(
      "api/auth/session",
      { req: Empty, res: AuthSessionResponse },
      {}
    ),
};
