export const SQLITE_BIND_PARAM_LIMIT = 32_766;
export const SAFE_SQLITE_BIND_PARAM_LIMIT = 30_000;
export const DEFAULT_MAX_ROWS_PER_WRITE_CHUNK = 500;
export const DEFAULT_MAX_IDS_PER_READ_CHUNK = 1000;
export const DEFAULT_MAX_EVENTS_PER_INSERT_CHUNK = 1000;

export function getWriteChunkSize(input: {
  columnCount: number;
  maxBindParams?: number;
  maxRowsPerChunk?: number;
}): number {
  if (!Number.isInteger(input.columnCount) || input.columnCount <= 0) {
    throw new Error("columnCount must be a positive integer");
  }

  const maxBindParams = input.maxBindParams ?? SAFE_SQLITE_BIND_PARAM_LIMIT;
  const maxRowsPerChunk =
    input.maxRowsPerChunk ?? DEFAULT_MAX_ROWS_PER_WRITE_CHUNK;

  if (!Number.isInteger(maxBindParams) || maxBindParams <= 0) {
    throw new Error("maxBindParams must be a positive integer");
  }

  if (!Number.isInteger(maxRowsPerChunk) || maxRowsPerChunk <= 0) {
    throw new Error("maxRowsPerChunk must be a positive integer");
  }

  const bindLimitedRows = Math.floor(maxBindParams / input.columnCount);
  return Math.max(1, Math.min(maxRowsPerChunk, bindLimitedRows));
}

export function chunkArray<T>(rows: readonly T[], chunkSize: number): T[][] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("chunkSize must be a positive integer");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}
