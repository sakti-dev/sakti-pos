import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  syncGeneratorConfig,
  syncProtoSchemas,
} from "../../../protobuf/sync-proto.config";
import { renderApiPushAdapters } from "../api-push-adapter-writer";
import { reflectSyncTables } from "../drizzle-reflection";
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
  test("checked-in sync.proto matches generator output", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const generated = renderSyncProto(syncGeneratorConfig, tables);
    const checkedIn = readFileSync(
      join(repoRoot, "packages", "protobuf", "proto", "sync.proto"),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });

  test("checked-in sync.ts matches sync-only ts-proto output", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const generatedProto = renderSyncProto(syncGeneratorConfig, tables);
    const dir = mkdtempSync(join(tmpdir(), "sync-ts-proto-"));
    const protoDir = join(dir, "proto");
    const outDir = join(dir, "src");

    try {
      mkdirSync(protoDir, { recursive: true });
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(protoDir, "sync.proto"), generatedProto);
      execFileSync(
        join(
          repoRoot,
          "packages",
          "protobuf",
          "node_modules",
          ".bin",
          "grpc_tools_node_protoc"
        ),
        [
          `--proto_path=${protoDir}`,
          `--plugin=${join(
            repoRoot,
            "packages",
            "protobuf",
            "node_modules",
            ".bin",
            "protoc-gen-ts_proto"
          )}`,
          `--ts_proto_out=${outDir}`,
          "--ts_proto_opt=esModuleInterop=true,forceLong=bigint,outputServices=false,snakeToCamel=false,useExactTypes=false",
          "sync.proto",
        ]
      );

      const generated = readFileSync(join(outDir, "sync.ts"), "utf8");
      const checkedIn = readFileSync(
        join(repoRoot, "packages", "protobuf", "src", "sync.ts"),
        "utf8"
      );

      expect(checkedIn).toBe(generated);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("checked-in API generated mapper matches generator output", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const generated = renderApiSyncMappers(tables);
    const checkedIn = readFileSync(
      join(repoRoot, "apps", "api", "src", "sync", "protobuf.generated.ts"),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });

  test("checked-in API push adapter matches generator output", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const generated = renderApiPushAdapters(
      tables,
      syncProtoSchemas.apiSyncedSchema
    );
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

  test("checked-in Rust generated mapper matches generator output", () => {
    const tables = reflectSyncTables({
      config: syncGeneratorConfig,
      schemaModule: syncProtoSchemas.localSyncedSchema,
    });
    const generated = formatGeneratedRust(renderRustSyncMappers(tables));
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
