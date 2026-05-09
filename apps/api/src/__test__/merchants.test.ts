import { afterEach, describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../db", () => ({
	db: {
		insert: (...args: unknown[]) => mockInsert(...args),
		select: (...args: unknown[]) => mockSelect(...args),
		update: (...args: unknown[]) => mockUpdate(...args),
		delete: (...args: unknown[]) => mockDelete(...args),
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

const { merchantsRoutes } = await import("../routes/merchants");

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
	const app = merchantsRoutes.compile();
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

describe("POST /api/merchants", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns 401 when no session", async () => {
		const { json, status } = await makeRequest("/api/merchants", {
			method: "POST",
			body: { name: "Test Merchant" },
		});
		expect(status).toBe(401);
		expect((json as Record<string, unknown>).error).toBe("Unauthorized");
	});

	test("creates merchant and adds user as owner via user_merchants", async () => {
		mockValidateSession.mockResolvedValue({
			id: "session-1",
			userId: "user-1",
		});

		mockInsert.mockImplementation(() => ({
			values: vi.fn().mockImplementation((vals: unknown) => {
				return {
					returning: vi.fn().mockResolvedValue([vals]),
				};
			}),
		}));

		const { json, status } = await makeRequest("/api/merchants", {
			method: "POST",
			body: { name: "Test Merchant" },
			cookie: "narvik_session=valid-token",
		});

		expect(status).toBe(200);
		expect((json as Record<string, unknown>).name).toBe("Test Merchant");
		expect(mockInsert).toHaveBeenCalledTimes(3);
		const syncEventValues = (
			mockInsert.mock.results[2]?.value as { values: ReturnType<typeof vi.fn> }
		).values;
		expect(syncEventValues).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: "insert",
				rowId: (json as Record<string, unknown>).id,
				scopeId: (json as Record<string, unknown>).id,
				scopeType: "merchant",
				tableName: "merchants",
			}),
		);
	});
});

describe("GET /api/merchants", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns 401 when no session", async () => {
		const { json, status } = await makeRequest("/api/merchants");
		expect(status).toBe(401);
		expect((json as Record<string, unknown>).error).toBe("Unauthorized");
	});

	test("returns user's merchants", async () => {
		mockValidateSession.mockResolvedValue({
			id: "session-1",
			userId: "user-1",
		});

		mockSelect.mockImplementation(() => ({
			from: vi.fn().mockReturnValue({
				innerJoin: vi.fn().mockReturnValue({
					where: vi
						.fn()
						.mockResolvedValue([
							{ merchantId: "m-1", name: "Merchant 1", role: "owner" },
						]),
				}),
			}),
		}));

		const { json, status } = await makeRequest("/api/merchants", {
			cookie: "narvik_session=valid-token",
		});

		expect(status).toBe(200);
		const result = json as Record<string, unknown>[];
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Merchant 1");
	});
});
