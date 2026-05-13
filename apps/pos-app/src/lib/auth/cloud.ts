import { AuthLoginRequest, AuthRegisterRequest } from "@repo/protobuf/auth";
import { HTTPError } from "ky";
import { authApi } from "~/lib/api/auth";
import { merchantsApi } from "~/lib/api/merchants";
import { outletsApi } from "~/lib/api/outlets";
import { registersApi } from "~/lib/api/registers";
import { staffApi } from "~/lib/api/staff";
import { API_URL, getApiErrorMessage } from "~/lib/http";
import { createLogger } from "~/lib/logger";
import { AuthStorage } from "./storage";

const cloudAuthLogger = createLogger({
  domain: "AUTH",
  module: "auth",
  scope: "cloud",
});

interface ApiUser {
  email: string;
  id: string;
  name: string;
}

interface Merchant {
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
}

interface SessionMerchant {
  merchantId: string;
  name: string;
  role: string;
}

interface Outlet {
  address: string | null;
  id: string;
  isActive: boolean;
  merchantId: string;
  name: string;
  receiptAddress: string | null;
  receiptName: string | null;
  timezone: string;
}

interface Register {
  id: string;
  isActive: boolean;
  name: string;
  outletId: string;
  pairingCode: string | null;
  shortId: string;
}

interface PairResult {
  outlet: Outlet;
  register: Register;
}

