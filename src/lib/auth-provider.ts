import bcrypt from "bcryptjs";
import { invoke } from "@tauri-apps/api/core";
import { db } from "~/db";
import { users } from "~/db/schema";
import { eq, sql } from "drizzle-orm";

type SqlRow = {
  columns: string[];
  values: unknown[];
};

export interface AuthUser {
  id: number;
  name: string;
  role: "owner" | "manager" | "cashier";
}

interface AuthProvider {
  verify(userId: number, pin: string): Promise<AuthUser>;
  hashPin(pin: string): Promise<string>;
  changePin(userId: number, newPin: string): Promise<void>;
}

class LocalAuthProvider implements AuthProvider {
  async hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, 10);
  }

  async verify(userId: number, pin: string): Promise<AuthUser> {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        pin: users.pin,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId));

    const row = rows[0];
    if (!row) throw new Error("User not found");
    if (!row.isActive) throw new Error("User is deactivated");

    const valid = await bcrypt.compare(pin, row.pin);
    if (!valid) throw new Error("Invalid PIN");

    return { id: row.id, name: row.name, role: row.role as AuthUser["role"] };
  }

  async changePin(userId: number, newPin: string): Promise<void> {
    const hashed = await this.hashPin(newPin);
    await db
      .update(users)
      .set({ pin: hashed, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));
  }
}

const provider = new LocalAuthProvider();

export const verifyPin = (userId: number, pin: string) => provider.verify(userId, pin);
export const hashPin = (pin: string) => provider.hashPin(pin);
export const changePin = (userId: number, newPin: string) => provider.changePin(userId, newPin);

export async function seedDefaultOwner() {
  const hashedPin = await hashPin("123456");
  const now = new Date().toISOString();
  try {
    await db.run(
      sql`INSERT OR IGNORE INTO users (name, pin, role, is_active, created_at, updated_at) VALUES (${"Owner"}, ${hashedPin}, ${"owner"}, ${1}, ${now}, ${now})`,
    );
  } catch {}
}
