import { describe, expect, test } from "vitest";
import { syncGeneratorConfig } from "../../../protobuf/sync-proto.config";

const BUSINESS_POLICY_PATTERN = /merchant|outlet|tenant|scope/i;

describe("sync generator config", () => {
  test("contains no Sakti business policy", () => {
    const serialized = JSON.stringify(syncGeneratorConfig);

    expect(serialized).not.toMatch(BUSINESS_POLICY_PATTERN);
    expect(syncGeneratorConfig.localOnlyColumns).toEqual(["isSynced"]);
    expect(syncGeneratorConfig.serverOnlyColumns).toEqual(["syncUpdatedAt"]);
    expect(syncGeneratorConfig.primaryKeyColumn).toBe("id");
  });
});
