import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("tauri config", () => {
  test("enables asset protocol for cached local previews", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8")
    ) as {
      app?: {
        security?: {
          assetProtocol?: {
            enable?: boolean;
            scope?: string[] | { allow?: string[] };
          };
        };
      };
    };

    expect(config.app?.security?.assetProtocol?.enable).toBe(true);
    expect(
      Array.isArray(config.app?.security?.assetProtocol?.scope)
        ? config.app?.security?.assetProtocol?.scope
        : config.app?.security?.assetProtocol?.scope?.allow
    ).toContain("$APPCACHE/**/*");
    expect(
      Array.isArray(config.app?.security?.assetProtocol?.scope)
        ? config.app?.security?.assetProtocol?.scope
        : config.app?.security?.assetProtocol?.scope?.allow
    ).toContain("$APPCONFIG/asset-cache/**/*");
  });
});
