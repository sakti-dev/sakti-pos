import { staff } from "@repo/database";
import { eq } from "drizzle-orm";
import { createSignal } from "solid-js";
import { db } from "~/db";
import type { AuthUser } from "~/lib/auth-provider";
import { changePin, verifyPin } from "~/lib/auth-provider";

export type { StaffRole } from "~/lib/auth-provider";
export type { AuthUser };

const LAST_USER_KEY = "sakti-pos:last-staff-id";

const [user, setUser] = createSignal<AuthUser | null>(null);

export const isAuthenticated = () => user() !== null;
export const currentUser = () => user();
export const currentUserRole = () => user()?.role ?? null;

export const getLastUserId = (): string | null => {
	return localStorage.getItem(LAST_USER_KEY);
};

export const setLastUserId = (id: string) => {
	localStorage.setItem(LAST_USER_KEY, id);
};

export const login = async (
	staffId: string,
	pin: string,
): Promise<AuthUser> => {
	const authUser = await verifyPin(staffId, pin);
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

export const getActiveStaff = async (): Promise<AuthUser[]> => {
	const rows = await db
		.select({ id: staff.id, name: staff.name, role: staff.role })
		.from(staff)
		.where(eq(staff.isActive, true));
	return rows.map((r) => ({ ...r, role: r.role as AuthUser["role"] }));
};
