import { API_URL, eden } from "~/lib/api/eden";
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

function throwIfError<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    throw result.error;
  }
  if (result.data == null) {
    throw new Error("Unexpected null response from API");
  }
  return result.data;
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<{ user: ApiUser }> {
  await logRequest("POST", "api/auth/register");
  const result = throwIfError(
    await eden.api.auth.register.post({ email, name, password })
  );
  if (!result.user) {
    throw new Error("Register response returned no user");
  }
  if (result.sessionToken) {
    await AuthStorage.saveToken(result.sessionToken);
  }
  return { user: result.user };
}

export async function login(
  email: string,
  password: string
): Promise<{ user: ApiUser }> {
  await logRequest("POST", "api/auth/login");
  const result = throwIfError(
    await eden.api.auth.login.post({ email, password })
  );
  if (!result.user) {
    throw new Error("Login response returned no user");
  }
  if (result.sessionToken) {
    await AuthStorage.saveToken(result.sessionToken);
  }
  return { user: result.user };
}

export async function getSession(): Promise<{
  merchants: SessionMerchant[];
  user: ApiUser | null;
}> {
  const result = throwIfError(await eden.api.auth.session.post());
  return {
    merchants: result.merchants,
    user: result.hasUser && result.user ? result.user : null,
  };
}

export async function logout(): Promise<void> {
  throwIfError(await eden.api.auth.logout.post());
  await AuthStorage.clearToken();
}

export function getGoogleOAuthUrl(): string {
  return `${API_URL}/api/auth/google`;
}

export async function getMerchants(): Promise<SessionMerchant[]> {
  const result = throwIfError(await eden.api.merchants.list.post());
  return result.merchants;
}

export async function createMerchant(name: string): Promise<Merchant> {
  const result = throwIfError(await eden.api.merchants.create.post({ name }));
  if (!result.merchant) {
    throw new Error("Merchant creation returned no merchant");
  }
  return result.merchant;
}

export async function getOutlets(merchantId: string): Promise<Outlet[]> {
  const result = throwIfError(await eden.api.outlets.list.post({ merchantId }));
  return result.outlets;
}

export async function createOutlet(
  merchantId: string,
  name: string,
  address?: string,
  timezone = "Asia/Jakarta"
): Promise<Outlet & { register?: Register }> {
  const result = throwIfError(
    await eden.api.outlets.create.post({
      address: address ?? "",
      merchantId,
      name,
      timezone,
    })
  );
  if (!result.outlet) {
    throw new Error("Outlet creation returned no outlet");
  }

  return {
    address: result.outlet.address,
    id: result.outlet.id,
    isActive: result.outlet.isActive,
    merchantId: result.outlet.merchantId,
    name: result.outlet.name,
    receiptAddress: result.outlet.receiptAddress,
    receiptName: result.outlet.receiptName,
    timezone: result.outlet.timezone,
    register: result.register
      ? {
          id: result.register.id,
          isActive: result.register.isActive,
          name: result.register.name,
          outletId: result.register.outletId,
          pairingCode: result.register.pairingCode,
          shortId: result.register.shortId,
        }
      : undefined,
  };
}

export async function createStaff(params: {
  merchantId: string;
  outletId?: string;
  name: string;
  pin: string;
  role?: "cashier" | "manager" | "owner";
}): Promise<Record<string, unknown>> {
  const result = throwIfError(
    await eden.api.staff.create.post({
      merchantId: params.merchantId,
      name: params.name,
      outletId: params.outletId ?? "",
      pin: params.pin,
      role: params.role ?? "cashier",
    })
  );
  return {
    staff: result.staff
      ? {
          createdAt: result.staff.createdAt,
          id: result.staff.id,
          isActive: result.staff.isActive,
          merchantId: result.staff.merchantId,
          name: result.staff.name,
          outletId: result.staff.outletId,
          role: result.staff.role,
          updatedAt: result.staff.updatedAt,
        }
      : null,
  };
}

export async function getCurrentCloudStaff(
  merchantId: string
): Promise<CurrentCloudStaff> {
  const result = throwIfError(
    await eden.api.staff.current.post({ merchantId })
  );
  return {
    claimed: result.claimed,
    reason:
      result.reason === ""
        ? undefined
        : (result.reason as CurrentCloudStaff["reason"]),
    staff: result.staff
      ? {
          id: result.staff.id,
          isActive: result.staff.isActive,
          merchantId: result.staff.merchantId,
          name: result.staff.name,
          outletId: result.staff.outletId,
          role: result.staff.role as "cashier" | "manager" | "owner",
        }
      : null,
  };
}

export async function pairRegister(pairingCode: string): Promise<PairResult> {
  const result = throwIfError(
    await eden.api.registers.pair.post({ pairingCode })
  );
  const data = result as { outlet?: Outlet; register?: Register };
  if (!(data.outlet && data.register)) {
    throw new Error("Register pairing returned incomplete data");
  }

  return {
    outlet: {
      address: data.outlet.address,
      id: data.outlet.id,
      isActive: data.outlet.isActive,
      merchantId: data.outlet.merchantId,
      name: data.outlet.name,
      receiptAddress: data.outlet.receiptAddress,
      receiptName: data.outlet.receiptName,
      timezone: data.outlet.timezone,
    },
    register: {
      id: data.register.id,
      isActive: data.register.isActive,
      name: data.register.name,
      outletId: data.register.outletId,
      pairingCode: data.register.pairingCode,
      shortId: data.register.shortId,
    },
  };
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
