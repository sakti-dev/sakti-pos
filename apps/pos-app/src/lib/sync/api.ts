import { AuthStorage } from "~/lib/auth/storage";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface SyncStatusResult {
	changedTables: string[];
	hasChanges: boolean;
	latestEventId: number;
	needsFullResync: boolean;
	oldestAvailableEventId: number | null;
}

export async function getSyncStatus(input: {
	lastServerEventId: number;
	outletId: string;
}): Promise<SyncStatusResult> {
	const token = await AuthStorage.getToken();
	const params = new URLSearchParams({
		lastServerEventId: String(input.lastServerEventId),
		outletId: input.outletId,
	});
	const response = await fetch(`${API_URL}/api/sync/status?${params}`, {
		headers: token ? { Authorization: `Bearer ${token}` } : undefined,
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(body?.error ?? `Sync status failed (${response.status})`);
	}

	return response.json() as Promise<SyncStatusResult>;
}
