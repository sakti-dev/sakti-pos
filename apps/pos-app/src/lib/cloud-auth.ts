const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface ApiUser {
	id: string;
	email: string;
	name: string;
	role?: string;
}

interface Shop {
	id: string;
	name: string;
	ownerId: string;
	createdAt: string;
	updatedAt: string;
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
		body: JSON.stringify({ email, password, name }),
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

export async function getSession(): Promise<{ user: ApiUser | null }> {
	return apiFetch("/api/auth/session");
}

export async function logout(): Promise<void> {
	await apiFetch("/api/auth/logout", { method: "POST" });
}

export function getGoogleOAuthUrl(): string {
	return `${API_URL}/api/auth/google`;
}

export async function getShops(): Promise<Shop[]> {
	return apiFetch("/api/shops");
}

export async function createShop(name: string): Promise<Shop> {
	return apiFetch("/api/shops", {
		body: JSON.stringify({ name }),
		method: "POST",
	});
}

export type { ApiUser, Shop };
export { ApiError };
