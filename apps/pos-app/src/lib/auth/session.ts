import { eq } from "drizzle-orm";
import { createSignal } from "solid-js";
import { db, TABLE } from "~/db";
import type { AuthUser } from "~/lib/auth/pin";
import { changePin, verifyPin } from "~/lib/auth/pin";
import { createLogger, DEFAULT_BUSINESS_TIMEZONE } from "~/lib/utils";

const sessionLogger = createLogger({
  domain: "AUTH",
  module: "auth",
  scope: "session",
});

export type { StaffRole } from "~/lib/auth/pin";
export type { AuthUser };

const LAST_USER_KEY = "sakti-pos:last-staff-id";
const SCOPE_STORAGE_KEY = "sakti-pos:sync-scope";

const [user, setUser] = createSignal<AuthUser | null>(null);

const [scopeId, setScopeId] = createSignal<string | null>(
  localStorage.getItem(SCOPE_STORAGE_KEY)
);

export { scopeId };

export function setScope(id: string) {
  setScopeId(id);
  localStorage.setItem(SCOPE_STORAGE_KEY, id);
}

export function clearScope() {
  setScopeId(null);
  localStorage.removeItem(SCOPE_STORAGE_KEY);
}

export const isAuthenticated = () => user() !== null;
export const currentUser = () => user();
export const currentUserRole = () => user()?.role ?? null;

export const getLastUserId = (): string | null =>
  localStorage.getItem(LAST_USER_KEY);

export const setLastUserId = (id: string) => {
  localStorage.setItem(LAST_USER_KEY, id);
};

export const login = async (
  staffId: string,
  pin: string
): Promise<AuthUser> => {
  const authUser = await verifyPin(staffId, pin);
  setUser(authUser);
  setLastUserId(authUser.id);
  return authUser;
};

export const loginWithCloudStaff = async (
  staffId: string
): Promise<AuthUser> => {
  sessionLogger.info("login_with_cloud_staff:request", { staffId });
  const rows = await db
    .select({
      id: TABLE.staff.id,
      isActive: TABLE.staff.isActive,
      name: TABLE.staff.name,
      role: TABLE.staff.role,
    })
    .from(TABLE.staff)
    .where(eq(TABLE.staff.id, staffId));

  const row = rows[0];
  sessionLogger.info("login_with_cloud_staff:result", {
    found: !!row,
    isActive: row?.isActive,
    role: row?.role,
    staffId,
  });
  if (!row) {
    const localStaff = await db
      .select({
        id: TABLE.staff.id,
        isActive: TABLE.staff.isActive,
        merchantId: TABLE.staff.merchantId,
        name: TABLE.staff.name,
        role: TABLE.staff.role,
      })
      .from(TABLE.staff)
      .limit(10);
    sessionLogger.info("login_with_cloud_staff:local_sample", {
      count: localStaff.length,
      rows: localStaff,
      staffId,
    });
    throw new Error("Staff not found");
  }
  if (!row.isActive) {
    throw new Error("Staff is deactivated");
  }

  const authUser = {
    id: row.id,
    name: row.name,
    role: row.role as AuthUser["role"],
  };
  setUser(authUser);
  setLastUserId(authUser.id);
  return authUser;
};

/**
 * End the staff session only — the device stays paired (cloud token,
 * sync scope, synced data intact) so the next login is account-select
 * + PIN, not the full email flow.
 */
export const logout = () => {
  setUser(null);
};

/**
 * Full unpair: end the session AND forget the sync scope. Only for
 * explicit device-unpair flows (not the sidebar Keluar).
 */
export const unpair = () => {
  setUser(null);
  clearScope();
};

export const changeCurrentUserPin = async (newPin: string) => {
  const u = user();
  if (!u) {
    throw new Error("Not authenticated");
  }
  await changePin(u.id, newPin);
};

export const getActiveStaff = async (): Promise<AuthUser[]> => {
  const rows = await db
    .select({
      id: TABLE.staff.id,
      name: TABLE.staff.name,
      role: TABLE.staff.role,
    })
    .from(TABLE.staff)
    .where(eq(TABLE.staff.isActive, true));
  return rows.map((r) => ({ ...r, role: r.role as AuthUser["role"] }));
};

// --- Device / terminal context (merchant, outlet, register, timezone) ---

/** Outlet-scoped tax & service-charge configuration (from the outlets row). */
export interface OutletChargeConfig {
  readonly serviceChargePercentage: number;
  readonly taxPercentage: number;
  readonly useServiceCharge: boolean;
  readonly useTax: boolean;
}

