import type { ReflectedSyncTable } from "./drizzle-reflection";
import type { SyncManifest } from "./manifest";

const SNAKE_TO_CAMEL_PATTERN = /_([a-z])/g;
const PUSH_TABLE_ORDER = [
  "merchants",
  "outlets",
  "registers",
  "staff",
  "categories",
  "assets",
  "products",
  "outlet_products",
  "orders",
  "order_items",
] as const;

function snakeToCamel(value: string): string {
  return value.replace(SNAKE_TO_CAMEL_PATTERN, (_, letter: string) =>
    letter.toUpperCase()
  );
}

function toPascalCase(value: string): string {
  const camel = snakeToCamel(value);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toAdapterConstName(tableName: string): string {
  return `${toPascalCase(tableName)}PushTableAdapter`;
}

function toRowMapperName(tableName: string): string {
  return `${snakeToCamel(tableName)}RowToInsertRow`;
}

function toSelectRowsName(tableName: string): string {
  return `${snakeToCamel(tableName)}SelectExistingRows`;
}

function toUpsertRowsName(tableName: string): string {
  return `${snakeToCamel(tableName)}UpsertRows`;
}

function toSoftDeleteRowsName(tableName: string): string {
  return `${snakeToCamel(tableName)}SoftDeleteRows`;
}

function renderHelpers(): string {
  return [
    "const INTEGER_STRING_PATTERN = /^-?\\d+$/;",
    "",
    'import type { SQLiteTable } from "drizzle-orm/sqlite-core";',
    "",
    "export type TransactionLike = {",
    "  insert: <TTable extends SQLiteTable>(table: TTable) => {",
    "    values: (rows: Record<string, unknown>[]) => {",
    "      onConflictDoNothing: () => Promise<unknown> | unknown;",
    "      onConflictDoUpdate: (input: { set: Record<string, unknown>; target: unknown }) => Promise<unknown> | unknown;",
    "    };",
    "  };",
    "  select: <TFields extends Record<string, unknown>>(fields: TFields) => {",
    "    from: <TTable extends SQLiteTable>(table: TTable) => {",
    "      where: (condition: unknown) => Promise<unknown[]> | { limit: (value: number) => Promise<unknown[]> | unknown };",
    "    };",
    "  };",
    "  update: <TTable extends SQLiteTable>(table: TTable) => {",
    "    set: (patch: Record<string, unknown>) => {",
    "      where: (condition: unknown) => Promise<unknown> | unknown;",
    "    };",
    "  };",
    "};",
    "",
    "export interface PushAdapterContext {",
    "  merchantId: string;",
    "  outletId: string;",
    "}",
    "",
    "export interface PushTableAdapter {",
    '  readonly scope: "merchant" | "outlet";',
    "  readonly serviceKey: string;",
    "  readonly tableName: string;",
    "  readonly writeColumnCount: number;",
    "  mapRow(row: Record<string, unknown>, context: PushAdapterContext): Record<string, unknown>;",
    "  selectExistingRows(tx: TransactionLike, ids: string[]): Promise<Record<string, unknown>[]>;",
    "  upsertRows(tx: TransactionLike, rows: Record<string, unknown>[]): Promise<void>;",
    "  softDeleteRows(tx: TransactionLike, ids: string[], now: string): Promise<void>;",
    "}",
    "",
    "function stringField(value: unknown): string {",
    '  return typeof value === "string" ? value : "";',
    "}",
    "",
    "function nullableStringField(value: unknown): string | null {",
    "  if (value == null) return null;",
    '  if (typeof value === "string") return value.length === 0 ? null : value;',
    "  return null;",
    "}",
    "",
    "function boolField(value: unknown): boolean {",
    "  return value === true || value === 1;",
    "}",
    "",
    "function requiredInt64NumberField(value: unknown, fieldName: string): number {",
    '  if (typeof value === "bigint") return protobufInt64ToSafeNumber(value, fieldName);',
    '  if (typeof value === "number" && Number.isSafeInteger(value)) return value;',
    '  if (typeof value === "string" && INTEGER_STRING_PATTERN.test(value)) return protobufInt64ToSafeNumber(BigInt(value), fieldName);',
    "  return 0;",
    "}",
    "",
    "function nullableInt64NumberField(value: unknown, fieldName: string): number | null {",
    '  if (value == null || value === "") return null;',
    "  return requiredInt64NumberField(value, fieldName);",
    "}",
    "",
    "function applyContextOwnership(",
    "  row: Record<string, unknown>,",
    "  context: PushAdapterContext,",
    '  ownershipColumn: "merchantId" | "outletId" | null',
    "): Record<string, unknown> {",
    "  if (!ownershipColumn) return row;",
    "  return {",
    "    ...row,",
    '    [ownershipColumn]: ownershipColumn === "merchantId" ? context.merchantId : context.outletId,',
    "  };",
    "}",
    "",
    "async function selectExistingRowsById(",
    "  tx: TransactionLike,",
    "  table: SQLiteTable,",
    "  projection: Record<string, unknown>,",
    "  ids: string[]",
    "): Promise<Record<string, unknown>[]> {",
    "  if (ids.length === 0) return [];",
    "  const idColumn = (table as unknown as { id: never }).id;",
    "  const rows = await resolveRowsLike(",
    "    tx.select(projection).from(table).where(inArray(idColumn, ids)),",
    "    ids.length",
    "  );",
    "  return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];",
    "}",
    "",
    "async function resolveRowsLike(value: unknown, limit: number): Promise<unknown> {",
    "  if (Array.isArray(value)) return value;",
    '  if (typeof value === "object" && value !== null && "limit" in value && typeof (value as { limit: unknown }).limit === "function") {',
    "    return await resolveRowsLike(await (value as { limit: (value: number) => unknown }).limit(limit), limit);",
    "  }",
    "  return await value;",
    "}",
    "",
    "async function upsertRowsByAdapter(",
    "  tx: TransactionLike,",
    "  table: SQLiteTable,",
    "  set: Record<string, unknown>,",
    "  rows: Record<string, unknown>[]",
    "): Promise<void> {",
    "  if (rows.length === 0) return;",
    "  const idColumn = (table as unknown as { id: never }).id;",
    "  await tx.insert(table).values(rows).onConflictDoUpdate({ set, target: idColumn });",
    "}",
    "",
    "async function softDeleteRowsByAdapter(",
    "  tx: TransactionLike,",
    "  table: SQLiteTable,",
    "  ids: string[],",
    "  now: string",
    "): Promise<void> {",
    "  if (ids.length === 0) return;",
    "  const idColumn = (table as unknown as { id: never }).id;",
    "  await tx.update(table).set({ deletedAt: now, updatedAt: now }).where(inArray(idColumn, ids));",
    "}",
  ].join("\n");
}

function ownershipColumnForTable(
  table: ReflectedSyncTable
): "merchantId" | "outletId" | null {
  switch (table.tableName) {
    case "outlets":
    case "categories":
    case "assets":
    case "products":
    case "staff":
      return "merchantId";
    case "registers":
    case "orders":
    case "order_items":
    case "outlet_products":
      return "outletId";
    default:
      return null;
  }
}

function renderRowMapper(table: ReflectedSyncTable): string {
  const funcName = toRowMapperName(table.tableName);
  const ownershipColumn = ownershipColumnForTable(table);
  const lines = [
    `function ${funcName}(row: Record<string, unknown>, context: PushAdapterContext) {`,
    "  const normalized = {",
  ];

  for (const column of table.columns) {
    if (column.propertyName === ownershipColumn) {
      continue;
    }

    let expr = `row.${column.propertyName}`;
    if (column.protoType === "int64") {
      const helper = column.notNull
        ? "requiredInt64NumberField"
        : "nullableInt64NumberField";
      expr = `${helper}(row.${column.propertyName}, "${table.tableName}.${column.propertyName}")`;
    } else if (column.protoType === "bool") {
      expr = `boolField(row.${column.propertyName})`;
    } else if (column.notNull) {
      expr = `stringField(row.${column.propertyName})`;
    } else {
      expr = `nullableStringField(row.${column.propertyName})`;
    }

    lines.push(`    ${column.propertyName}: ${expr},`);
  }

  lines.push("  };");
  lines.push(
    `  return applyContextOwnership(normalized, context, ${
      ownershipColumn ? `"${ownershipColumn}"` : "null"
    });`
  );
  lines.push("}");
  return lines.join("\n");
}

function renderUpsertSet(table: ReflectedSyncTable): string {
  const lines = ["{"];
  for (const column of table.columns) {
    if (column.propertyName === "id") {
      continue;
    }
    lines.push(
      `    ${column.propertyName}: sql.raw("excluded.${column.columnName}"),`
    );
  }
  lines.push("  }");
  return lines.join("\n");
}

function renderTableAdapter(
  table: ReflectedSyncTable,
  scope: "merchant" | "outlet"
): string {
  const rowMapper = toRowMapperName(table.tableName);
  const selectName = toSelectRowsName(table.tableName);
  const upsertName = toUpsertRowsName(table.tableName);
  const deleteName = toSoftDeleteRowsName(table.tableName);
  const adapterName = toAdapterConstName(table.tableName);
  const tableIdentifier = table.tsProtoFieldName;
  const projectionFields =
    table.tableName === "order_items"
      ? `{ id: ${tableIdentifier}.id, createdAt: ${tableIdentifier}.createdAt }`
      : `{ id: ${tableIdentifier}.id, updatedAt: ${tableIdentifier}.updatedAt }`;
  const writeColumns = table.columns.map((column) => column.propertyName);
  const upsertSet = renderUpsertSet(table);

  return [
    `function ${selectName}(tx: TransactionLike, ids: string[]) {`,
    `  return selectExistingRowsById(tx, ${tableIdentifier}, ${projectionFields}, ids);`,
    "}",
    "",
    `function ${upsertName}(tx: TransactionLike, rows: Record<string, unknown>[]) {`,
    `  return upsertRowsByAdapter(tx, ${tableIdentifier}, ${upsertSet}, rows);`,
    "}",
    "",
    `function ${deleteName}(tx: TransactionLike, ids: string[], now: string) {`,
    `  return softDeleteRowsByAdapter(tx, ${tableIdentifier}, ids, now);`,
    "}",
    "",
    `function ${adapterName}() {`,
    "  return {",
    `    mapRow: ${rowMapper},`,
    `    scope: "${scope}",`,
    `    selectExistingRows: ${selectName},`,
    `    serviceKey: "${table.serviceKey}",`,
    `    softDeleteRows: ${deleteName},`,
    `    tableName: "${table.tableName}",`,
    `    upsertRows: ${upsertName},`,
    `    writeColumnCount: ${writeColumns.length},`,
    "  } as const;",
    "}",
    "",
  ].join("\n");
}

export function renderApiPushAdapters(
  manifest: SyncManifest,
  tables: ReflectedSyncTable[]
): string {
  const scopeByTableName = new Map(
    manifest.tables.map((table) => [table.tableName, table.scope] as const)
  );
  const tableByName = new Map(tables.map((table) => [table.tableName, table]));
  const orderedTables = PUSH_TABLE_ORDER.map((tableName) => {
    const table = tableByName.get(tableName);
    if (!table) {
      throw new Error(`Missing reflected sync table for ${tableName}`);
    }
    return table;
  });
  const parts: string[] = [
    "// AUTO-GENERATED FILE. DO NOT EDIT.",
    "// Generated by @repo/sync-proto-generator.",
    "",
    'import { assets, categories, merchants, orderItems, orders, outletProducts, outlets, products, registers, staff } from "@repo/database/api-schema";',
    'import { inArray, sql } from "drizzle-orm";',
    'import { protobufInt64ToSafeNumber } from "./protobuf";',
    "",
    renderHelpers(),
    "",
  ];

  for (const table of orderedTables) {
    parts.push(renderRowMapper(table));
    parts.push("");
    parts.push(
      renderTableAdapter(
        table,
        scopeByTableName.get(table.tableName) ?? "merchant"
      )
    );
  }

  parts.push("export const PUSH_TABLE_ADAPTERS = [");
  for (const table of orderedTables) {
    parts.push(`  ${toAdapterConstName(table.tableName)}(),`);
  }
  parts.push("] as const;");
  parts.push("");
  parts.push("export function getPushTableAdapter(tableName: string) {");
  parts.push(
    "  return PUSH_TABLE_ADAPTERS.find((adapter) => adapter.tableName === tableName);"
  );
  parts.push("}");
  parts.push("");

  return parts.join("\n");
}
