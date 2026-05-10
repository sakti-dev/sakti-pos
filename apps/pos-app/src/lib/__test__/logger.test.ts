import { afterEach, describe, expect, test, vi } from "vitest";
import { createLogger, logger } from "../logger";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("logger", () => {
	test("formats info logs with context", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});

		logger.info("cloud-auth:request", {
			method: "POST",
			path: "/api/auth/login",
		});

		expect(info).toHaveBeenCalledWith(
			'[INFO] cloud-auth:request {"method":"POST","path":"/api/auth/login"}',
		);
	});

	test("merges child context and formats errors", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const scoped = createLogger({ module: "printer" }).child({
			scope: "settings",
		});

		scoped.error(
			"test:failed",
			new Error("Bluetooth is off"),
			{ address: "00:11:22:33:44:55" },
		);

		expect(error).toHaveBeenCalledWith(
			'[ERROR] test:failed {"module":"printer","scope":"settings","address":"00:11:22:33:44:55","error":"Error: Bluetooth is off"}',
		);
	});

	test("applies module defaults without repeating them at the call site", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const authLogger = createLogger({ module: "auth" });

		authLogger.warn("session:missing");

		expect(warn).toHaveBeenCalledWith(
			'[WARN] session:missing {"module":"auth"}',
		);
	});
});