export const DEFAULT_CHARGE_CONFIG: OutletChargeConfig = {
  useTax: false,
  taxPercentage: 0,
  useServiceCharge: false,
  serviceChargePercentage: 0,
};

const [currentOutletId, setCurrentOutletId] = createSignal<string | null>(null);
const [currentOutletTimezone, setCurrentOutletTimezone] = createSignal<string>(
  DEFAULT_BUSINESS_TIMEZONE
);
const [currentMerchantId, setCurrentMerchantId] = createSignal<string | null>(
  null
);
const [currentRegisterId, setCurrentRegisterId] = createSignal<string | null>(
  null
);
const [chargeConfig, setChargeConfigSignal] = createSignal<OutletChargeConfig>(
  DEFAULT_CHARGE_CONFIG
);

export {
  currentMerchantId,
  currentOutletId,
  currentOutletTimezone,
  currentRegisterId,
  setCurrentOutletId,
  setCurrentOutletTimezone,
};

export const CHARGE_CONFIG_STORAGE_KEY = "sakti-pos:outlet-charge-config";

export function outletChargeConfig(): OutletChargeConfig {
  return chargeConfig();
}

/** Update the in-memory + cached charge config (callers persist the DB row). */
export function setChargeConfig(config: OutletChargeConfig) {
  setChargeConfigSignal(config);
  localStorage.setItem(CHARGE_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export const OUTLET_STORAGE_KEY = "sakti-pos:current-outlet-id";
export const OUTLET_TIMEZONE_STORAGE_KEY = "sakti-pos:current-outlet-timezone";
export const MERCHANT_STORAGE_KEY = "sakti-pos:current-merchant-id";
export const REGISTER_STORAGE_KEY = "sakti-pos:current-register-id";

export function loadOutletContext() {
  const outletId = localStorage.getItem(OUTLET_STORAGE_KEY);
  const outletTimezone = localStorage.getItem(OUTLET_TIMEZONE_STORAGE_KEY);
  const merchantId = localStorage.getItem(MERCHANT_STORAGE_KEY);
  const registerId = localStorage.getItem(REGISTER_STORAGE_KEY);
  const cachedChargeConfig = localStorage.getItem(CHARGE_CONFIG_STORAGE_KEY);
  if (cachedChargeConfig) {
    try {
      setChargeConfigSignal({
        ...DEFAULT_CHARGE_CONFIG,
        ...JSON.parse(cachedChargeConfig),
      });
    } catch {
      localStorage.removeItem(CHARGE_CONFIG_STORAGE_KEY);
    }
  }
  if (outletId) {
    setCurrentOutletId(outletId);
  }
  if (outletTimezone) {
    setCurrentOutletTimezone(outletTimezone);
  }
  if (merchantId) {
    setCurrentMerchantId(merchantId);
  }
  if (registerId) {
    setCurrentRegisterId(registerId);
  }
}

export function setOutletContext(
  outletId: string,
  merchantId: string,
  registerId?: string,
  timezone = DEFAULT_BUSINESS_TIMEZONE
) {
  setCurrentOutletId(outletId);
  setOutletTimezone(timezone);
  setCurrentMerchantId(merchantId);
  localStorage.setItem(OUTLET_STORAGE_KEY, outletId);
  localStorage.setItem(MERCHANT_STORAGE_KEY, merchantId);
  if (registerId) {
    setCurrentRegisterId(registerId);
    localStorage.setItem(REGISTER_STORAGE_KEY, registerId);
  }
}

export const isDevicePaired = (): boolean => currentOutletId() !== null;

export function setOutletTimezone(timezone: string) {
  setCurrentOutletTimezone(timezone);
  localStorage.setItem(OUTLET_TIMEZONE_STORAGE_KEY, timezone);
}

export function clearOutletContext() {
  setCurrentOutletId(null);
  setCurrentOutletTimezone(DEFAULT_BUSINESS_TIMEZONE);
  setCurrentMerchantId(null);
  setCurrentRegisterId(null);
  localStorage.removeItem(OUTLET_STORAGE_KEY);
  localStorage.removeItem(OUTLET_TIMEZONE_STORAGE_KEY);
  localStorage.removeItem(MERCHANT_STORAGE_KEY);
  localStorage.removeItem(REGISTER_STORAGE_KEY);
}
