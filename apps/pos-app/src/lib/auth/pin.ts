import { eq } from "drizzle-orm";
import { db, TABLE } from "~/db";
import { eden } from "~/lib/api/eden";
import { AuthStorage } from "~/lib/auth/storage";

export type StaffRole = "cashier" | "manager" | "owner";

export interface AuthUser {
  id: string;
  name: string;
  role: StaffRole;
}

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_LENGTH = 256;
const PBKDF2_ALGORITHM = "SHA-256";

async function verifyPinHash(hash: string, pin: string): Promise<boolean> {
  const [saltHex, hashHex] = hash.split(":");
  const saltBytes = saltHex.match(/.{1,2}/g);
  if (!saltBytes) {
    return false;
  }
  const salt = new Uint8Array(
    saltBytes.map((byte) => Number.parseInt(byte, 16))
  );
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const keyMaterial = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_ALGORITHM,
    },
    key,
    PBKDF2_HASH_LENGTH
  );
  const computed = Array.from(new Uint8Array(keyMaterial))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === hashHex;
}

export async function verifyPin(
  staffId: string,
  pin: string
): Promise<AuthUser> {
  const rows = await db
    .select({
      id: TABLE.staff.id,
      isActive: TABLE.staff.isActive,
      name: TABLE.staff.name,
      pin: TABLE.staff.pin,
      role: TABLE.staff.role,
    })
    .from(TABLE.staff)
    .where(eq(TABLE.staff.id, staffId));

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
  newPin: string
): Promise<void> {
  const sessionToken = await AuthStorage.getToken();
  if (!sessionToken) {
    throw new Error("Not authenticated");
  }

  const result = await eden.api.staff["update-pin"].post({
    id: staffId,
    pin: newPin,
  });

  if (result.error) {
    throw new Error("Failed to change PIN");
  }
}
