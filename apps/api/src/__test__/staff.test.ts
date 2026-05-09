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

const { staffRoutes } = await import("../routes/staff");

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
	const app = staffRoutes.compile();
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

function mockSelectQueue(rowsByCall: unknown[][]) {
	let callIndex = 0;
	mockSelect.mockImplementation(() => ({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockImplementation(async () => {
					const rows = rowsByCall[callIndex] ?? [];
					callIndex += 1;
					return rows;
				}),
			}),
		}),
	}));
}

describe("POST /api/merchants/:merchantId/staff/me", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns mapped current staff when cloudUserId matches session user", async () => {
		mockValidateSession.mockResolvedValue({
			id: "session-1",
			userId: "user-1",
		});
		mockSelectQueue([
			[{ id: "um-1", role: "owner" }],
			[
				{
					id: "staff-1",
					merchantId: "merchant-1",
					outletId: "outlet-1",
					name: "Owner",
					role: "owner",
					isActive: true,
					pin: "pin-hash",
				},
			],
		]);

		const { json, status } = await makeRequest(
			"/api/merchants/merchant-1/staff/me",
			{
				method: "POST",
				cookie: "narvik_session=valid-token",
			},
		);

		expect(status).toBe(200);
		expect(json).toEqual({
			claimed: false,
			staff: {
				hasPin: true,
				id: "staff-1",
				isActive: true,
				merchantId: "merchant-1",
				name: "Owner",
				outletId: "outlet-1",
				role: "owner",
			},
		});
	});

	test("claims a single unclaimed owner staff for owner membership", async () => {
		mockValidateSession.mockResolvedValue({
			id: "session-1",
			userId: "user-1",
		});
		mockSelectQueue([
			[{ id: "um-1", role: "owner" }],
			[],
			[
				{
					id: "staff-1",
					merchantId: "merchant-1",
					outletId: "outlet-1",
					name: "Owner",
					role: "owner",
					isActive: true,
					pin: "pin-hash",
				},
			],
		]);

		const updateValues = vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		});
		mockUpdate.mockReturnValue({
			set: updateValues,
		});
		const syncEventValues = vi.fn().mockResolvedValue(undefined);
		mockInsert.mockReturnValue({ values: syncEventValues });

		const { json, status } = await makeRequest(
			"/api/merchants/merchant-1/staff/me",
			{
				method: "POST",
				cookie: "narvik_session=valid-token",
			},
		);

		expect(status).toBe(200);
		expect(updateValues).toHaveBeenCalledWith(
			expect.objectContaining({ cloudUserId: "user-1" }),
		);
		expect((json as Record<string, unknown>).claimed).toBe(true);
		expect(
			((json as Record<string, unknown>).staff as Record<string, unknown>).id,
		).toBe("staff-1");
		expect(syncEventValues).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: "update",
				rowId: "staff-1",
				scopeId: "merchant-1",
				scopeType: "merchant",
				tableName: "staff",
			}),
		);
	});

	test("does not claim ambiguous owner staff rows", async () => {
		mockValidateSession.mockResolvedValue({
			id: "session-1",
			userId: "user-1",
		});
		mockSelectQueue([
			[{ id: "um-1", role: "owner" }],
			[],
			[
				{ id: "staff-1", role: "owner" },
				{ id: "staff-2", role: "owner" },
			],
		]);

		const { json, status } = await makeRequest(
			"/api/merchants/merchant-1/staff/me",
			{
				method: "POST",
				cookie: "narvik_session=valid-token",
			},
		);

		expect(status).toBe(200);
		expect(json).toEqual({
			claimed: false,
			reason: "ambiguous-owner",
			staff: null,
		});
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	test("returns no-staff when merchant has no staff", async () => {
		mockValidateSession.mockResolvedValue({
			id: "session-1",
			userId: "user-1",
		});
		mockSelectQueue([[{ id: "um-1", role: "owner" }], [], []]);

		const { json, status } = await makeRequest(
			"/api/merchants/merchant-1/staff/me",
			{
				method: "POST",
				cookie: "narvik_session=valid-token",
			},
		);

		expect(status).toBe(200);
		expect(json).toEqual({
			claimed: false,
			reason: "no-staff",
			staff: null,
		});
	});
});
