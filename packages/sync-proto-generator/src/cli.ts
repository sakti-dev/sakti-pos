#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderApiPushAdapters } from "./api-push-adapter-writer";
import { reflectSyncTables } from "./drizzle-reflection";
import { renderSyncProto } from "./proto-writer";
import { formatGeneratedRust } from "./rust-format";
import { renderRustSyncMappers } from "./rust-mapper-writer";
import { renderApiSyncMappers } from "./ts-mapper-writer";

interface SyncProtoConfigModule {
  syncGeneratorConfig: Parameters<typeof reflectSyncTables>[0]["config"];
  syncProtoOutputs: {
    apiPushAdapters: string;
    apiSyncMappers: string;
    proto: string;
    rustSyncMappers: string;
    syncTs: string;
  };
  syncProtoSchemas: Parameters<
    typeof reflectSyncTables
  >[0]["schemaModule"] extends Record<string, unknown>
    ? {
        apiSyncedSchema: Record<string, unknown>;
        localSyncedSchema: Record<string, unknown>;
      }
    : never;
}

function usage(): string {
  return [
    "Usage:",
    "  bunx sync-proto-generator generate",
    "",
    "Run from the package that contains sync-proto.config.ts.",
  ].join("\n");
}

function resolveConfigPath(): string {
  const configPath = join(process.cwd(), "sync-proto.config.ts");
  return configPath;
}

async function loadConfig(): Promise<SyncProtoConfigModule> {
  const configPath = resolveConfigPath();
  try {
    return (await import(
      pathToFileURL(configPath).href
    )) as SyncProtoConfigModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to load sync-proto.config.ts from ${configPath}: ${message}`
    );
  }
}

async function writeOutput(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function runSyncTsProtoGeneration(protoPath: string, outputPath: string): void {
  if (basename(outputPath) !== "sync.ts") {
    throw new Error(`sync.ts output must be named sync.ts: ${outputPath}`);
  }

  execFileSync(
    join(process.cwd(), "node_modules", ".bin", "grpc_tools_node_protoc"),
    [
      `--proto_path=${dirname(protoPath)}`,
      "--plugin=./node_modules/.bin/protoc-gen-ts_proto",
      `--ts_proto_out=${dirname(outputPath)}`,
      "--ts_proto_opt=esModuleInterop=true,forceLong=bigint,outputServices=false,snakeToCamel=false,useExactTypes=false",
      basename(protoPath),
    ],
    {
      stdio: "inherit",
    }
  );

  if (!outputPath.startsWith(process.cwd())) {
    throw new Error(
      `sync.ts output must live inside the package root: ${outputPath}`
    );
  }
}

async function generate(): Promise<void> {
  const configModule = await loadConfig();
  const { syncGeneratorConfig, syncProtoOutputs, syncProtoSchemas } =
    configModule;
  const tables = reflectSyncTables({
    config: syncGeneratorConfig,
    schemaModule: syncProtoSchemas.localSyncedSchema,
  });

  await writeOutput(
    syncProtoOutputs.proto,
    renderSyncProto(syncGeneratorConfig, tables)
  );

  runSyncTsProtoGeneration(syncProtoOutputs.proto, syncProtoOutputs.syncTs);

  await writeOutput(
    syncProtoOutputs.apiSyncMappers,
    renderApiSyncMappers(tables)
  );
  await writeOutput(
    syncProtoOutputs.apiPushAdapters,
    renderApiPushAdapters(tables, syncProtoSchemas.apiSyncedSchema)
  );
  await writeOutput(
    syncProtoOutputs.rustSyncMappers,
    formatGeneratedRust(renderRustSyncMappers(tables))
  );
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command !== "generate") {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  await generate();
}

await main();
