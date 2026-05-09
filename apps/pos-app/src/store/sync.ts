import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import { AuthStorage } from "~/lib/auth-storage";
import { getSyncStatus } from "~/lib/sync-api";
import { currentOutletId } from "./outlet";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";
export type SyncMode = "skipped" | "push_only" | "pull_only" | "full";

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
const [lastSyncTime, setLastSyncTime] = createSignal<string | null>(null);

export { lastSyncTime, syncStatus };

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

let syncInterval: ReturnType<typeof setInterval> | null = null;

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	if (typeof error === "string") {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function debugLog(event: string, data: Record<string, unknown>) {
	console.info(`[SYNC-DEBUG] ${event} ${JSON.stringify(data)}`);
}

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
	mode: SyncMode;
	pull: { rows_received: number; server_time: string };
	push: {
		server_time: string;
		server_wins_count: number;
		tables_synced: string[];
	};
	purged: number;
}

interface LocalSyncState {
	last_server_event_id: number;
	local_dirty_count: number;
}

function emptySyncResult(mode: SyncMode): SyncNowResult {
	return {
		mode,
		pull: { rows_received: 0, server_time: "" },
		purged: 0,
		push: { server_time: "", server_wins_count: 0, tables_synced: [] },
	};
}

function withMode(
	result: Omit<SyncNowResult, "mode"> | SyncNowResult,
	mode: SyncMode,
) {
	return { ...result, mode };
}

async function invokeSyncTransfer(
	command: "sync_now" | "sync_pull_events" | "sync_push_outbox",
	params: Record<string, unknown>,
	mode: SyncMode,
): Promise<SyncNowResult> {
	const result = await invoke<Omit<SyncNowResult, "mode"> | SyncNowResult>(
		command,
		params,
	);
	return withMode(result, mode);
}

export async function syncNow(): Promise<SyncNowResult> {
	const outletId = currentOutletId();
	if (!outletId) {
		return emptySyncResult("skipped");
	}

	const sessionToken = await AuthStorage.getToken();
	if (!sessionToken) {
		throw new Error("Sesi tidak ditemukan. Silakan login ulang.");
	}

	setSyncStatus("syncing");
	try {
		const localState = await invoke<LocalSyncState>("get_sync_local_state", {
			outletId,
		});
		const serverStatus = await getSyncStatus({
			lastServerEventId: localState.last_server_event_id,
			outletId,
		});
		const hasLocalChanges = localState.local_dirty_count > 0;
		const hasServerChanges = serverStatus.hasChanges;
		const baseParams = {
			apiUrl: API_URL,
			outletId,
			sessionToken,
		};

		debugLog("syncNow decision", {
			hasLocalChanges,
			hasServerChanges,
			latestEventId: serverStatus.latestEventId,
			localDirtyCount: localState.local_dirty_count,
			needsFullResync: serverStatus.needsFullResync,
			outletId,
		});

		let result: SyncNowResult;
		if (
			!hasLocalChanges &&
			!hasServerChanges &&
			!serverStatus.needsFullResync
		) {
			result = emptySyncResult("skipped");
		} else if (
			serverStatus.needsFullResync ||
			(hasLocalChanges && hasServerChanges)
		) {
			result = await invokeSyncTransfer("sync_now", baseParams, "full");
		} else if (hasLocalChanges) {
			result = await invokeSyncTransfer(
				"sync_push_outbox",
				baseParams,
				"push_only",
			);
		} else {
			result = await invokeSyncTransfer(
				"sync_pull_events",
				{ ...baseParams, latestEventId: serverStatus.latestEventId },
				"pull_only",
			);
		}

		debugLog("syncNow result", {
			mode: result.mode,
			pullRows: result.pull.rows_received,
			pullServerTime: result.pull.server_time,
			purged: result.purged,
			pushServerTime: result.push.server_time,
			serverWins: result.push.server_wins_count,
			tablesSynced: result.push.tables_synced,
		});
		setLastSyncTime(result.pull.server_time);
		setSyncStatus("idle");
		return result;
	} catch (err) {
		const message = describeError(err);
		console.error(
			`[SYNC-DEBUG] syncNow failed ${JSON.stringify({
				apiUrl: API_URL,
				error: message,
				outletId,
			})}`,
		);
		setSyncStatus("offline");
		throw new Error(`Gagal menyinkronkan: ${message}`);
	}
}

export async function runStartupSync(): Promise<void> {
	const outletId = currentOutletId();
	if (!outletId) return;

	const sessionToken = await AuthStorage.getToken();
	if (!sessionToken) return;

	setSyncStatus("syncing");
	try {
		await syncNow();
		setSyncStatus("idle");
	} catch {
		setSyncStatus("offline");
	}
}
