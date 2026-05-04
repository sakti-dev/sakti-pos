import { eq } from "drizzle-orm";
import { createSignal } from "solid-js";
import { db } from "~/db";
import { users } from "~/db/schema";
import type { AuthUser } from "./auth-provider";
import { changePin, verifyPin } from "./auth-provider";

export type { AuthUser };

const LAST_USER_KEY = "sakti-pos:last-user-id";

const [user, setUser] = createSignal<AuthUser | null>(null);

export const isAuthenticated = () => user() !== null;
export const currentUser = () => user();
export const currentUserRole = () => user()?.role ?? null;

export const getLastUserId = (): number | null => {
  const stored = localStorage.getItem(LAST_USER_KEY);
  return stored ? Number(stored) : null;
};

export const setLastUserId = (id: number) => {
  localStorage.setItem(LAST_USER_KEY, String(id));
};

export const login = async (userId: number, pin: string): Promise<AuthUser> => {
  const authUser = await verifyPin(userId, pin);
  setUser(authUser);
  setLastUserId(authUser.id);
  return authUser;
};

export const logout = () => {
  setUser(null);
};

export const changeCurrentUserPin = async (newPin: string) => {
  const u = user();
  if (!u) {
    throw new Error("Not authenticated");
  }
  await changePin(u.id, newPin);
};

export const getActiveUsers = async (): Promise<AuthUser[]> => {
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.isActive, true));
  return rows.map((r) => ({ ...r, role: r.role as AuthUser["role"] }));
};
