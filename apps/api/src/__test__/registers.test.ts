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

const { registersRoutes } = await import("../routes/registers");

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
	const app = registersRoutes.compile();
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

describe("POST /api/outlets/:outletId/registers", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns 401 when no session", async () => {
		const { json, status } = await makeRequest(
			"/api/outlets/outlet-1/registers",
			{
				method: "POST",
				body: { name: "Register 1" },
			},
		);
		expect(status).toBe(401);
		expect((json as Record<string, unknown>).error).toBe("Unauthorized");
	});

	test("creates register with pairingCode and shortId", async () => {
		mockValidateSession.mockResolvedValue({
			id: "session-1",
			userId: "user-1",
		});

		mockSelect.mockImplementation(() => ({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ id: "um-1", role: "owner" }]),
				}),
			}),
		}));

		const insertedValues: unknown[] = [];
		mockInsert.mockImplementation(() => ({
			values: vi.fn().mockImplementation((vals: unknown) => {
				insertedValues.push(vals);
				const row = { id: "register-1", ...(vals as Record<string, unknown>) };
				return {
					returning: vi.fn().mockResolvedValue([row]),
				};
			}),
		}));

		const { status } = await makeRequest("/api/outlets/outlet-1/registers", {
			method: "POST",
			body: { name: "Register 1" },
			cookie: "narvik_session=valid-token",
		});

		expect(status).toBe(200);
		const inserted = insertedValues[0] as Record<string, unknown>;
		expect(inserted.shortId).toBeDefined();
		expect(inserted.pairingCode).toBeDefined();
		expect((inserted.pairingCode as string).length).toBe(8);
		expect(inserted.pairingCode as string).toMatch(/^[A-Z0-9]{8}$/);
		expect(inserted.pairingExpiresAt).toBeDefined();
		expect(insertedValues[1]).toEqual(
			expect.objectContaining({
				operation: "insert",
				rowId: "register-1",
				scopeId: "outlet-1",
				scopeType: "outlet",
				tableName: "registers",
			}),
		);
	});
});

describe("POST /api/registers/pair", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns 400 when pairingCode not found", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		const { json, status } = await makeRequest("/api/registers/pair", {
			method: "POST",
			body: { pairingCode: "AB12CD34" },
		});

		expect(status).toBe(400);
		expect((json as Record<string, unknown>).error).toBeDefined();
	});

	test("returns 400 when pairingCode is expired", async () => {
		const expiredTime = new Date(Date.now() - 3600000).toISOString();
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([
						{
							id: "reg-1",
							pairingCode: "AB12CD34",
							pairingExpiresAt: expiredTime,
							isActive: true,
						},
					]),
				}),
			}),
		});

		const { json, status } = await makeRequest("/api/registers/pair", {
			method: "POST",
			body: { pairingCode: "AB12CD34" },
		});

		expect(status).toBe(400);
		expect((json as Record<string, unknown>).error).toBe(
			"Pairing code expired",
		);
	});

	test("pairs successfully with valid code", async () => {
		const futureTime = new Date(Date.now() + 86400000).toISOString();
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([
						{
							id: "reg-1",
							outletId: "outlet-1",
							pairingCode: "AB12CD34",
							pairingExpiresAt: futureTime,
							isActive: true,
						},
					]),
				}),
			}),
		});

		mockUpdate.mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});
		const syncEventValues = vi.fn().mockResolvedValue(undefined);
		mockInsert.mockReturnValue({ values: syncEventValues });

		const { status } = await makeRequest("/api/registers/pair", {
			method: "POST",
			body: { pairingCode: "AB12CD34" },
		});

		expect(status).toBe(200);
		expect(mockUpdate).toHaveBeenCalled();
		expect(syncEventValues).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: "update",
				rowId: "reg-1",
				scopeId: "outlet-1",
				scopeType: "outlet",
				tableName: "registers",
			}),
		);
	});
});

describe("GET /api/outlets/:outletId/registers", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns 401 when no session", async () => {
		const { json, status } = await makeRequest(
			"/api/outlets/outlet-1/registers",
		);
		expect(status).toBe(401);
		expect((json as Record<string, unknown>).error).toBe("Unauthorized");
	});
});
