import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type GenerateMode = "compare" | "write";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageRoot));

export type GeneratorFileName =
  | "api-sync-mappers.ts"
  | "api-push-adapters.ts"
  | "pos-sync-mappers.rs"
  | "sync.proto";

export function resolveGeneratorOutputPath(
  mode: GenerateMode,
  fileName: GeneratorFileName
): string {
  if (mode === "compare") {
    return join(repoRoot, ".logs", "sync-proto-compare", fileName);
  }
  if (fileName === "sync.proto") {
    return join(repoRoot, "packages", "protobuf", "proto", fileName);
  }
  if (fileName === "api-sync-mappers.ts") {
    return join(
      repoRoot,
      "apps",
      "api",
      "src",
      "sync",
      "protobuf.generated.ts"
    );
  }
  if (fileName === "api-push-adapters.ts") {
    return join(
      repoRoot,
      "apps",
      "api",
      "src",
      "sync",
      "push-adapters.generated.ts"
    );
  }
  if (fileName === "pos-sync-mappers.rs") {
    return join(
      repoRoot,
      "apps",
      "pos-app",
      "src-tauri",
      "src",
      "sync",
      "protobuf_generated.rs"
    );
  }
  return join(repoRoot, ".logs", "sync-proto-compare", fileName);
}
