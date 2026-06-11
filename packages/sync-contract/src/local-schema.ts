import { createSyncCursorsTable, createSyncOutboxTable } from "baresync/schema";

export const syncOutbox = createSyncOutboxTable();

export const syncCursors = createSyncCursorsTable();
