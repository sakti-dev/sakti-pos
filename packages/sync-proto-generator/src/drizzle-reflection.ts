import { type AnySQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import type { SyncManifest, SyncTableManifest } from "./manifest";

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
  serviceKey: string;
  tableName: string;
  tsProtoFieldName: string;
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
  const columns = table as unknown as Record<string, unknown>;
  for (const [propertyName, candidate] of Object.entries(columns)) {
    if (candidate === column) {
      return propertyName;
    }
  }
  throw new Error("Unable to resolve Drizzle column property name");
}

const CAMEL_TO_SNAKE_PATTERN = /[A-Z]/g;

function camelToSnake(value: string): string {
  return value.replace(
    CAMEL_TO_SNAKE_PATTERN,
    (letter) => `_${letter.toLowerCase()}`
  );
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

function findSchemaTable(
  schemaTables: AnySQLiteTable[],
  tableName: string
): AnySQLiteTable {
  const table = schemaTables.find(
    (schemaTable) => getTableConfig(schemaTable).name === tableName
  );
  if (!table) {
    throw new Error(`Missing Drizzle table for sync table ${tableName}`);
  }
  return table;
}

function reflectColumns(
  table: AnySQLiteTable,
  manifest: SyncManifest,
  manifestTable: SyncTableManifest
): ReflectedColumn[] {
  return getTableConfig(table)
    .columns.map((column) => {
      const propertyName = getColumnPropertyName(table, column);
      const alias = manifestTable.fieldAliases?.[propertyName];
      return {
        columnName: column.name,
        notNull: column.notNull,
        propertyName,
        protoName: alias?.protoName ?? camelToSnake(propertyName),
        protoType: alias?.protoType ?? inferProtoType(column),
      };
    })
    .filter(
      (column) => !manifest.globalExcludeColumns.includes(column.propertyName)
    );
}

function columnsByProperty(
  columns: ReflectedColumn[]
): Map<string, ReflectedColumn> {
  const reflectedByProperty = new Map<string, ReflectedColumn>();
  for (const column of columns) {
    reflectedByProperty.set(column.propertyName, column);
  }
  return reflectedByProperty;
}

function validateAliases(
  manifestTable: SyncTableManifest,
  reflectedByProperty: Map<string, ReflectedColumn>
) {
  for (const aliasKey of Object.keys(manifestTable.fieldAliases ?? {})) {
    if (!reflectedByProperty.has(aliasKey)) {
      throw new Error(
        `Invalid sync manifest for ${manifestTable.tableName}: fieldAlias references missing property ${aliasKey}`
      );
    }
  }
}

function validateFieldOrder(input: {
  columns: ReflectedColumn[];
  manifestTable: SyncTableManifest;
  reflectedByProperty: Map<string, ReflectedColumn>;
}) {
  const { columns, manifestTable, reflectedByProperty } = input;
  if (!manifestTable.fieldOrder) {
    return;
  }

  for (const name of manifestTable.fieldOrder) {
    if (!reflectedByProperty.has(name)) {
      throw new Error(
        `Invalid sync manifest for ${manifestTable.tableName}: fieldOrder references missing property ${name}`
      );
    }
  }

  const fieldOrderSet = new Set(manifestTable.fieldOrder);
  for (const column of columns) {
    if (!fieldOrderSet.has(column.propertyName)) {
      throw new Error(
        `Invalid sync manifest for ${manifestTable.tableName}: fieldOrder omits reflected transport column ${column.propertyName}`
      );
    }
  }
}

function orderedColumns(
  manifestTable: SyncTableManifest,
  reflectedColumns: ReflectedColumn[],
  reflectedByProperty: Map<string, ReflectedColumn>
): ReflectedColumn[] {
  if (!manifestTable.fieldOrder) {
    return reflectedColumns;
  }

  return manifestTable.fieldOrder.map((name) => {
    const column = reflectedByProperty.get(name);
    if (!column) {
      throw new Error(
        `Invalid sync manifest for ${manifestTable.tableName}: fieldOrder references missing property ${name}`
      );
    }
    return column;
  });
}

function reflectSyncTable(
  schemaTables: AnySQLiteTable[],
  manifest: SyncManifest,
  manifestTable: SyncTableManifest
): ReflectedSyncTable {
  const table = findSchemaTable(schemaTables, manifestTable.tableName);
  const reflectedColumns = reflectColumns(table, manifest, manifestTable);
  const reflectedByProperty = columnsByProperty(reflectedColumns);

  validateAliases(manifestTable, reflectedByProperty);
  validateFieldOrder({
    columns: reflectedColumns,
    manifestTable,
    reflectedByProperty,
  });

  return {
    changeMessageName: manifestTable.changeMessageName,
    columns: orderedColumns(
      manifestTable,
      reflectedColumns,
      reflectedByProperty
    ),
    protoFieldName: manifestTable.protoFieldName,
    rowMessageName: manifestTable.rowMessageName,
    rustFieldName: manifestTable.rustFieldName,
    serviceKey: manifestTable.serviceKey,
    tableName: manifestTable.tableName,
    tsProtoFieldName: manifestTable.tsProtoFieldName,
  };
}

export function reflectSyncTables(
  schemaModule: Record<string, unknown>,
  manifest: SyncManifest
): ReflectedSyncTable[] {
  const schemaTables = Object.values(schemaModule).filter(isSQLiteTable);

  return manifest.tables.map((manifestTable) =>
    reflectSyncTable(schemaTables, manifest, manifestTable)
  );
}
