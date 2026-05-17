import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type GenerateMode = "compare" | "write";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));

export type GeneratorFileName = "api-sync-mappers.ts" | "sync.proto";

export function resolveGeneratorOutputPath(
  mode: GenerateMode,
  fileName: GeneratorFileName
): string {
  if (mode === "compare") {
    return join(packageRoot, "generated", fileName);
  }
  return join(repoRoot, "packages", "protobuf", "proto", fileName);
}
