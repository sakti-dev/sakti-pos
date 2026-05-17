import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as localSchema from "@repo/database";
import { describe, expect, test } from "vitest";
import { reflectSyncTables } from "../drizzle-reflection";
import { syncManifest } from "../manifest";
import { renderSyncProto } from "../proto-writer";

describe("generated sync proto drift", () => {
  test("checked-in sync.proto matches generator output", () => {
    const generated = renderSyncProto(
      syncManifest,
      reflectSyncTables(localSchema, syncManifest)
    );
    const checkedIn = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "..",
        "protobuf",
        "proto",
        "sync.proto"
      ),
      "utf8"
    );

    expect(checkedIn).toBe(generated);
  });
});
