import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  syncGeneratorConfig,
  syncProtoSchemas,
} from "../../../protobuf/sync-proto.config";
import { reflectSyncTables } from "../drizzle-reflection";
import { formatGeneratedRust } from "../rust-format";
import { renderRustSyncMappers } from "../rust-mapper-writer";

const posAppSyncDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "apps",
  "pos-app",
  "src-tauri",
  "src",
  "sync"
);

function extractRowFromValueFunc(
  source: string,
  funcName: string
): Map<string, string[]> {
  const funcPattern = new RegExp(
    `fn ${funcName}\\(row: &Value\\) -> \\w+ \\{[\\s\\S]*?^\\}`,
    "m"
  );
  const match = source.match(funcPattern);
  if (!match) {
    return new Map();
  }

  const body = match[0].replace(/\n\s*/g, " ");
  const fieldPattern = /(\w+):\s*(\w+)\(\s*row,\s*&\[([^\]]+)\]\s*,?\s*\)/g;
  const fields = new Map<string, string[]>();
  for (const fieldMatch of body.matchAll(fieldPattern)) {
    const fieldName = fieldMatch[1];
    const helper = fieldMatch[2];
    const keys = fieldMatch[3]
      .split(",")
      .map((k) => k.trim().replace(/"/g, ""));
    fields.set(fieldName, [helper, ...keys]);
  }
  return fields;
}

function extractRowToValueFunc(
  source: string,
  funcName: string
): Map<string, string> {
  const funcPattern = new RegExp(
    `fn ${funcName}\\(row: &\\w+\\) -> Value \\{[\\s\\S]*?^\\}`,
    "m"
  );
  const match = source.match(funcPattern);
  if (!match) {
    return new Map();
  }

  const body = match[0];
  const fieldPattern = /"(\\w+)":\s*(.+?)[,\n]/g;
  const fields = new Map<string, string>();
  for (const fieldMatch of body.matchAll(fieldPattern)) {
    const jsonKey = fieldMatch[1];
    const valueExpr = fieldMatch[2].trim();
    fields.set(jsonKey, valueExpr);
  }
  return fields;
}

describe("generated Rust mapper runtime logic", () => {
  const tables = reflectSyncTables({
    config: syncGeneratorConfig,
    schemaModule: syncProtoSchemas.localSyncedSchema,
  });
  const generatedRawSource = renderRustSyncMappers(tables);
  const generatedSource = formatGeneratedRust(generatedRawSource);
  const runtimeSource = readFileSync(
    join(posAppSyncDir, "protobuf_generated.rs"),
    "utf8"
  );

  test("generated source matches runtime Rust mapper", () => {
    expect(runtimeSource).toBe(generatedSource);
  });

  test("generated product_row_from_value matches manual field key ordering", () => {
    const generated = extractRowFromValueFunc(
      generatedSource,
      "products_row_from_value"
    );
    const manual = extractRowFromValueFunc(
      runtimeSource,
      "products_row_from_value"
    );

    const hotFieldNames = [
      "id",
      "merchant_id",
      "category_id",
      "name",
      "price_minor_units",
      "image_url",
      "image_asset_id",
      "is_active",
      "sort_order",
      "deleted_at",
      "created_at",
      "updated_at",
    ];

    for (const fieldName of hotFieldNames) {
      expect(
        generated.has(fieldName),
        `generated missing field: ${fieldName}`
      ).toBe(true);
      expect(manual.has(fieldName), `manual missing field: ${fieldName}`).toBe(
        true
      );

      const genEntry = generated.get(fieldName)!;
      const manEntry = manual.get(fieldName)!;

      for (let i = 0; i < manEntry.length; i++) {
        expect(genEntry[i]).toBe(manEntry[i]);
      }
    }
  });

  test("generated order_item_row_from_value matches manual field key ordering", () => {
    const generated = extractRowFromValueFunc(
      generatedSource,
      "order_items_row_from_value"
    );
    const manual = extractRowFromValueFunc(
      runtimeSource,
      "order_items_row_from_value"
    );

    const hotFieldNames = [
      "id",
      "order_id",
      "outlet_id",
      "product_id",
      "product_name",
      "quantity",
      "unit_price_minor_units",
      "original_price_minor_units",
      "subtotal_minor_units",
      "deleted_at",
      "created_at",
      "updated_at",
    ];

    for (const fieldName of hotFieldNames) {
      expect(
        generated.has(fieldName),
        `generated missing field: ${fieldName}`
      ).toBe(true);
      expect(manual.has(fieldName), `manual missing field: ${fieldName}`).toBe(
        true
      );

      const genEntry = generated.get(fieldName)!;
      const manEntry = manual.get(fieldName)!;

      for (let i = 0; i < manEntry.length; i++) {
        expect(genEntry[i]).toBe(manEntry[i]);
      }
    }
  });

  test("generated order_row_from_value matches manual field key ordering", () => {
    const generated = extractRowFromValueFunc(
      generatedSource,
      "orders_row_from_value"
    );
    const manual = extractRowFromValueFunc(
      runtimeSource,
      "orders_row_from_value"
    );

    const hotFieldNames = [
      "id",
      "outlet_id",
      "register_id",
      "staff_id",
      "order_number",
      "total_minor_units",
      "payment_method",
      "amount_paid_minor_units",
      "change_amount_minor_units",
      "status",
      "deleted_at",
      "created_at",
      "updated_at",
    ];

    for (const fieldName of hotFieldNames) {
      expect(
        generated.has(fieldName),
        `generated missing field: ${fieldName}`
      ).toBe(true);
      expect(manual.has(fieldName), `manual missing field: ${fieldName}`).toBe(
        true
      );

      const genEntry = generated.get(fieldName)!;
      const manEntry = manual.get(fieldName)!;

      for (let i = 0; i < manEntry.length; i++) {
        expect(genEntry[i]).toBe(manEntry[i]);
      }
    }
  });

  test("generated outlet_product_row_from_value matches manual field key ordering", () => {
    const generated = extractRowFromValueFunc(
      generatedSource,
      "outlet_products_row_from_value"
    );
    const manual = extractRowFromValueFunc(
      runtimeSource,
      "outlet_products_row_from_value"
    );

    const hotFieldNames = [
      "id",
      "outlet_id",
      "product_id",
      "price_minor_units",
      "is_available",
      "sort_order",
      "deleted_at",
      "created_at",
      "updated_at",
    ];

    for (const fieldName of hotFieldNames) {
      expect(
        generated.has(fieldName),
        `generated missing field: ${fieldName}`
      ).toBe(true);
      expect(manual.has(fieldName), `manual missing field: ${fieldName}`).toBe(
        true
      );

      const genEntry = generated.get(fieldName)!;
      const manEntry = manual.get(fieldName)!;

      for (let i = 0; i < manEntry.length; i++) {
        expect(genEntry[i]).toBe(manEntry[i]);
      }
    }
  });

  test("generated product_row_to_value maps proto fields to DB property names", () => {
    const generated = extractRowToValueFunc(
      generatedSource,
      "products_row_to_value"
    );
    const manual = extractRowToValueFunc(
      runtimeSource,
      "products_row_to_value"
    );

    const moneyAliasFields = [
      "price",
      "unitPrice",
      "originalPrice",
      "subtotal",
      "total",
      "amountPaid",
      "changeAmount",
    ];

    for (const key of moneyAliasFields) {
      if (generated.has(key) && manual.has(key)) {
        expect(generated.get(key)).toBe(manual.get(key));
      }
    }

    const criticalFields = [
      "id",
      "merchantId",
      "name",
      "isActive",
      "sortOrder",
    ];
    for (const key of criticalFields) {
      if (generated.has(key) && manual.has(key)) {
        expect(generated.get(key)).toBe(manual.get(key));
      }
    }
  });

  test("generated helpers value_to_string, value_to_bool, value_to_i64 match manual", () => {
    const helperNames = [
      "value_to_string",
      "value_to_bool",
      "value_to_i64",
    ] as const;

    for (const helper of helperNames) {
      const genPattern = new RegExp(`fn ${helper}\\([\\s\\S]*?^\\}`, "m");
      const genMatch = generatedSource.match(genPattern);
      const manMatch = runtimeSource.match(genPattern);

      expect(genMatch, `generated missing helper: ${helper}`).toBeTruthy();
      expect(manMatch, `manual missing helper: ${helper}`).toBeTruthy();

      const normalize = (s: string) =>
        s
          .replace(/\/\/.*$/gm, "")
          .replace(/\s+/g, " ")
          .trim();

      expect(normalize(genMatch![0])).toBe(normalize(manMatch![0]));
    }
  });
});

function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
