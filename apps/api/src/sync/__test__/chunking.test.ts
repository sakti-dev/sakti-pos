import { describe, expect, test } from "bun:test";
import { chunkArray, getWriteChunkSize } from "../chunking";

describe("chunking", () => {
  test("calculates write chunk size from bind limit and column count", () => {
    expect(
      getWriteChunkSize({
        columnCount: 12,
        maxBindParams: 30_000,
        maxRowsPerChunk: 500,
      })
    ).toBe(500);
    expect(
      getWriteChunkSize({
        columnCount: 100,
        maxBindParams: 1000,
        maxRowsPerChunk: 500,
      })
    ).toBe(10);
  });

  test("never returns zero chunk size", () => {
    expect(
      getWriteChunkSize({
        columnCount: 50_000,
        maxBindParams: 30_000,
        maxRowsPerChunk: 500,
      })
    ).toBe(1);
  });

  test("chunks rows without mutating input", () => {
    const rows = [1, 2, 3, 4, 5];
    expect(chunkArray(rows, 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(rows).toEqual([1, 2, 3, 4, 5]);
  });
});
