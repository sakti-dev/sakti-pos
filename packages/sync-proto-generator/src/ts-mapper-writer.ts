import type { ReflectedSyncTable } from "./drizzle-reflection";
import type { SyncManifest, SyncTableManifest } from "./manifest";

const SNAKE_TO_CAMEL_PATTERN = /_([a-z])/g;

function snakeToCamel(value: string): string {
  return value.replace(SNAKE_TO_CAMEL_PATTERN, (_, letter: string) =>
    letter.toUpperCase()
  );
}

function rowToProtoFuncName(rowMessageName: string): string {
  return `${rowMessageName.charAt(0).toLowerCase()}${rowMessageName.slice(1)}ToProto`;
}

function renderHelpers(): string {
  return [
    "const INTEGER_STRING_PATTERN = /^-?\\d+$/;",
    "",
    "function int64Field(value: unknown, fieldName: string): bigint {",
    '  if (typeof value === "bigint") return value;',
    '  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);',
    '  if (typeof value === "string" && INTEGER_STRING_PATTERN.test(value)) return BigInt(value);',
    "  if (value == null) return 0n;",
    '  throw new Error("Invalid int64 value for " + fieldName);',
    "}",
    "",
    "function stringField(value: unknown): string {",
    '  return typeof value === "string" ? value : "";',
    "}",
    "",
    "function boolField(value: unknown): boolean {",
    "  return value === true || value === 1;",
    "}",
    "",
    "function coerceBigInt(value: number | bigint): bigint {",
    '  return typeof value === "bigint" ? value : BigInt(value);',
    "}",
  ].join("\n");
}

function renderRowToProto(
  table: ReflectedSyncTable,
  manifestTable: SyncTableManifest
): string {
  const funcName = rowToProtoFuncName(table.rowMessageName);
  const lines = [
    `function ${funcName}(row: Record<string, unknown>) {`,
    "  return {",
  ];

  for (const column of table.columns) {
    const camelProtoName = snakeToCamel(column.protoName);
    const isAlias =
      manifestTable.fieldAliases &&
      column.propertyName in manifestTable.fieldAliases;

    let valueExpr: string;
    if (column.protoType === "int64") {
      if (isAlias) {
        valueExpr = `int64Field(row.${column.propertyName} ?? row.${camelProtoName}, "${table.tableName}.${column.propertyName}")`;
      } else {
        valueExpr = `int64Field(row.${column.propertyName}, "${table.tableName}.${column.propertyName}")`;
      }
    } else if (column.protoType === "bool") {
      valueExpr = `boolField(row.${column.propertyName})`;
    } else {
      valueExpr = `stringField(row.${column.propertyName})`;
    }

    lines.push(`    ${camelProtoName}: ${valueExpr},`);
  }

  lines.push("  };");
  lines.push("}");
  return lines.join("\n");
}

function renderMapTableChanges(): string {
  return [
    "function mapTableChanges<Row>(",
    "  changes: { created: Record<string, unknown>[]; deletedIds: string[]; updated: Record<string, unknown>[] } | undefined,",
    "  mapper: (row: Record<string, unknown>) => Row",
    "): { created: Row[]; deletedIds: string[]; updated: Row[] } | undefined {",
    "  if (!changes) return;",
    "  return {",
    "    created: changes.created.map(mapper),",
    "    deletedIds: changes.deletedIds,",
    "    updated: changes.updated.map(mapper),",
    "  };",
    "}",
  ].join("\n");
}

function renderDecodeFunction(tables: ReflectedSyncTable[]): string {
  const lines = [
    "export function decodeGeneratedPushBatchRequest(request: Record<string, any>) {",
    "  const changes: Record<string, { created: Record<string, unknown>[]; deletedIds: string[]; updated: Record<string, unknown>[] }> = {};",
    "",
  ];

  for (const table of tables) {
    lines.push(`  if (request.${table.tsProtoFieldName}) {`);
    lines.push(`    changes.${table.serviceKey} = {`);
    lines.push(
      `      created: request.${table.tsProtoFieldName}.created.map((row: any) => ({ ...row })),`
    );
    lines.push(
      `      updated: request.${table.tsProtoFieldName}.updated.map((row: any) => ({ ...row })),`
    );
    lines.push(
      `      deletedIds: request.${table.tsProtoFieldName}.deletedIds,`
    );
    lines.push("    };");
    lines.push("  }");
    lines.push("");
  }

  lines.push("  return changes;");
  lines.push("}");
  return lines.join("\n");
}

function renderEncodeFunction(tables: ReflectedSyncTable[]): string {
  const lines = [
    "export function encodeGeneratedPullBatchResponse(result: Record<string, any>) {",
    "  return {",
  ];

  for (const table of tables) {
    const funcName = rowToProtoFuncName(table.rowMessageName);
    lines.push(
      `    ${table.tsProtoFieldName}: mapTableChanges(result.${table.serviceKey}, ${funcName}),`
    );
  }

  lines.push("    hasMore: result.hasMore ?? false,");
  lines.push("    latestEventId: coerceBigInt(result.latestEventId),");
  lines.push("    needsFullResync: result.needsFullResync,");
  lines.push('    nextPageCursor: result.nextPageCursor ?? "",');
  lines.push("    serverTime: result.serverTime,");
  lines.push("  };");
  lines.push("}");
  return lines.join("\n");
}

export function renderApiSyncMappers(
  manifest: SyncManifest,
  tables: ReflectedSyncTable[]
): string {
  const manifestMap = new Map<string, SyncTableManifest>();
  for (const t of manifest.tables) {
    manifestMap.set(t.tableName, t);
  }

  const parts: string[] = [
    "// AUTO-GENERATED FILE. DO NOT EDIT.",
    "// Generated by @repo/sync-proto-generator.",
    "",
    renderHelpers(),
    "",
  ];

  for (const table of tables) {
    const manifestTable = manifestMap.get(table.tableName);
    if (!manifestTable) {
      throw new Error(`No manifest entry for table ${table.tableName}`);
    }
    parts.push(renderRowToProto(table, manifestTable));
    parts.push("");
  }

  parts.push(renderMapTableChanges());
  parts.push("");
  parts.push(renderDecodeFunction(tables));
  parts.push("");
  parts.push(renderEncodeFunction(tables));
  parts.push("");

  return parts.join("\n");
}
