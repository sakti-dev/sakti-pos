import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { reflectSyncTables } from "./drizzle-reflection";
import { type GenerateMode, resolveGeneratorOutputPath } from "./file-output";
import { syncManifest } from "./manifest";
import { renderSyncProto } from "./proto-writer";

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
const proto = renderSyncProto(syncManifest, tables);
const mode = parseMode(Bun.argv);
const outputPath = resolveGeneratorOutputPath(mode, "sync.proto");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, proto);
console.log(`[SYNC_PROTO_GENERATOR] wrote ${outputPath}`);
