import { userMerchants, users } from "@repo/database/api-schema";
import type { OAuth2Tokens } from "arctic";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { narvik } from "../lib/auth";
import { generateCodeVerifier, generateState, google } from "../lib/oauth";
import {
	createBlankCookie,
	createCookieString,
	createDeleteCookieString,
	createSessionCookie,
	getCookie,
	getSessionFromRequest,
} from "../lib/session";

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH_LENGTH = 256;
const PBKDF2_ALGORITHM = "SHA-256";
const DUMMY_SALT = "0000000000000000";
const DUMMY_HASH =
	"0000000000000000000000000000000000000000000000000000000000000000000";

const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_CODE_VERIFIER_COOKIE = "google_code_verifier";

async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const keyMaterial = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: PBKDF2_ALGORITHM,
		},
		key,
		PBKDF2_HASH_LENGTH,
	);
	const hashArray = Array.from(new Uint8Array(keyMaterial));
	const saltHex = Array.from(salt)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${saltHex}:${hashHex}`;
}

async function verifyPassword(
	hash: string,
	password: string,
): Promise<boolean> {
	const [saltHex, hashHex] = hash.split(":");
	const saltBytes = saltHex.match(/.{1,2}/g);
	if (!saltBytes) return false;
	const salt = new Uint8Array(
		saltBytes.map((byte) => Number.parseInt(byte, 16)),
	);
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const keyMaterial = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: PBKDF2_ALGORITHM,
		},
		key,
		PBKDF2_HASH_LENGTH,
	);
	const computed = Array.from(new Uint8Array(keyMaterial))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return computed === hashHex;
}

function setCookies(
	set: { headers: Record<string, unknown> },
	cookies: string[],
) {
	set.headers["Set-Cookie"] = cookies;
}

export const authRoutes = new Elysia({ prefix: "/api/auth" })
	.post(
		"/register",
		async ({ body, set }) => {
			const existing = await db
				.select()
				.from(users)
				.where(eq(users.email, body.email))
				.limit(1);
			if (existing.length > 0) {
				set.status = 409;
				return { error: "Email already registered" };
			}

			const passwordHash = await hashPassword(body.password);

			const now = new Date().toISOString();
			const [user] = await db
				.insert(users)
				.values({
					email: body.email,
					name: body.name,
					passwordHash,
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			const { token } = await narvik.createSession(user.id);
			setCookies(set, [createSessionCookie(token)]);

			return { user: { id: user.id, email: user.email, name: user.name } };
		},
		{
			body: t.Object({
				email: t.String({ format: "email" }),
				password: t.String({ minLength: 8 }),
				name: t.String({ minLength: 1, maxLength: 100 }),
			}),
		},
	)
	.post(
		"/login",
		async ({ body, set }) => {
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.email, body.email))
				.limit(1);

			if (!user?.passwordHash) {
				await verifyPassword(`${DUMMY_SALT}:${DUMMY_HASH}`, body.password);
				set.status = 401;
				return { error: "Invalid email or password" };
			}

			const valid = await verifyPassword(user.passwordHash, body.password);
			if (!valid) {
				set.status = 401;
				return { error: "Invalid email or password" };
			}

			const { token } = await narvik.createSession(user.id);
			setCookies(set, [createSessionCookie(token)]);

			return { user: { id: user.id, email: user.email, name: user.name } };
		},
		{
			body: t.Object({
				email: t.String({ format: "email" }),
				password: t.String(),
			}),
		},
	)
	.post("/logout", async ({ request, set }) => {
		const session = await getSessionFromRequest(request);
		if (session) {
			await narvik.invalidateSession(session.id);
		}
		setCookies(set, [createBlankCookie()]);
		return { success: true };
	})
	.get("/session", async ({ request }) => {
		const session = await getSessionFromRequest(request);
		if (!session) {
			return { user: null, merchants: [] };
		}

		const [user] = await db
			.select({
				id: users.id,
				email: users.email,
				name: users.name,
			})
			.from(users)
			.where(eq(users.id, session.userId))
			.limit(1);

		const merchants = await db
			.select({
				id: userMerchants.merchantId,
				role: userMerchants.role,
			})
			.from(userMerchants)
			.where(eq(userMerchants.userId, session.userId));

		return { user: user ?? null, merchants };
	})
	.get("/google", async ({ set }) => {
		const state = generateState();
		const codeVerifier = generateCodeVerifier();
		const scopes = ["openid", "profile", "email"];
		const url = google.createAuthorizationURL(state, codeVerifier, scopes);

		setCookies(set, [
			createCookieString(GOOGLE_STATE_COOKIE, state, {
				maxAge: 600,
				httpOnly: true,
				path: "/",
				sameSite: "Lax",
			}),
			createCookieString(GOOGLE_CODE_VERIFIER_COOKIE, codeVerifier, {
				maxAge: 600,
				httpOnly: true,
				path: "/",
				sameSite: "Lax",
			}),
		]);

		set.redirect = url.toString();
		return "";
	})
	.get(
		"/google/callback",
		async ({ query, request, set }) => {
			const stateCookie = getCookie(request, GOOGLE_STATE_COOKIE);
			const codeVerifierCookie = getCookie(
				request,
				GOOGLE_CODE_VERIFIER_COOKIE,
			);

			if (
				!query.code ||
				!query.state ||
				!stateCookie ||
				!codeVerifierCookie ||
				query.state !== stateCookie
			) {
				set.status = 400;
				return { error: "Invalid OAuth state" };
			}

			let tokens: OAuth2Tokens;
			try {
				tokens = await google.validateAuthorizationCode(
					query.code,
					codeVerifierCookie,
				);
			} catch {
				set.status = 400;
				return { error: "Failed to validate authorization code" };
			}

			const idToken = tokens.idToken();
			if (!idToken) {
				set.status = 400;
				return { error: "No ID token returned" };
			}

			const payload = idToken.split(".")[1];
			const claims = JSON.parse(atob(payload));
			const googleEmail = claims.email as string;
			const googleName = (claims.name as string) ?? googleEmail.split("@")[0];

			const existing = await db
				.select()
				.from(users)
				.where(eq(users.email, googleEmail))
				.limit(1);

			let userId: string;
			if (existing.length > 0) {
				userId = existing[0].id;
			} else {
				const now = new Date().toISOString();
				const [newUser] = await db
					.insert(users)
					.values({
						email: googleEmail,
						name: googleName,
						createdAt: now,
						updatedAt: now,
					})
					.returning();
				userId = newUser.id;
			}

			const { token } = await narvik.createSession(userId);
			setCookies(set, [
				createSessionCookie(token),
				createDeleteCookieString(GOOGLE_STATE_COOKIE),
				createDeleteCookieString(GOOGLE_CODE_VERIFIER_COOKIE),
			]);

			return new Response(
				`<!DOCTYPE html><html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;margin:0"><div style="text-align:center"><h2>Login berhasil</h2><p>Anda bisa menutup halaman ini dan kembali ke aplikasi.</p></div></body></html>`,
				{
					headers: { "Content-Type": "text/html; charset=utf-8" },
				},
			);
		},
		{
			query: t.Object({
				code: t.String(),
				state: t.String(),
			}),
		},
	);
