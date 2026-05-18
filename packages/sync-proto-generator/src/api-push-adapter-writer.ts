import type { ReflectedSyncTable } from "./drizzle-reflection";
import { computeSyncTableOrder } from "./fk-order";

function toAdapterConstName(tableName: string): string {
  return `${tableName}_sync_table_adapter`;
}

function toMapProtoRowName(tableName: string): string {
  return `${tableName}_map_proto_row`;
}

function toUpsertRowsName(tableName: string): string {
  return `${tableName}_upsert_rows`;
}

function toDeleteRowsName(tableName: string): string {
  return `${tableName}_delete_rows`;
}

function renderHelpers(): string {
  return [
    "const SQLITE_BIND_LIMIT = 999;",
    "const INTEGER_STRING_PATTERN = /^-?\\d+$/;",
    "",
    'import type { SQLiteTable } from "drizzle-orm/sqlite-core";',
    "",
    "export type TransactionLike = {",
    "  insert: <TTable extends SQLiteTable>(table: TTable) => {",
    "    values: (rows: Record<string, unknown>[]) => {",
    "      onConflictDoUpdate: (input: { set: Record<string, unknown>; target: unknown }) => Promise<unknown> | unknown;",
    "    };",
    "  };",
    "  select: <TSelection extends Record<string, unknown>>(fields: TSelection) => {",
    "    from: (table: SQLiteTable) => {",
    "      where: (condition: unknown) => unknown;",
    "    };",
    "  };",
    "  update: <TTable extends SQLiteTable>(table: TTable) => {",
    "    set: (values: Record<string, unknown>) => {",
    "      where: (condition: unknown) => unknown;",
    "    };",
    "  };",
    "  delete: <TTable extends SQLiteTable>(table: TTable) => {",
    "    where: (condition: unknown) => Promise<unknown> | unknown;",
    "  };",
    "};",
    "",
    "export interface GenericSyncTableAdapter {",
    "  deleteRows(tx: TransactionLike, ids: string[]): Promise<void>;",
    "  mapProtoRow(row: Record<string, unknown>): Record<string, unknown>;",
    "  tableName: string;",
    "  upsertRows(tx: TransactionLike, rows: Record<string, unknown>[]): Promise<void>;",
    "  writeColumnCount: number;",
    "}",
    "",
    "function chunkRows<T>(rows: T[], chunkSize: number): T[][] {",
    "  const chunks: T[][] = [];",
    "  if (chunkSize <= 0) return chunks;",
    "  for (let index = 0; index < rows.length; index += chunkSize) {",
    "    chunks.push(rows.slice(index, index + chunkSize));",
    "  }",
    "  return chunks;",
    "}",
    "",
    "function getWriteChunkSize(writeColumnCount: number): number {",
    "  return Math.max(1, Math.floor(SQLITE_BIND_LIMIT / writeColumnCount));",
    "}",
    "",
    "function boolField(value: unknown): boolean {",
    "  return value === true || value === 1;",
    "}",
    "",
    "function nullableStringField(value: unknown): string | null {",
    "  if (value == null) return null;",
    '  return typeof value === "string" && value.length > 0 ? value : null;',
    "}",
    "",
    "function stringField(value: unknown): string {",
    '  return typeof value === "string" ? value : "";',
    "}",
    "",
    "function nullableInt64NumberField(value: unknown, fieldName: string): number | null {",
    '  if (value == null || value === "") return null;',
    "  return requiredInt64NumberField(value, fieldName);",
    "}",
    "",
    "function requiredInt64NumberField(value: unknown, fieldName: string): number {",
    '  if (typeof value === "bigint") return protobufInt64ToSafeNumber(value, fieldName);',
    '  if (typeof value === "number" && Number.isSafeInteger(value)) return value;',
    '  if (typeof value === "string" && INTEGER_STRING_PATTERN.test(value)) return protobufInt64ToSafeNumber(BigInt(value), fieldName);',
    "  return 0;",
    "}",
    "",
    "async function deleteRowsByAdapter(",
    "  tx: TransactionLike,",
    "  table: SQLiteTable,",
    "  ids: string[]",
    "): Promise<void> {",
    "  if (ids.length === 0) return;",
    "  const chunkSize = getWriteChunkSize(1);",
    "  const idColumn = (table as unknown as { id: never }).id;",
    "  for (const chunk of chunkRows(ids, chunkSize)) {",
    "    await tx.delete(table).where(inArray(idColumn, chunk));",
    "  }",
    "}",
  ].join("\n");
}

