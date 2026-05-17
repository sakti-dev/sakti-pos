import { describe, expect, test } from "vitest";
import { generatorVersion } from "../index";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

describe("sync proto generator package", () => {
  test("exports a generator version", () => {
    expect(generatorVersion).toMatch(SEMVER_PATTERN);
  });
});
