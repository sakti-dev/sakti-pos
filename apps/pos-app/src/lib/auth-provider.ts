import { staff } from "@repo/database";
import bcrypt from "bcryptjs";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { db } from "~/db";

export type StaffRole = "cashier" | "manager" | "owner";

export interface AuthUser {
	id: string;
	name: string;
	role: StaffRole;
}

interface AuthProvider {
	changePin(staffId: string, newPin: string): Promise<void>;
	hashPin(pin: string): Promise<string>;
	verify(staffId: string, pin: string): Promise<AuthUser>;
}

class LocalAuthProvider implements AuthProvider {
	hashPin(pin: string): Promise<string> {
		return bcrypt.hash(pin, 10);
	}

	async verify(staffId: string, pin: string): Promise<AuthUser> {
		const rows = await db
			.select({
				id: staff.id,
				isActive: staff.isActive,
				name: staff.name,
				pin: staff.pin,
				role: staff.role,
			})
			.from(staff)
			.where(eq(staff.id, staffId));

		const row = rows[0];
		if (!row) {
			throw new Error("Staff not found");
		}
		if (!row.isActive) {
			throw new Error("Staff is deactivated");
		}

		if (!row.pin) {
			throw new Error("PIN not set");
		}

		const valid = await bcrypt.compare(pin, row.pin);
		if (!valid) {
			throw new Error("Invalid PIN");
		}

		return { id: row.id, name: row.name, role: row.role as AuthUser["role"] };
	}

	async changePin(staffId: string, newPin: string): Promise<void> {
		const hashed = await this.hashPin(newPin);
		await db
			.update(staff)
			.set({ pin: hashed, updatedAt: dayjs().toISOString() })
			.where(eq(staff.id, staffId));
	}
}

const provider = new LocalAuthProvider();

export const verifyPin = (staffId: string, pin: string) =>
	provider.verify(staffId, pin);
export const hashPin = (pin: string) => provider.hashPin(pin);
export const changePin = (staffId: string, newPin: string) =>
	provider.changePin(staffId, newPin);
