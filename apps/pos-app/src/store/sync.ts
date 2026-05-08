import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import { AuthStorage } from "~/lib/auth-storage";
import { currentOutletId } from "./outlet";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
const [lastSyncTime, setLastSyncTime] = createSignal<string | null>(null);

export { lastSyncTime, syncStatus };

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler() {
	if (syncInterval) return;

	syncNow();
	syncInterval = setInterval(() => syncNow(), 5 * 60 * 1000);
}

export function stopSyncScheduler() {
	if (syncInterval) {
		clearInterval(syncInterval);
		syncInterval = null;
	}
}

export interface SyncNowResult {
	pull: { rows_received: number; server_time: string };
	push: {
		server_time: string;
		server_wins_count: number;
		tables_synced: string[];
	};
	purged: number;
}

export async function syncNow(): Promise<SyncNowResult> {
	const outletId = currentOutletId();
	if (!outletId) {
		return {
			pull: { rows_received: 0, server_time: "" },
			push: { server_time: "", server_wins_count: 0, tables_synced: [] },
			purged: 0,
		};
	}

	const sessionToken = await AuthStorage.getToken();
	if (!sessionToken) {
		throw new Error("Sesi tidak ditemukan. Silakan login ulang.");
	}

	setSyncStatus("syncing");
	try {
		const result = await invoke<SyncNowResult>("sync_now", {
			apiUrl: API_URL,
			outletId,
			sessionToken,
		});

		setLastSyncTime(result.pull.server_time);
		setSyncStatus("idle");
		return result;
	} catch {
		setSyncStatus("offline");
		throw new Error("Gagal menyinkronkan");
	}
}

export async function runStartupSync(): Promise<void> {
	const outletId = currentOutletId();
	if (!outletId) return;

	const sessionToken = await AuthStorage.getToken();
	if (!sessionToken) return;

	setSyncStatus("syncing");
	try {
		await invoke<SyncNowResult>("sync_now", {
			apiUrl: API_URL,
			outletId,
			sessionToken,
		});
		setSyncStatus("idle");
	} catch {
		setSyncStatus("offline");
	}
}