function renderRowMapper(table: ReflectedSyncTable): string {
  const funcName = toMapProtoRowName(table.tableName);
  const lines = [
    `function ${funcName}(row: Record<string, unknown>) {`,
    "  return {",
  ];

  for (const column of table.columns) {
    let expr: string;
    if (column.protoType === "int64") {
      expr = column.notNull
        ? `requiredInt64NumberField(row.${column.propertyName}, "${table.tableName}.${column.propertyName}")`
        : `nullableInt64NumberField(row.${column.propertyName}, "${table.tableName}.${column.propertyName}")`;
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
  lines.push("}");
  return lines.join("\n");
}

function renderUpsertRows(table: ReflectedSyncTable): string {
  const functionName = toUpsertRowsName(table.tableName);
  const tableVarName = table.schemaBindingName;
  const setLines = table.columns
    .filter((column) => column.propertyName !== "id")
    .map(
      (column) =>
        `      ${column.propertyName}: sql.raw("excluded.${column.columnName}"),`
    );

  return [
    `async function ${functionName}(tx: TransactionLike, rows: Record<string, unknown>[]) {`,
    "  if (rows.length === 0) return;",
    `  const chunkSize = getWriteChunkSize(${table.columns.length});`,
    "  for (const chunk of chunkRows(rows, chunkSize)) {",
    "    await tx.insert(",
    `      ${tableVarName}`,
    "    ).values(chunk).onConflictDoUpdate({",
    `      target: ${tableVarName}.id,`,
    "      set: {",
    ...setLines,
    "      },",
    "    });",
    "  }",
    "}",
  ].join("\n");
}

function renderDeleteRows(table: ReflectedSyncTable): string {
  const functionName = toDeleteRowsName(table.tableName);
  const tableVarName = table.schemaBindingName;
  return [
    `async function ${functionName}(tx: TransactionLike, ids: string[]) {`,
    `  return deleteRowsByAdapter(tx, ${tableVarName}, ids);`,
    "}",
  ].join("\n");
}

function renderAdapter(table: ReflectedSyncTable): string {
  const adapterName = toAdapterConstName(table.tableName);
  const mapProtoRow = toMapProtoRowName(table.tableName);
  const upsertRows = toUpsertRowsName(table.tableName);
  const deleteRows = toDeleteRowsName(table.tableName);

  return [
    `function ${adapterName}() {`,
    "  return {",
    `    deleteRows: ${deleteRows},`,
    `    mapProtoRow: ${mapProtoRow},`,
    `    tableName: "${table.tableName}",`,
    `    upsertRows: ${upsertRows},`,
    `    writeColumnCount: ${table.columns.length},`,
    "  } as const;",
    "}",
  ].join("\n");
}

function renderOrderConstants(orderedTableNames: string[]): string {
  return [
    `export const SYNC_UPSERT_ORDER = [${orderedTableNames
      .map((tableName) => `"${tableName}"`)
      .join(", ")}] as const;`,
    `export const SYNC_DELETE_ORDER = [${[...orderedTableNames]
      .reverse()
      .map((tableName) => `"${tableName}"`)
      .join(", ")}] as const;`,
  ].join("\n");
}

export function renderApiPushAdapters(
  tables: ReflectedSyncTable[],
  schemaModule: Record<string, unknown>
): string {
  const tableByName = new Map(tables.map((table) => [table.tableName, table]));
  const orderedTableNames = computeSyncTableOrder({
    schemaModule,
    syncedTableNames: tables.map((table) => table.tableName),
  }).upsertOrder;
  const orderedTables = orderedTableNames.map((tableName) => {
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
    `import { ${orderedTables
      .map((table) => table.schemaBindingName)
      .join(", ")} } from "@repo/database/api-synced-schema";`,
    'import { inArray, sql } from "drizzle-orm";',
    'import { protobufInt64ToSafeNumber } from "./protobuf";',
    "",
    renderHelpers(),
    "",
  ];

  for (const table of orderedTables) {
    parts.push(renderRowMapper(table));
    parts.push("");
    parts.push(renderUpsertRows(table));
    parts.push("");
    parts.push(renderDeleteRows(table));
    parts.push("");
    parts.push(renderAdapter(table));
    parts.push("");
  }

  parts.push(renderOrderConstants(orderedTableNames));
  parts.push("");
  parts.push("export const PUSH_TABLE_ADAPTERS = [");
  for (const tableName of orderedTableNames) {
    parts.push(`  ${toAdapterConstName(tableName)}(),`);
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
