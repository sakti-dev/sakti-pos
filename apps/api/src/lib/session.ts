import type { Session } from "narvik";
import { narvik } from "./auth";

export function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) return null;
	return authHeader.slice(7);
}

export async function getSessionFromRequest(
	request: Request,
): Promise<Session | null> {
	const bearerToken = getBearerToken(request);
	if (bearerToken) {
		return narvik.validateSession(bearerToken);
	}
	const token = getCookie(request, narvik.cookieName);
	if (!token) return null;
	return narvik.validateSession(token);
}

export function getCookie(request: Request, name: string): string | undefined {
	const cookieHeader = request.headers.get("cookie");
	const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
	return match?.[1] ?? undefined;
}

export function createSessionCookie(token: string): string {
	return narvik.createCookie(token).serialize();
}

export function createBlankCookie(): string {
	return narvik.createBlankCookie().serialize();
}

export function createCookieString(
	name: string,
	value: string,
	options: {
		maxAge?: number;
		httpOnly?: boolean;
		path?: string;
		sameSite?: string;
	},
): string {
	const parts = [`${name}=${value}`];
	if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	return parts.join("; ");
}

export function createDeleteCookieString(
	name: string,
	path: string = "/",
): string {
	return `${name}=; Path=${path}; Max-Age=0`;
}
