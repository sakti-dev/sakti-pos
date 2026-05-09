import { AuthStorage } from "./auth-storage";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	if (typeof error === "string") {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function debugLog(event: string, data: Record<string, unknown>) {
	console.info(`[CLOUD-AUTH] ${event} ${JSON.stringify(data)}`);
}

interface ApiUser {
	email: string;
	id: string;
	name: string;
}

interface Merchant {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
}

interface SessionMerchant {
	merchantId: string;
	name: string;
	role: string;
}

interface Outlet {
	address: string | null;
	id: string;
	isActive: boolean;
	merchantId: string;
	name: string;
}

interface Register {
	id: string;
	isActive: boolean;
	name: string;
	outletId: string;
	pairingCode: string | null;
	shortId: string;
}

interface PairResult {
	outlet: Outlet;
	register: Register;
}

interface CurrentCloudStaff {
	claimed: boolean;
	reason?: "no-staff" | "ambiguous-owner" | "not-allowed";
	staff: {
		hasPin: boolean;
		id: string;
		isActive: boolean;
		merchantId: string;
		name: string;
		outletId: string | null;
		role: "cashier" | "manager" | "owner";
	} | null;
}

class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
	const token = await AuthStorage.getToken();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	const method = options?.method ?? "GET";
	debugLog("request", { hasToken: !!token, method, path });
	let res: Response;
	try {
		res = await fetch(`${API_URL}${path}`, {
			...options,
			headers: {
				...headers,
				...(options?.headers as Record<string, string>),
			},
		});
	} catch (error) {
		debugLog("network-error", {
			error: describeError(error),
			method,
			path,
		});
		throw error;
	}

	const text = await res.text();
	let body: Record<string, unknown>;
	try {
		body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
	} catch {
		body = { error: text || `Non-JSON response (${res.status})` };
	}
	debugLog("response", {
		body: res.ok ? undefined : body,
		method,
		ok: res.ok,
		path,
		status: res.status,
	});

	if (!res.ok) {
		const message = (body.error as string) ?? `Request failed (${res.status})`;
		throw new ApiError(message, res.status);
	}

	return body as T;
}

export async function register(
	email: string,
	password: string,
	name: string,
): Promise<{ user: ApiUser }> {
	const result = await apiFetch<{ sessionToken: string; user: ApiUser }>(
		"/api/auth/register",
		{
			body: JSON.stringify({ email, name, password }),
			method: "POST",
		},
	);
	await AuthStorage.saveToken(result.sessionToken);
	return { user: result.user };
}

export async function login(
	email: string,
	password: string,
): Promise<{ user: ApiUser }> {
	const result = await apiFetch<{ sessionToken: string; user: ApiUser }>(
		"/api/auth/login",
		{
			body: JSON.stringify({ email, password }),
			method: "POST",
		},
	);
	await AuthStorage.saveToken(result.sessionToken);
	return { user: result.user };
}

export async function getSession(): Promise<{
	merchants: SessionMerchant[];
	user: ApiUser | null;
}> {
	return apiFetch("/api/auth/session");
}

export async function logout(): Promise<void> {
	await apiFetch("/api/auth/logout", { method: "POST" });
}

export function getGoogleOAuthUrl(): string {
	return `${API_URL}/api/auth/google`;
}

export async function getMerchants(): Promise<SessionMerchant[]> {
	return apiFetch("/api/merchants");
}

export async function createMerchant(name: string): Promise<Merchant> {
	return apiFetch("/api/merchants", {
		body: JSON.stringify({ name }),
		method: "POST",
	});
}

export async function getOutlets(merchantId: string): Promise<Outlet[]> {
	return apiFetch(`/api/merchants/${merchantId}/outlets`);
}

export async function createOutlet(
	merchantId: string,
	name: string,
	address?: string,
): Promise<Outlet & { register?: Register }> {
	return apiFetch(`/api/merchants/${merchantId}/outlets`, {
		body: JSON.stringify({ address, name }),
		method: "POST",
	});
}

export async function createStaff(params: {
	merchantId: string;
	outletId?: string;
	name: string;
	pin: string;
	role?: "cashier" | "manager" | "owner";
}): Promise<Record<string, unknown>> {
	const body: Record<string, unknown> = {
		name: params.name,
		pin: params.pin,
		role: params.role ?? "cashier",
	};
	if (params.outletId) {
		body.outletId = params.outletId;
	}
	return apiFetch(`/api/merchants/${params.merchantId}/staff`, {
		body: JSON.stringify(body),
		method: "POST",
	});
}

export async function getCurrentCloudStaff(
	merchantId: string,
): Promise<CurrentCloudStaff> {
	return apiFetch(`/api/merchants/${merchantId}/staff/me`, {
		method: "POST",
	});
}

export async function pairRegister(pairingCode: string): Promise<PairResult> {
	return apiFetch("/api/registers/pair", {
		body: JSON.stringify({ pairingCode }),
		method: "POST",
	});
}

export async function isCloudAuthenticated(): Promise<boolean> {
	const token = await AuthStorage.getToken();
	return token !== null;
}

export type {
	ApiUser,
	CurrentCloudStaff,
	Merchant,
	Outlet,
	PairResult,
	Register,
	SessionMerchant,
};
export { ApiError };
