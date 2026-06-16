import {
  error as pluginError,
  info as pluginInfo,
  warn as pluginWarn,
} from "@tauri-apps/plugin-log";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createLogger, logger } from "../logger";

vi.mock("@tauri-apps/plugin-log", () => ({
  debug: vi.fn(() => Promise.resolve()),
  error: vi.fn(() => Promise.resolve()),
  info: vi.fn(() => Promise.resolve()),
  warn: vi.fn(() => Promise.resolve()),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("logger", () => {
  test("formats info logs with context", () => {
    logger.info("cloud-auth:request", {
      method: "POST",
      path: "/api/auth/login",
    });

    expect(pluginInfo).toHaveBeenCalledWith(
      "[JS] [UI:CLOUD_AUTH_REQUEST] cloud-auth:request method=POST path=/api/auth/login"
    );
  });

  test("merges child context and formats errors", () => {
    const scoped = createLogger({ domain: "PRINTER", module: "printer" }).child(
      {
        scope: "settings",
      }
    );

    scoped.error("test:failed", new Error("Bluetooth is off"), {
      address: "00:11:22:33:44:55",
    });

    expect(pluginError).toHaveBeenCalledWith(
      '[JS] [PRINTER:TEST_FAILED] test:failed address=00:11:22:33:44:55 error="Error: Bluetooth is off"'
    );
  });

  test("applies domain defaults without repeating them at the call site", () => {
    const authLogger = createLogger({ domain: "AUTH", module: "auth" });

    authLogger.warn("session:missing");

    expect(pluginWarn).toHaveBeenCalledWith(
      "[JS] [AUTH:SESSION_MISSING] session:missing"
    );
  });
});
