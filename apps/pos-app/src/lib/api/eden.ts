import { treaty } from "@elysia/eden";
import type { App } from "@repo/api";
import { AuthStorage } from "~/lib/auth/storage";

export const API_URL =
  import.meta.env.VITE_API_URL ?? "http://192.168.1.2:3001";

const authFetcher = (async (url: URL | RequestInfo, options?: RequestInit) => {
  const token = await AuthStorage.getToken();
  const headers = new Headers(options?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return globalThis.fetch(url, { ...options, headers });
}) as typeof fetch;

export const eden = treaty<App>(API_URL, {
  fetcher: authFetcher,
});
