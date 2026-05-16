import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

async function loadStorage() {
  vi.resetModules();
  return await import("../storage");
}

describe("AuthStorage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("saves token to native storage and keeps an in-memory cache", async () => {
    const { AuthStorage } = await loadStorage();

    await AuthStorage.saveToken("session-1");
    const token = await AuthStorage.getToken();

    expect(invokeMock).toHaveBeenCalledWith("save_auth_token", {
      token: "session-1",
    });
    expect(token).toBe("session-1");
    expect(localStorage.getItem("sakti-pos:session-token")).toBeNull();
  });

  test("loads token from native storage when memory cache is empty", async () => {
    invokeMock.mockResolvedValueOnce("native-session");
    const { AuthStorage } = await loadStorage();

    await expect(AuthStorage.getToken()).resolves.toBe("native-session");

    expect(invokeMock).toHaveBeenCalledWith("get_auth_token");
  });

  test("migrates legacy localStorage token into native storage once", async () => {
    localStorage.setItem("sakti-pos:session-token", "legacy-session");
    const { AuthStorage } = await loadStorage();

    await expect(AuthStorage.getToken()).resolves.toBe("legacy-session");

    expect(invokeMock).toHaveBeenCalledWith("save_auth_token", {
      token: "legacy-session",
    });
    expect(localStorage.getItem("sakti-pos:session-token")).toBeNull();
  });

  test("clears memory, native storage, and legacy localStorage", async () => {
    localStorage.setItem("sakti-pos:session-token", "legacy-session");
    const { AuthStorage } = await loadStorage();

    await AuthStorage.saveToken("session-1");
    await AuthStorage.clearToken();

    expect(invokeMock).toHaveBeenCalledWith("clear_auth_token");
    expect(localStorage.getItem("sakti-pos:session-token")).toBeNull();
    await expect(AuthStorage.getToken()).resolves.toBeNull();
  });

  test("returns null and removes legacy token when native storage fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("keystore failed"));
    const { AuthStorage } = await loadStorage();

    await expect(AuthStorage.getToken()).resolves.toBeNull();

    expect(localStorage.getItem("sakti-pos:session-token")).toBeNull();
  });
});
