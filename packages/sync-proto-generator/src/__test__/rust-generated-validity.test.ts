import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  syncGeneratorConfig,
  syncProtoSchemas,
} from "../../../protobuf/sync-proto.config";
import { reflectSyncTables } from "../drizzle-reflection";
import { renderRustSyncMappers } from "../rust-mapper-writer";

describe("generated Rust sync mapper validity", () => {
  test("generated Rust mapper is syntactically valid and rustfmt-formattable", () => {
    const source = renderRustSyncMappers(
      reflectSyncTables({
        config: syncGeneratorConfig,
        schemaModule: syncProtoSchemas.localSyncedSchema,
      })
    );
    const dir = mkdtempSync(join(tmpdir(), "sync-rust-mapper-"));
    const file = join(dir, "protobuf_generated.rs");
    writeFileSync(file, source);

    try {
      const fmt = spawnSync(
        "rustfmt",
        ["--edition", "2021", "--emit", "stdout", file],
        { encoding: "utf8" }
      );

      expect(fmt.status, fmt.stderr).toBe(0);
      expect(fmt.stdout.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
