import { staff } from "@repo/database";
import { invoke } from "@tauri-apps/api/core";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { AuthStorage } from "~/lib/auth-storage";

export type StaffRole = "cashier" | "manager" | "owner";

export interface AuthUser {
	id: string;
	name: string;
	role: StaffRole;
}

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH_LENGTH = 256;
const PBKDF2_ALGORITHM = "SHA-256";

async function verifyPinHash(hash: string, pin: string): Promise<boolean> {
	const [saltHex, hashHex] = hash.split(":");
	const saltBytes = saltHex.match(/.{1,2}/g);
	if (!saltBytes) return false;
	const salt = new Uint8Array(
		saltBytes.map((byte) => Number.parseInt(byte, 16)),
	);
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(pin),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const keyMaterial = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: PBKDF2_ALGORITHM,
		},
		key,
		PBKDF2_HASH_LENGTH,
	);
	const computed = Array.from(new Uint8Array(keyMaterial))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return computed === hashHex;
}

export async function verifyPin(
	staffId: string,
	pin: string,
): Promise<AuthUser> {
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

	const valid = await verifyPinHash(row.pin, pin);
	if (!valid) {
		throw new Error("Invalid PIN");
	}

	return { id: row.id, name: row.name, role: row.role as AuthUser["role"] };
}

export async function changePin(
	staffId: string,
	newPin: string,
): Promise<void> {
	const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
	const sessionToken = await AuthStorage.getToken();
	if (!sessionToken) {
		throw new Error("Not authenticated");
	}

	const response = await fetch(`${apiUrl}/api/staff/${staffId}/pin`, {
		method: "PATCH",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${sessionToken}`,
		},
		body: JSON.stringify({ pin: newPin }),
	});

	if (!response.ok) {
		throw new Error("Failed to change PIN");
	}

	const result = await response.json();

	if (import.meta.env.TAURI) {
		await invoke("run_sql", {
			query: {
				sql: "UPDATE staff SET pin = ?1, updated_at = ?2, is_synced = 0 WHERE id = ?3",
				params: [result.pin, new Date().toISOString(), staffId],
				method: "run",
			},
		});
	}
}
