import bcrypt from "bcryptjs";
import { describe, expect, test, vi } from "vitest";

vi.mock("~/db", () => ({
  db: {
    run: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [
          {
            id: 1,
            isActive: true,
            name: "Owner",
            pin: "$2a$10$hashedpin",
            role: "owner",
          },
        ]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

describe("auth-provider", () => {
  test("hashPin returns a bcrypt hash", async () => {
    const { hashPin } = await import("../auth-provider");
    const hash = await hashPin("123456");
    expect(hash).not.toBe("123456");
    expect(hash.startsWith("$2")).toBe(true);
  });

  test("verifyPin succeeds with correct pin", async () => {
    const pin = "123456";
    const hash = await bcrypt.hash(pin, 10);
    const { verifyPin } = await import("../auth-provider");

    vi.mocked(vi.mocked(await import("~/db")).db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => [
          {
            id: 1,
            isActive: true,
            name: "Owner",
            pin: hash,
            role: "owner",
          },
        ]),
      })),
    } as never);

    const user = await verifyPin(1, pin);
    expect(user.name).toBe("Owner");
    expect(user.role).toBe("owner");
  });
});
