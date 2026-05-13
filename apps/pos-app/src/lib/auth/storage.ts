import { appDataDir, join } from "@tauri-apps/api/path";
import { Stronghold } from "@tauri-apps/plugin-stronghold";
import { createLogger } from "~/lib/logger";

const storageLogger = createLogger({
  domain: "AUTH",
  module: "auth",
  scope: "storage",
});

const VAULT_NAME = "sakti-pos-vault.hold";
const CLIENT_NAME = "auth_client";
const STORE_KEY = "session_token";
const MASTER_PASSWORD = "sakti-pos-device-key-2026";
const LOCAL_KEY = "sakti-pos:session-token";

let cachedToken: string | null = null;

async function getVaultPath(): Promise<string> {
  return await join(await appDataDir(), VAULT_NAME);
}

async function getStrongholdClient() {
  const vaultPath = await getVaultPath();
  const stronghold = await Stronghold.load(vaultPath, MASTER_PASSWORD);
  const client = await stronghold
    .loadClient(CLIENT_NAME)
    .catch(() => stronghold.createClient(CLIENT_NAME));
  return { stronghold, client };
}

async function persistToStronghold(token: string): Promise<void> {
  try {
    const { stronghold, client } = await getStrongholdClient();
    const store = client.getStore();
    const encoder = new TextEncoder();
    await store.insert(STORE_KEY, Array.from(encoder.encode(token)));
    await stronghold.save();
  } catch (err) {
    storageLogger.error("stronghold_persist:failed", err);
  }
}

export const AuthStorage = {
  saveToken(token: string): void {
    cachedToken = token;
    localStorage.setItem(LOCAL_KEY, token);
    persistToStronghold(token);
  },

  async getToken(): Promise<string | null> {
    if (cachedToken) {
      return cachedToken;
    }
    const fromLocal = localStorage.getItem(LOCAL_KEY);
    if (fromLocal) {
      cachedToken = fromLocal;
      return fromLocal;
    }
    try {
      const { client } = await getStrongholdClient();
      const store = client.getStore();
      const bytes = await store.get(STORE_KEY);
      if (!bytes) {
        return null;
      }
      const decoder = new TextDecoder();
      const token = decoder.decode(new Uint8Array(bytes));
      cachedToken = token;
      localStorage.setItem(LOCAL_KEY, token);
      return token;
    } catch {
      return null;
    }
  },

  async clearToken(): Promise<void> {
    cachedToken = null;
    localStorage.removeItem(LOCAL_KEY);
    try {
      const { stronghold, client } = await getStrongholdClient();
      const store = client.getStore();
      await store.remove(STORE_KEY);
      await stronghold.save();
    } catch {}
  },
};
