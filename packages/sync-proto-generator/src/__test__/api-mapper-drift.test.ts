import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  syncGeneratorConfig,
  syncProtoSchemas,
} from "../../../protobuf/sync-proto.config";
import { reflectSyncTables } from "../drizzle-reflection";
import { renderApiSyncMappers } from "../ts-mapper-writer";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".."
);

describe("generated API mapper drift", () => {
  test("runtime API generated mapper matches generator output", () => {
    const generated = renderApiSyncMappers(
      reflectSyncTables({
        config: syncGeneratorConfig,
        schemaModule: syncProtoSchemas.localSyncedSchema,
      })
    );
    const checkedIn = readFileSync(
      join(repoRoot, "apps", "api", "src", "sync", "protobuf.generated.ts"),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });
});

function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
