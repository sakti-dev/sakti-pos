import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { compareManualHotTableContract } from "../proto-compare";
import { renderSyncProto } from "../proto-writer";

const __dirname = dirname(fileURLToPath(import.meta.url));

const currentProtoPath = join(
  __dirname,
  "..",
  "..",
  "..",
  "protobuf",
  "proto",
  "sync.proto"
);

describe("proto comparison with manual contract", () => {
  test("generated hot-table rows match current manual field numbers and types", async () => {
    const localSchema = await import("@repo/database");
    const currentProto = readFileSync(currentProtoPath, "utf8");
    const generatedProto = renderSyncProto(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );

    expect(compareManualHotTableContract(currentProto, generatedProto)).toEqual(
      []
    );
  });
});
