import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderApiSyncMappers } from "../ts-mapper-writer";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".."
);
const localSchema = await import("@repo/database");

describe("generated API mapper drift", () => {
  test("runtime API generated mapper matches generator output", () => {
    const generated = renderApiSyncMappers(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
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
