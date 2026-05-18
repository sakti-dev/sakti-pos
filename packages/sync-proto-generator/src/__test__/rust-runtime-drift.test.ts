import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  syncGeneratorConfig,
  syncProtoSchemas,
} from "../../../protobuf/sync-proto.config";
import { reflectSyncTables } from "../drizzle-reflection";
import { formatGeneratedRust } from "../rust-format";
import { renderRustSyncMappers } from "../rust-mapper-writer";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".."
);

describe("generated Rust mapper drift", () => {
  test("runtime Rust generated mapper matches generator output", () => {
    const generated = formatGeneratedRust(
      renderRustSyncMappers(
        reflectSyncTables({
          config: syncGeneratorConfig,
          schemaModule: syncProtoSchemas.localSyncedSchema,
        })
      )
    );
    const checkedIn = readFileSync(
      join(
        repoRoot,
        "apps",
        "pos-app",
        "src-tauri",
        "src",
        "sync",
        "protobuf_generated.rs"
      ),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });
});

function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
