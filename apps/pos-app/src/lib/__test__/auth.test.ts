import { beforeEach, describe, expect, test, vi } from "vitest";

const mockSetUser = vi.fn();
const mockUser = vi.fn<() => { id: number; name: string; role: string } | null>(
  () => null
);
const mockVerifyPin = vi.fn();
const mockChangePin = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("solid-js", () => ({
  createSignal: () => [mockUser, mockSetUser],
}));

vi.mock("~/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => mockDbSelect(),
      }),
    }),
  },
}));

vi.mock("~/lib/auth-provider", () => ({
  verifyPin: (...args: unknown[]) => mockVerifyPin(...args),
  changePin: (...args: unknown[]) => mockChangePin(...args),
}));

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("getLastUserId / setLastUserId", () => {
    test("returns null when no stored value", async () => {
      const { getLastUserId } = await import("~/lib/auth");
      expect(getLastUserId()).toBeNull();
    });

    test("returns stored user id", async () => {
      const { getLastUserId, setLastUserId } = await import("~/lib/auth");
      setLastUserId(42);
      expect(getLastUserId()).toBe(42);
    });
  });

  describe("isAuthenticated / currentUser / currentUserRole", () => {
    test("returns false when no user", async () => {
      mockUser.mockReturnValue(null);
      const { isAuthenticated } = await import("~/lib/auth");
      expect(isAuthenticated()).toBe(false);
    });

    test("returns true when user is set", async () => {
      mockUser.mockReturnValue({ id: 1, name: "Owner", role: "owner" });
      const { isAuthenticated } = await import("~/lib/auth");
      expect(isAuthenticated()).toBe(true);
    });

    test("currentUser returns the user object", async () => {
      const u = { id: 2, name: "Kasir", role: "cashier" };
      mockUser.mockReturnValue(u);
      const { currentUser } = await import("~/lib/auth");
      expect(currentUser()).toEqual(u);
    });

    test("currentUserRole returns role when set", async () => {
      mockUser.mockReturnValue({ id: 1, name: "Owner", role: "manager" });
      const { currentUserRole } = await import("~/lib/auth");
      expect(currentUserRole()).toBe("manager");
    });

    test("currentUserRole returns null when no user", async () => {
      mockUser.mockReturnValue(null);
      const { currentUserRole } = await import("~/lib/auth");
      expect(currentUserRole()).toBeNull();
    });
  });

  describe("login", () => {
    test("calls verifyPin, sets user, and stores last user id", async () => {
      const authUser = { id: 5, name: "Test", role: "cashier" };
      mockVerifyPin.mockResolvedValue(authUser);

      const { login } = await import("~/lib/auth");
      const result = await login(5, "123456");

      expect(mockVerifyPin).toHaveBeenCalledWith(5, "123456");
      expect(mockSetUser).toHaveBeenCalledWith(authUser);
      expect(result).toEqual(authUser);
      expect(localStorage.getItem("sakti-pos:last-user-id")).toBe("5");
    });
  });

  describe("logout", () => {
    test("clears the user signal", async () => {
      const { logout } = await import("~/lib/auth");
      logout();
      expect(mockSetUser).toHaveBeenCalledWith(null);
    });
  });

  describe("changeCurrentUserPin", () => {
    test("throws when not authenticated", async () => {
      mockUser.mockReturnValue(null);
      const { changeCurrentUserPin } = await import("~/lib/auth");
      await expect(changeCurrentUserPin("654321")).rejects.toThrow(
        "Not authenticated"
      );
    });

    test("calls changePin with user id", async () => {
      mockUser.mockReturnValue({ id: 3, name: "Test", role: "owner" });
      const { changeCurrentUserPin } = await import("~/lib/auth");
      await changeCurrentUserPin("654321");
      expect(mockChangePin).toHaveBeenCalledWith(3, "654321");
    });
  });

  describe("getActiveUsers", () => {
    test("returns active users from db", async () => {
      mockDbSelect.mockResolvedValue([
        { id: 1, name: "Owner", role: "owner" },
        { id: 2, name: "Kasir", role: "cashier" },
      ]);

      const { getActiveUsers } = await import("~/lib/auth");
      const users = await getActiveUsers();

      expect(users).toEqual([
        { id: 1, name: "Owner", role: "owner" },
        { id: 2, name: "Kasir", role: "cashier" },
      ]);
    });

    test("returns empty array when no active users", async () => {
      mockDbSelect.mockResolvedValue([]);
      const { getActiveUsers } = await import("~/lib/auth");
      const users = await getActiveUsers();
      expect(users).toEqual([]);
    });
  });
});
