import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "~/lib/utils";

const storageLogger = createLogger({
  domain: "AUTH",
  module: "auth",
  scope: "storage",
});

const LOCAL_KEY = "sakti-pos:session-token";

let cachedToken: string | null = null;

async function saveTokenNative(token: string): Promise<void> {
  await invoke("save_auth_token", { token });
}

async function getTokenNative(): Promise<string | null> {
  return await invoke<string | null>("get_auth_token");
}

async function clearTokenNative(): Promise<void> {
  await invoke("clear_auth_token");
}

async function migrateLegacyToken(token: string): Promise<void> {
  await saveTokenNative(token);
  localStorage.removeItem(LOCAL_KEY);
}

export const AuthStorage = {
  async saveToken(token: string): Promise<void> {
    cachedToken = token;
    localStorage.removeItem(LOCAL_KEY);
    try {
      await saveTokenNative(token);
    } catch (error: unknown) {
      storageLogger.error("native_token_persist:failed", error);
    }
  },

  async getToken(): Promise<string | null> {
    if (cachedToken !== null) {
      return cachedToken;
    }

    const legacyToken = localStorage.getItem(LOCAL_KEY);
    if (legacyToken !== null) {
      try {
        await migrateLegacyToken(legacyToken);
        cachedToken = legacyToken;
        return legacyToken;
      } catch (error: unknown) {
        storageLogger.error("legacy_token_migration:failed", error);
        localStorage.removeItem(LOCAL_KEY);
        return null;
      }
    }

    try {
      const token = await getTokenNative();
      cachedToken = token ?? null;
      return cachedToken;
    } catch (error: unknown) {
      storageLogger.error("native_token_load:failed", error);
      localStorage.removeItem(LOCAL_KEY);
      return null;
    }
  },

  async clearToken(): Promise<void> {
    cachedToken = null;
    localStorage.removeItem(LOCAL_KEY);
    try {
      await clearTokenNative();
    } catch (error: unknown) {
      storageLogger.error("native_token_clear:failed", error);
    }
  },
};
