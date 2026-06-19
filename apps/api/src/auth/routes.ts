import {
  merchants,
  tempOAuthCodes,
  userMerchants,
  users,
} from "@sync-contract/api-schema";
import type { OAuth2Tokens } from "arctic";
import { eq, lt } from "drizzle-orm";
import { Elysia } from "elysia";
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
import {
  BadRequestError,
  requireEmail,
  requireNonEmptyString,
} from "../lib/validation";
import {
  AuthLoginRequest,
  AuthRegisterRequest,
  GoogleExchangeRequest,
} from "./auth.model";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_LENGTH = 256;
const PBKDF2_ALGORITHM = "SHA-256";
const DUMMY_SALT = "0000000000000000";
const DUMMY_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000000";

const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_CODE_VERIFIER_COOKIE = "google_oauth_code_verifier";
const OAUTH_CODE_TTL_SECONDS = 60;
const DEEP_LINK_SCHEME = "sakti-pos-dev";

function generateOpaqueCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const keyMaterial = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_ALGORITHM,
    },
    key,
    PBKDF2_HASH_LENGTH
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
  password: string
): Promise<boolean> {
  const [saltHex, hashHex] = hash.split(":");
  const saltBytes = saltHex.match(/.{1,2}/g);
  if (!saltBytes) {
    return false;
  }
  const salt = new Uint8Array(
    saltBytes.map((byte) => Number.parseInt(byte, 16))
  );
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const keyMaterial = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_ALGORITHM,
    },
    key,
    PBKDF2_HASH_LENGTH
  );
  const computed = Array.from(new Uint8Array(keyMaterial))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === hashHex;
}

