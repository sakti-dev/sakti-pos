import { HTTPError } from "ky";
import { API_URL, api, getApiErrorMessage } from "~/lib/http";
import { createLogger } from "~/lib/logger";
import { AuthStorage } from "./storage";

const cloudAuthLogger = createLogger({ module: "auth", scope: "cloud" });

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
    api
      .post("api/auth/register", {
        json: { email, name, password },
      })
      .json<{ sessionToken: string; user: ApiUser }>(),
    "POST",
    "api/auth/register"
  );
  await AuthStorage.saveToken(result.sessionToken);
  return { user: result.user };
}

export async function login(
  email: string,
  password: string
): Promise<{ user: ApiUser }> {
  await logRequest("POST", "api/auth/login");
  const result = await withError(
    api
      .post("api/auth/login", {
        json: { email, password },
      })
      .json<{ sessionToken: string; user: ApiUser }>(),
    "POST",
    "api/auth/login"
  );
  await AuthStorage.saveToken(result.sessionToken);
  return { user: result.user };
}

export function getSession(): Promise<{
  merchants: SessionMerchant[];
  user: ApiUser | null;
}> {
  return api.get("api/auth/session").json<{
    merchants: SessionMerchant[];
    user: ApiUser | null;
  }>();
}

export async function logout(): Promise<void> {
  await api.post("api/auth/logout");
}

export function getGoogleOAuthUrl(): string {
  return `${API_URL}/api/auth/google`;
}

export function getMerchants(): Promise<SessionMerchant[]> {
  return api.get("api/merchants").json<SessionMerchant[]>();
}

export function createMerchant(name: string): Promise<Merchant> {
  return api.post("api/merchants", { json: { name } }).json<Merchant>();
}

export function getOutlets(merchantId: string): Promise<Outlet[]> {
  return api.get(`api/merchants/${merchantId}/outlets`).json<Outlet[]>();
}

export function createOutlet(
  merchantId: string,
  name: string,
  address?: string
): Promise<Outlet & { register?: Register }> {
  return api
    .post(`api/merchants/${merchantId}/outlets`, {
      json: { address, name },
    })
    .json<Outlet & { register?: Register }>();
}

export function createStaff(params: {
  merchantId: string;
  outletId?: string;
  name: string;
  pin: string;
  role?: "cashier" | "manager" | "owner";
}): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    name: params.name,
    pin: params.pin,
    role: params.role ?? "cashier",
  };
  if (params.outletId) {
    body.outletId = params.outletId;
  }
  return api
    .post(`api/merchants/${params.merchantId}/staff`, { json: body })
    .json<Record<string, unknown>>();
}

export function getCurrentCloudStaff(
  merchantId: string
): Promise<CurrentCloudStaff> {
  return api
    .post(`api/merchants/${merchantId}/staff/me`)
    .json<CurrentCloudStaff>();
}

export function pairRegister(pairingCode: string): Promise<PairResult> {
  return api
    .post("api/registers/pair", { json: { pairingCode } })
    .json<PairResult>();
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
