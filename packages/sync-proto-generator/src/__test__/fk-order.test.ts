import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";
import { syncProtoSchemas } from "../../../protobuf/sync-proto.config";
import { computeSyncTableOrder } from "../fk-order";

const CYCLE_PATTERN = /cycle/i;

const parent = sqliteTable("parents", {
  id: text("id").primaryKey(),
});

const child = sqliteTable("children", {
  id: text("id").primaryKey(),
  parentId: text("parent_id")
    .notNull()
    .references(() => parent.id),
});

const grandchild = sqliteTable("grandchildren", {
  id: text("id").primaryKey(),
  childId: text("child_id")
    .notNull()
    .references(() => child.id),
});

const externalUsers = sqliteTable("users", {
  id: text("id").primaryKey(),
});

const nullableExternal = sqliteTable("nullable_external", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => externalUsers.id),
});

let cycleATable: any;
let cycleBTable: any;

cycleATable = sqliteTable("cycle_a", {
  id: text("id").primaryKey(),
  cycleBId: text("cycle_b_id")
    .notNull()
    .references(() => cycleBTable.id),
});

cycleBTable = sqliteTable("cycle_b", {
  id: text("id").primaryKey(),
  cycleAId: text("cycle_a_id")
    .notNull()
    .references(() => cycleATable.id),
});

describe("sync foreign key order", () => {
  test("orders parents before children for upserts", () => {
    const order = computeSyncTableOrder({
      schemaModule: {
        child,
        grandchild,
        parent,
      },
    });

    expect(order.upsertOrder.indexOf("parents")).toBeLessThan(
      order.upsertOrder.indexOf("children")
    );
    expect(order.upsertOrder.indexOf("children")).toBeLessThan(
      order.upsertOrder.indexOf("grandchildren")
    );
  });

  test("reverses the order for deletes", () => {
    const order = computeSyncTableOrder({
      schemaModule: {
        child,
        grandchild,
        parent,
      },
    });

    expect(order.deleteOrder.indexOf("grandchildren")).toBeLessThan(
      order.deleteOrder.indexOf("children")
    );
    expect(order.deleteOrder.indexOf("children")).toBeLessThan(
      order.deleteOrder.indexOf("parents")
    );
  });

  test("throws on cycles", () => {
    expect(() =>
      computeSyncTableOrder({
        schemaModule: {
          cycleA: cycleATable,
          cycleB: cycleBTable,
        },
      })
    ).toThrow(CYCLE_PATTERN);
  });

  test("ignores nullable references outside the synced table set", () => {
    const order = computeSyncTableOrder({
      schemaModule: {
        nullableExternal,
      },
    });

    expect(order.upsertOrder).toEqual(["nullable_external"]);
  });

  test("orders the real API synced schema for known FK relationships", () => {
    const order = computeSyncTableOrder({
      schemaModule: syncProtoSchemas.apiSyncedSchema,
    });

    expect(order.upsertOrder.indexOf("products")).toBeLessThan(
      order.upsertOrder.indexOf("outlet_products")
    );
    expect(order.upsertOrder.indexOf("orders")).toBeLessThan(
      order.upsertOrder.indexOf("order_items")
    );
  });
});
