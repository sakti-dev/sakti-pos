const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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

class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${API_URL}${path}`, {
		...options,
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			...options?.headers,
		},
	});

	const body = (await res.json()) as Record<string, unknown>;

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
	return apiFetch("/api/auth/register", {
		body: JSON.stringify({ email, name, password }),
		method: "POST",
	});
}

export async function login(
	email: string,
	password: string,
): Promise<{ user: ApiUser }> {
	return apiFetch("/api/auth/login", {
		body: JSON.stringify({ email, password }),
		method: "POST",
	});
}

export async function getSession(): Promise<{
	merchants: Merchant[];
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

export async function getMerchants(): Promise<Merchant[]> {
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
): Promise<Outlet> {
	return apiFetch(`/api/merchants/${merchantId}/outlets`, {
		body: JSON.stringify({ address, name }),
		method: "POST",
	});
}

export async function pairRegister(pairingCode: string): Promise<PairResult> {
	return apiFetch("/api/registers/pair", {
		body: JSON.stringify({ pairingCode }),
		method: "POST",
	});
}

export type { ApiUser, Merchant, Outlet, PairResult, Register };
export { ApiError };
