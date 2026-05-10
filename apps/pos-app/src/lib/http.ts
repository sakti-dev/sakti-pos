import ky, { HTTPError } from "ky";
import { AuthStorage } from "~/lib/auth/storage";
import { describeError } from "~/lib/utils";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = ky.create({
  baseUrl: API_URL,
  retry: 2,
  hooks: {
    beforeRequest: [
      async ({ request }) => {
        const token = await AuthStorage.getToken();
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`);
        }
      },
    ],
  },
});

export async function getApiErrorMessage(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    const body = (await error.response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return body?.error ?? `Request failed (${error.response.status})`;
  }

  return describeError(error);
}
