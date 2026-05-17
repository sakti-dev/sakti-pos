import { describe, expect, test } from "vitest";
import { resolveGeneratorOutputPath } from "../file-output";

describe("generator file output", () => {
  test("compare mode writes under package generated directory", () => {
    expect(
      resolveGeneratorOutputPath("compare", "sync.proto").endsWith(
        "packages/sync-proto-generator/generated/sync.proto"
      )
    ).toBe(true);
  });

  test("write mode targets checked-in protobuf contract", () => {
    expect(
      resolveGeneratorOutputPath("write", "sync.proto").endsWith(
        "packages/protobuf/proto/sync.proto"
      )
    ).toBe(true);
  });
});
