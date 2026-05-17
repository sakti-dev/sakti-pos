import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { renderApiPushAdapters } from "./api-push-adapter-writer";
import { reflectSyncTables } from "./drizzle-reflection";
import { type GenerateMode, resolveGeneratorOutputPath } from "./file-output";
import { syncManifest } from "./manifest";
import { renderSyncProto } from "./proto-writer";
import { formatGeneratedRust } from "./rust-format";
import { renderRustSyncMappers } from "./rust-mapper-writer";
import { renderApiSyncMappers } from "./ts-mapper-writer";

declare const Bun: { argv: string[] };

function parseMode(argv: string[]): GenerateMode {
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : "compare";
  if (mode === "compare" || mode === "write") {
    return mode;
  }
  throw new Error(`Invalid generator mode: ${mode}`);
}

const tables = reflectSyncTables(await import("@repo/database"), syncManifest);
const mode = parseMode(Bun.argv);

const proto = renderSyncProto(syncManifest, tables);
const protoPath = resolveGeneratorOutputPath(mode, "sync.proto");
mkdirSync(dirname(protoPath), { recursive: true });
writeFileSync(protoPath, proto);
console.log(`[SYNC_PROTO_GENERATOR] wrote ${protoPath}`);

const mappers = renderApiSyncMappers(syncManifest, tables);
const mappersPath = resolveGeneratorOutputPath(mode, "api-sync-mappers.ts");
mkdirSync(dirname(mappersPath), { recursive: true });
writeFileSync(mappersPath, mappers);
console.log(`[SYNC_PROTO_GENERATOR] wrote ${mappersPath}`);

const pushAdapters = renderApiPushAdapters(syncManifest, tables);
const pushAdaptersPath = resolveGeneratorOutputPath(
  mode,
  "api-push-adapters.ts"
);
mkdirSync(dirname(pushAdaptersPath), { recursive: true });
writeFileSync(pushAdaptersPath, pushAdapters);
console.log(`[SYNC_PROTO_GENERATOR] wrote ${pushAdaptersPath}`);

const rustMappers = renderRustSyncMappers(syncManifest, tables);
const rustPath = resolveGeneratorOutputPath(mode, "pos-sync-mappers.rs");
mkdirSync(dirname(rustPath), { recursive: true });
writeFileSync(rustPath, formatGeneratedRust(rustMappers));
console.log(`[SYNC_PROTO_GENERATOR] wrote ${rustPath}`);
