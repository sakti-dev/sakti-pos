import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packagesRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

describe("typed sync contract cleanup", () => {
  test("sync protobuf contract has no JSON row table payload", () => {
    const proto = readFileSync(
      join(packagesRoot, "protobuf", "proto", "sync.proto"),
      "utf8"
    );

    expect(proto).not.toContain("SyncJsonTableChanges");
    expect(proto).not.toContain("created_json");
    expect(proto).not.toContain("updated_json");
  });
});
