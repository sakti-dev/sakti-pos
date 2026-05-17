import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { renderApiPushAdapters } from "../api-push-adapter-writer";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderSyncProto } from "../proto-writer";
import { formatGeneratedRust } from "../rust-format";
import { renderRustSyncMappers } from "../rust-mapper-writer";
import { renderApiSyncMappers } from "../ts-mapper-writer";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".."
);

describe("generated sync artifact drift", () => {
  test("checked-in sync.proto matches generator output", async () => {
    const localSchema = await import("@repo/database");
    const tables = reflectSyncTables(localSchema, syncManifest);
    const generated = renderSyncProto(syncManifest, tables);
    const checkedIn = readFileSync(
      join(repoRoot, "packages", "protobuf", "proto", "sync.proto"),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });

  test("checked-in API generated mapper matches generator output", async () => {
    const localSchema = await import("@repo/database");
    const tables = reflectSyncTables(localSchema, syncManifest);
    const generated = renderApiSyncMappers(syncManifest, tables);
    const checkedIn = readFileSync(
      join(repoRoot, "apps", "api", "src", "sync", "protobuf.generated.ts"),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });

  test("checked-in API push adapter matches generator output", async () => {
    const localSchema = await import("@repo/database");
    const tables = reflectSyncTables(localSchema, syncManifest);
    const generated = renderApiPushAdapters(syncManifest, tables);
    const checkedIn = readFileSync(
      join(
        repoRoot,
        "apps",
        "api",
        "src",
        "sync",
        "push-adapters.generated.ts"
      ),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });

  test("checked-in Rust generated mapper matches generator output", async () => {
    const localSchema = await import("@repo/database");
    const tables = reflectSyncTables(localSchema, syncManifest);
    const generated = formatGeneratedRust(
      renderRustSyncMappers(syncManifest, tables)
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
