import { type AnySQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import type { SyncGeneratorConfig } from "./config-types";

export type ProtoScalarType = "bool" | "int64" | "string";

export interface ReflectedColumn {
  columnName: string;
  notNull: boolean;
  propertyName: string;
  protoName: string;
  protoType: ProtoScalarType;
}

export interface ReflectedSyncTable {
  changeMessageName: string;
  columns: ReflectedColumn[];
  protoFieldName: string;
  rowMessageName: string;
  rustFieldName: string;
  schemaBindingName: string;
  serviceKey: string;
  tableName: string;
  tsProtoFieldName: string;
}

export interface ReflectSyncTablesInput {
  config: SyncGeneratorConfig;
  schemaModule: Record<string, unknown>;
}

function isSQLiteTable(value: unknown): value is AnySQLiteTable {
  if (!value || typeof value !== "object") {
    return false;
  }

  try {
    getTableConfig(value as AnySQLiteTable);
    return true;
  } catch {
    return false;
  }
}

function getColumnPropertyName(table: AnySQLiteTable, column: unknown): string {
  for (const [propertyName, candidate] of Object.entries(
    table as unknown as Record<string, unknown>
  )) {
    if (candidate === column) {
      return propertyName;
    }
  }

  throw new Error("Unable to resolve Drizzle column property name");
}

function inferProtoType(column: unknown): ProtoScalarType {
  const config = column as {
    dataType?: string;
    mode?: string;
  };

  if (config.dataType === "boolean" || config.mode === "boolean") {
    return "bool";
  }

  if (config.dataType === "number" || config.dataType === "bigint") {
    return "int64";
  }

  return "string";
}

function reflectColumns(
  table: AnySQLiteTable,
  config: SyncGeneratorConfig
): ReflectedColumn[] {
  return getTableConfig(table)
    .columns.map((column) => {
      const propertyName = getColumnPropertyName(table, column);
      return {
        columnName: column.name,
        notNull: column.notNull || column.primary,
        propertyName,
        protoName: propertyName,
        protoType: inferProtoType(column),
      };
    })
    .filter((column) => !config.localOnlyColumns.includes(column.propertyName));
}

function reflectSyncTable(
  table: AnySQLiteTable,
  config: SyncGeneratorConfig,
  schemaBindingName: string
): ReflectedSyncTable {
  const tableName = getTableConfig(table).name;

  return {
    changeMessageName: `${tableName}${config.changeMessageSuffix}`,
    columns: reflectColumns(table, config),
    schemaBindingName,
    protoFieldName: tableName,
    rowMessageName: `${tableName}${config.rowMessageSuffix}`,
    rustFieldName: tableName,
    serviceKey: tableName,
    tableName,
    tsProtoFieldName: tableName,
  };
}

function reflectTablesFromSchema(
  schemaModule: Record<string, unknown>,
  config: SyncGeneratorConfig
): ReflectedSyncTable[] {
  return Object.entries(schemaModule)
    .filter(([, value]) => isSQLiteTable(value))
    .sort((left, right) => {
      const leftTable = getTableConfig(left[1] as AnySQLiteTable).name;
      const rightTable = getTableConfig(right[1] as AnySQLiteTable).name;
      return leftTable.localeCompare(rightTable);
    })
    .map(([schemaBindingName, value]) =>
      reflectSyncTable(value as AnySQLiteTable, config, schemaBindingName)
    );
}

export function reflectSyncTables(
  input: ReflectSyncTablesInput
): ReflectedSyncTable[];
export function reflectSyncTables(
  input: ReflectSyncTablesInput
): ReflectedSyncTable[] {
  if (!input || typeof input !== "object" || !("schemaModule" in input)) {
    throw new Error("reflectSyncTables requires a schemaModule");
  }

  return reflectTablesFromSchema(input.schemaModule, input.config);
}
