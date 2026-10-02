import { describe, expect, test, vi } from "bun:test";
import contract from "@sync-contract/generated/2026-10-02/sync-contract.json";

vi.mock("../../db", () => ({ db: {} }));
vi.mock("cloudflare:workers", () => ({ env: {} }));

const { repository } = await import("../service");

const registryTableNames: readonly string[] = repository.tableNames;

const contractTableNames = Object.keys(
  contract.tables as Record<string, unknown>
);

describe("sync repository registry", () => {
  test("registry keys exactly match the contract table names in order", () => {
    // Order is FK-load-bearing: parents must be upserted before children.
    expect([...registryTableNames]).toEqual(contractTableNames);
  });

  test("every contract table is pushable (compound names included)", () => {
    for (const name of contractTableNames) {
      expect(registryTableNames).toContain(name);
    }
  });
});