function setCookies(
  set: { headers: Record<string, unknown> },
  cookies: string[]
) {
  set.headers["Set-Cookie"] = cookies;
}

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .post(
    "/register",
    async ({ body, set }) => {
      let email: string;
      let password: string;
      let name: string;
      try {
        email = requireEmail(body.email);
        password = requireNonEmptyString(body.password, "password", {
          minLength: 8,
        });
        name = requireNonEmptyString(body.name, "name", {
          minLength: 1,
          maxLength: 100,
        });
      } catch (error) {
        if (error instanceof BadRequestError) {
          set.status = error.status;
          return { error: error.message };
        }
        throw error;
      }

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existing.length > 0) {
        set.status = 409;
        return { error: "Email already registered" };
      }

      const passwordHash = await hashPassword(password);

      const now = new Date().toISOString();
      const [user] = await db
        .insert(users)
        .values({
          email,
          name,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const { token } = await narvik.createSession(user.id);
      setCookies(set, [createSessionCookie(token)]);

      return {
        sessionToken: token,
        user: { id: user.id, email: user.email, name: user.name },
      };
    },
    {
      body: AuthRegisterRequest,
    }
  )
  .post(
    "/login",
    async ({ body, set }) => {
      let email: string;
      let password: string;
      try {
        email = requireEmail(body.email);
        password = requireNonEmptyString(body.password, "password");
      } catch (error) {
        if (error instanceof BadRequestError) {
          set.status = error.status;
          return { error: error.message };
        }
        throw error;
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user?.passwordHash) {
        await verifyPassword(`${DUMMY_SALT}:${DUMMY_HASH}`, password);
        set.status = 401;
        return { error: "Invalid email or password" };
      }

      const valid = await verifyPassword(user.passwordHash, password);
      if (!valid) {
        set.status = 401;
        return { error: "Invalid email or password" };
      }

      const { token } = await narvik.createSession(user.id);
      setCookies(set, [createSessionCookie(token)]);

      return {
        sessionToken: token,
        user: { id: user.id, email: user.email, name: user.name },
      };
    },
    {
      body: AuthLoginRequest,
    }
  )
  .post(
    "/logout",
    async ({ request, set }) => {
      const session = await getSessionFromRequest(request);
      if (session) {
        await narvik.invalidateSession(session.id);
      }
      setCookies(set, [createBlankCookie()]);
      return { success: true };
    },
    {}
  )
  .post(
    "/session",
    async ({ request }) => {
      const session = await getSessionFromRequest(request);
      if (!session) {
        return { hasUser: false, merchants: [], user: undefined };
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

      const merchantRows = await db
        .select({
          merchantId: userMerchants.merchantId,
          name: merchants.name,
          role: userMerchants.role,
        })
        .from(userMerchants)
        .innerJoin(merchants, eq(merchants.id, userMerchants.merchantId))
        .where(eq(userMerchants.userId, session.userId));

      return {
        hasUser: user != null,
        merchants: merchantRows.map((row) => ({
          merchantId: row.merchantId,
          name: row.name,
          role: row.role,
        })),
        user: user
          ? { id: user.id, email: user.email, name: user.name }
          : undefined,
      };
    },
    {}
  )
  .get("/google", ({ set }) => {
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
  .get("/google/callback", async ({ request, set }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const stateCookie = getCookie(request, GOOGLE_STATE_COOKIE);
    const codeVerifierCookie = getCookie(request, GOOGLE_CODE_VERIFIER_COOKIE);

    if (
      !(code && state && stateCookie && codeVerifierCookie) ||
      state !== stateCookie
    ) {
      set.status = 400;
      return { error: "Invalid OAuth state" };
    }

    let tokens: OAuth2Tokens;
    try {
      tokens = await google.validateAuthorizationCode(code, codeVerifierCookie);
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
      createDeleteCookieString(GOOGLE_STATE_COOKIE),
      createDeleteCookieString(GOOGLE_CODE_VERIFIER_COOKIE),
    ]);

    const opaqueCode = generateOpaqueCode();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(tempOAuthCodes).values({
      id: opaqueCode,
      userId,
      payload: JSON.stringify({
        sessionToken: token,
        user: { id: userId, email: googleEmail, name: googleName },
      }),
      createdAt: now,
      expiresAt: now + OAUTH_CODE_TTL_SECONDS,
    });

    const deepLinkUrl = `${DEEP_LINK_SCHEME}://auth?code=${opaqueCode}`;
    set.headers["content-type"] = "text/html; charset=utf-8";

    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Menghubungkan ke Sakti POS</title></head><body style="margin:0;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;"><div style="background-color:#ffffff;padding:32px;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);max-width:360px;width:100%;border:1px solid #f3f4f6;"><h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#111827;">Login Berhasil!</h2><p style="margin:0 0 24px 0;font-size:14px;color:#6b7280;line-height:1.5;">Mengalihkan kembali ke aplikasi kasir...</p><a href="${deepLinkUrl}" style="display:inline-block;box-sizing:border-box;width:100%;padding:14px;background-color:#2563eb;color:#ffffff;font-weight:500;border-radius:12px;text-decoration:none;">Hubungkan ke Aplikasi Kasir</a></div><script>window.location.href="${deepLinkUrl}";setTimeout(function(){window.close()},5000)</script></body></html>`;
  })
  .post(
    "/google/exchange",
    async ({ body, set }) => {
      const code = body.code;
      if (!code || typeof code !== "string") {
        set.status = 400;
        return { error: "Missing code" };
      }

      const now = Math.floor(Date.now() / 1000);
      await db
        .delete(tempOAuthCodes)
        .where(lt(tempOAuthCodes.expiresAt, now))
        .execute();

      const [row] = await db
        .select()
        .from(tempOAuthCodes)
        .where(eq(tempOAuthCodes.id, code))
        .limit(1);

      if (!row || row.expiresAt < now) {
        set.status = 401;
        return { error: "Invalid or expired authorization code" };
      }

      await db
        .delete(tempOAuthCodes)
        .where(eq(tempOAuthCodes.id, code))
        .execute();

      const payload = JSON.parse(row.payload);
      return {
        sessionToken: payload.sessionToken,
        user: payload.user,
      };
    },
    {
      body: GoogleExchangeRequest,
    }
  );
