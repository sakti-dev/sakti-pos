import { describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();

vi.mock("../db", () => ({
	db: {
		insert: (...args: unknown[]) => mockInsert(...args),
		select: (...args: unknown[]) => mockSelect(...args),
	},
}));

vi.mock("../lib/auth", () => ({
	narvik: {
		createSession: vi.fn(),
		invalidateSession: vi.fn(),
		cookieName: "narvik_session",
		validateSession: vi.fn(),
		createCookie: vi.fn(() => ({ serialize: () => "narvik_session=test" })),
		createBlankCookie: vi.fn(() => ({
			serialize: () => "narvik_session=; Max-Age=0",
		})),
	},
}));

vi.mock("cloudflare:workers", () => ({
	env: {
		TURSO_DATABASE_URL: "http://127.0.0.1:8080",
		TURSO_AUTH_TOKEN: "",
		GOOGLE_CLIENT_ID: "",
		GOOGLE_CLIENT_SECRET: "",
		API_URL: "http://localhost:3001",
		NODE_ENV: "development",
	},
}));

const { getCookie, createCookieString, createDeleteCookieString } =
	await import("../lib/session");

describe("getCookie", () => {
	test("extracts cookie value from request", () => {
		const request = new Request("http://localhost", {
			headers: { cookie: "narvik_session=abc123; other=value" },
		});
		expect(getCookie(request, "narvik_session")).toBe("abc123");
	});

	test("returns undefined when cookie not found", () => {
		const request = new Request("http://localhost", {
			headers: { cookie: "other=value" },
		});
		expect(getCookie(request, "narvik_session")).toBeUndefined();
	});

	test("returns undefined when no cookie header", () => {
		const request = new Request("http://localhost");
		expect(getCookie(request, "narvik_session")).toBeUndefined();
	});
});

describe("createCookieString", () => {
	test("creates cookie with all options", () => {
		const cookie = createCookieString("test", "value", {
			maxAge: 600,
			httpOnly: true,
			path: "/",
			sameSite: "Lax",
		});
		expect(cookie).toContain("test=value");
		expect(cookie).toContain("Max-Age=600");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain("SameSite=Lax");
	});

	test("creates minimal cookie", () => {
		const cookie = createCookieString("test", "value", {});
		expect(cookie).toBe("test=value");
	});
});

describe("createDeleteCookieString", () => {
	test("creates cookie with Max-Age=0", () => {
		const cookie = createDeleteCookieString("test", "/api");
		expect(cookie).toContain("test=");
		expect(cookie).toContain("Path=/api");
		expect(cookie).toContain("Max-Age=0");
	});

	test("uses default path", () => {
		const cookie = createDeleteCookieString("test");
		expect(cookie).toContain("Path=/");
	});
});
