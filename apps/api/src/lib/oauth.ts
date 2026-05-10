import { env } from "cloudflare:workers";
import { Google, generateCodeVerifier, generateState } from "arctic";

export const google = new Google(
  env.GOOGLE_CLIENT_ID ?? "",
  env.GOOGLE_CLIENT_SECRET ?? "",
  `${env.API_URL ?? "http://localhost:3001"}/api/auth/google/callback`
);

export { generateCodeVerifier, generateState };
