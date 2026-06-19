import { eq } from "drizzle-orm";
import { createSignal } from "solid-js";
import { db, TABLE } from "~/db";
import type { AuthUser } from "~/lib/auth/pin";
import { changePin, verifyPin } from "~/lib/auth/pin";
import { createLogger } from "~/lib/utils";

const authLogger = createLogger({ domain: "AUTH", module: "auth" });

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
  authLogger.info("login_with_cloud_staff:request", { staffId });
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
  authLogger.info("login_with_cloud_staff:result", {
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
    authLogger.info("login_with_cloud_staff:local_sample", {
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

export const logout = () => {
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
