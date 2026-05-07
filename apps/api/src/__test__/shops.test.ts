import { afterEach, describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../db", () => ({
	db: {
		insert: (...args: unknown[]) => mockInsert(...args),
		select: (...args: unknown[]) => mockSelect(...args),
		update: (...args: unknown[]) => mockUpdate(...args),
	},
}));

const mockValidateSession = vi.fn();
vi.mock("../lib/auth", () => ({
	narvik: {
		createSession: vi.fn(),
		invalidateSession: vi.fn(),
		cookieName: "narvik_session",
		validateSession: (...args: unknown[]) => mockValidateSession(...args),
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

const { shopsRoutes } = await import("../routes/shops");

async function makeRequest(
	path: string,
	options: { body?: unknown; cookie?: string; method?: string } = {},
) {
	const url = `http://localhost${path}`;
	const headers: Record<string, string> = {};
	if (options.cookie) headers.cookie = options.cookie;
	if (options.body) headers["Content-Type"] = "application/json";

	const init: RequestInit = { headers, method: options.method ?? "GET" };
	if (options.body) init.body = JSON.stringify(options.body);

	const request = new Request(url, init);
	const app = shopsRoutes.compile();
	const response = await app.handle(request);

	const status = response.status;
	const text = await response.text();
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		json = text;
	}
	return { json, status };
}

describe("POST /api/shops", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns 401 when no session", async () => {
		const { json, status } = await makeRequest("/api/shops", {
			method: "POST",
			body: { name: "Test Shop" },
		});
		expect(status).toBe(401);
		expect((json as Record<string, unknown>).error).toBe("Unauthorized");
	});

	test("creates shop and returns it", async () => {
		const now = new Date().toISOString();
		const shop = {
			id: "shop-1",
			name: "Test Shop",
			ownerId: "user-1",
			createdAt: now,
			updatedAt: now,
		};

		mockValidateSession.mockResolvedValue({
			id: "session-1",
			userId: "user-1",
		});
		mockInsert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([shop]),
			}),
		});
		mockUpdate.mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});

		const { json, status } = await makeRequest("/api/shops", {
			method: "POST",
			body: { name: "Test Shop" },
			cookie: "narvik_session=valid-token",
		});

		expect(status).toBe(200);
		expect((json as Record<string, unknown>).name).toBe("Test Shop");
	});
});

describe("GET /api/shops", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns 401 when no session", async () => {
		const { json, status } = await makeRequest("/api/shops");
		expect(status).toBe(401);
		expect((json as Record<string, unknown>).error).toBe("Unauthorized");
	});
});

describe("GET /api/shops/:id", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns 401 when no session", async () => {
		const { json, status } = await makeRequest("/api/shops/shop-1");
		expect(status).toBe(401);
		expect((json as Record<string, unknown>).error).toBe("Unauthorized");
	});
});
