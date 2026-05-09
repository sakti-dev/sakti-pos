import { cleanupSyncHistory } from "../lib/sync-cleanup";

const DEFAULT_RETENTION_DAYS = 30;

const retentionDays = Number(
	process.env.SYNC_EVENT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS,
);

const result = await cleanupSyncHistory({
	now: new Date(),
	retentionDays,
});

console.log(
	JSON.stringify({
		...result,
		retentionDays,
	}),
);