interface CurrentCloudStaff {
  claimed: boolean;
  reason?: "no-staff" | "ambiguous-owner" | "not-allowed";
  staff: {
    hasPin: boolean;
    id: string;
    isActive: boolean;
    merchantId: string;
    name: string;
    outletId: string | null;
    role: "cashier" | "manager" | "owner";
  } | null;
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function logRequest(method: string, path: string): Promise<void> {
  const token = await AuthStorage.getToken();
  cloudAuthLogger.info("request", {
    hasToken: !!token,
    method,
    path,
  });
}

async function withError<T>(
  promise: Promise<T>,
  method: string,
  path: string
): Promise<T> {
  try {
    const result = await promise;
    cloudAuthLogger.info("response", { method, ok: true, path });
    return result;
  } catch (error) {
    cloudAuthLogger.error("network-error", error, { method, path });
    const message = await getApiErrorMessage(error);
    if (error instanceof HTTPError) {
      const response = error.response;
      throw new ApiError(message, response.status);
    }
    throw new ApiError(message, 500);
  }
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<{ user: ApiUser }> {
  await logRequest("POST", "api/auth/register");
  const result = await withError(
    authApi.register(AuthRegisterRequest.create({ email, name, password })),
    "POST",
    "api/auth/register"
  );
  if (!result.user) {
    throw new Error("Register response returned no user");
  }
  await AuthStorage.saveToken(result.sessionToken);
  return { user: result.user };
}

export async function login(
  email: string,
  password: string
): Promise<{ user: ApiUser }> {
  await logRequest("POST", "api/auth/login");
  const result = await withError(
    authApi.login(AuthLoginRequest.create({ email, password })),
    "POST",
    "api/auth/login"
  );
  if (!result.user) {
    throw new Error("Login response returned no user");
  }
  await AuthStorage.saveToken(result.sessionToken);
  return { user: result.user };
}

export async function getSession(): Promise<{
  merchants: SessionMerchant[];
  user: ApiUser | null;
}> {
  const result = await authApi.session();
  return {
    merchants: result.merchants,
    user: result.hasUser && result.user ? result.user : null,
  };
}

export async function logout(): Promise<void> {
  await authApi.logout();
  await AuthStorage.clearToken();
}

export function getGoogleOAuthUrl(): string {
  return `${API_URL}/api/auth/google`;
}

export function getMerchants(): Promise<SessionMerchant[]> {
  return merchantsApi.list().then((result) => result.merchants);
}

export async function createMerchant(name: string): Promise<Merchant> {
  const result = await merchantsApi.create({ name });
  if (!result.merchant) {
    throw new Error("Merchant creation returned no merchant");
  }
  return result.merchant;
}

export function getOutlets(merchantId: string): Promise<Outlet[]> {
  return withError(
    outletsApi.list({ merchantId }),
    "POST",
    "api/outlets/list"
  ).then((result) =>
    result.outlets.map((outlet) => ({
      address: outlet.hasAddress ? outlet.address : null,
      id: outlet.id,
      isActive: outlet.isActive,
      merchantId: outlet.merchantId,
      name: outlet.name,
      receiptAddress: outlet.hasReceiptAddress ? outlet.receiptAddress : null,
      receiptName: outlet.hasReceiptName ? outlet.receiptName : null,
      timezone: outlet.timezone,
    }))
  );
}

export function createOutlet(
  merchantId: string,
  name: string,
  address?: string,
  timezone = "Asia/Jakarta"
): Promise<Outlet & { register?: Register }> {
  return withError(
    outletsApi.create({
      address: address ?? "",
      hasAddress: address !== undefined,
      merchantId,
      name,
      timezone,
    }),
    "POST",
    "api/outlets/create"
  ).then((result) => {
    if (!result.outlet) {
      throw new Error("Outlet creation returned no outlet");
    }

    return {
      address: result.outlet.hasAddress ? result.outlet.address : null,
      id: result.outlet.id,
      isActive: result.outlet.isActive,
      merchantId: result.outlet.merchantId,
      name: result.outlet.name,
      receiptAddress: result.outlet.hasReceiptAddress
        ? result.outlet.receiptAddress
        : null,
      receiptName: result.outlet.hasReceiptName
        ? result.outlet.receiptName
        : null,
      timezone: result.outlet.timezone,
      register:
        result.hasRegister && result.register
          ? {
              id: result.register.id,
              isActive: result.register.isActive,
              name: result.register.name,
              outletId: result.register.outletId,
              pairingCode: result.register.hasPairingCode
                ? result.register.pairingCode
                : null,
              shortId: result.register.shortId,
            }
          : undefined,
    };
  });
}

export function createStaff(params: {
  merchantId: string;
  outletId?: string;
  name: string;
  pin: string;
  role?: "cashier" | "manager" | "owner";
}): Promise<Record<string, unknown>> {
  return withError(
    staffApi.create({
      hasOutletId: params.outletId !== undefined,
      merchantId: params.merchantId,
      name: params.name,
      outletId: params.outletId ?? "",
      pin: params.pin,
      role: params.role ?? "cashier",
    }),
    "POST",
    "api/staff/create"
  ).then((result) => ({
    staff: result.staff
      ? {
          createdAt: result.staff.createdAt,
          hasPin: result.staff.hasPin,
          id: result.staff.id,
          isActive: result.staff.isActive,
          merchantId: result.staff.merchantId,
          name: result.staff.name,
          outletId: result.staff.hasOutletId ? result.staff.outletId : null,
          role: result.staff.role,
          updatedAt: result.staff.updatedAt,
        }
      : null,
  }));
}

export function getCurrentCloudStaff(
  merchantId: string
): Promise<CurrentCloudStaff> {
  return withError(
    staffApi.current({ merchantId }),
    "POST",
    "api/staff/current"
  ).then((result) => ({
    claimed: result.claimed,
    reason:
      result.reason === ""
        ? undefined
        : (result.reason as CurrentCloudStaff["reason"]),
    staff:
      result.hasStaff && result.staff
        ? {
            hasPin: result.staff.hasPin,
            id: result.staff.id,
            isActive: result.staff.isActive,
            merchantId: result.staff.merchantId,
            name: result.staff.name,
            outletId: result.staff.hasOutletId ? result.staff.outletId : null,
            role: result.staff.role as "cashier" | "manager" | "owner",
          }
        : null,
  }));
}

export function pairRegister(pairingCode: string): Promise<PairResult> {
  return withError(
    registersApi.pair({ pairingCode }),
    "POST",
    "api/registers/pair"
  ).then((result) => {
    if (!(result.outlet && result.register)) {
      throw new Error("Register pairing returned incomplete data");
    }

    return {
      outlet: {
        address: result.outlet.hasAddress ? result.outlet.address : null,
        id: result.outlet.id,
        isActive: result.outlet.isActive,
        merchantId: result.outlet.merchantId,
        name: result.outlet.name,
        receiptAddress: result.outlet.hasReceiptAddress
          ? result.outlet.receiptAddress
          : null,
        receiptName: result.outlet.hasReceiptName
          ? result.outlet.receiptName
          : null,
        timezone: result.outlet.timezone,
      },
      register: {
        id: result.register.id,
        isActive: result.register.isActive,
        name: result.register.name,
        outletId: result.register.outletId,
        pairingCode: result.register.hasPairingCode
          ? result.register.pairingCode
          : null,
        shortId: result.register.shortId,
      },
    };
  });
}

export async function isCloudAuthenticated(): Promise<boolean> {
  const token = await AuthStorage.getToken();
  return token !== null;
}

export type {
  ApiUser,
  CurrentCloudStaff,
  Merchant,
  Outlet,
  PairResult,
  Register,
  SessionMerchant,
};
export { ApiError };
