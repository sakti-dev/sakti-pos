import { env } from "cloudflare:workers";
import * as arctic from "arctic";

export const google = new arctic.Google(
	env.GOOGLE_CLIENT_ID ?? "",
	env.GOOGLE_CLIENT_SECRET ?? "",
	`${env.API_URL ?? "http://localhost:3001"}/api/auth/google/callback`,
);

export const { generateState, generateCodeVerifier } = arctic;
