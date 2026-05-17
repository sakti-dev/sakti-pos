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

const JSON_SYNC_CONTRACT_PATTERN =
  /jsonTables|createdJson|updatedJson|SyncJsonTableChanges/;

const repoRoot = join(packagesRoot, "..");

describe("typed sync contract cleanup", () => {
  test("sync protobuf contract has no JSON row table payload", () => {
    const proto = readFileSync(
      join(packagesRoot, "protobuf", "proto", "sync.proto"),
      "utf8"
    );

    expect(proto).not.toContain("SyncJsonTableChanges");
    expect(proto).not.toContain("created_json");
    expect(proto).not.toContain("updated_json");
    expect(proto).not.toContain("json_tables");
  });

  test("generated API mapper has no JSON row references", () => {
    const generatedTs = readFileSync(
      join(repoRoot, "apps", "api", "src", "sync", "protobuf.generated.ts"),
      "utf8"
    );

    expect(generatedTs).not.toMatch(JSON_SYNC_CONTRACT_PATTERN);
  });
});
