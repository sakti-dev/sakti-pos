import { describe, expect, test } from "vitest";
import { resolveGeneratorOutputPath } from "../file-output";

describe("generator file output", () => {
  test("compare mode writes under ignored local comparison directory", () => {
    expect(
      resolveGeneratorOutputPath("compare", "sync.proto").endsWith(
        ".logs/sync-proto-compare/sync.proto"
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

  test("write mode targets checked-in API generated mapper", () => {
    expect(
      resolveGeneratorOutputPath("write", "api-sync-mappers.ts").endsWith(
        "apps/api/src/sync/protobuf.generated.ts"
      )
    ).toBe(true);
  });

  test("write mode targets checked-in API push adapter", () => {
    expect(
      resolveGeneratorOutputPath("write", "api-push-adapters.ts").endsWith(
        "apps/api/src/sync/push-adapters.generated.ts"
      )
    ).toBe(true);
  });

  test("write mode targets checked-in Rust generated mapper", () => {
    expect(
      resolveGeneratorOutputPath("write", "pos-sync-mappers.rs").endsWith(
        "apps/pos-app/src-tauri/src/sync/protobuf_generated.rs"
      )
    ).toBe(true);
  });
});
