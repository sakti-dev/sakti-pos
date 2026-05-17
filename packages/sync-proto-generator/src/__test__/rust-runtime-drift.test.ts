import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderRustSyncMappers } from "../rust-mapper-writer";
import { formatGeneratedRust } from "../rust-format";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".."
);
const localSchema = await import("@repo/database");

describe("generated Rust mapper drift", () => {
  test("runtime Rust generated mapper matches generator output", () => {
    const generated = formatGeneratedRust(
      renderRustSyncMappers(syncManifest, reflectSyncTables(localSchema, syncManifest))
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
