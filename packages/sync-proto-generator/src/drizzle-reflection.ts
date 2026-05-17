import { type AnySQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import type { SyncManifest } from "./manifest";

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

export function reflectSyncTables(
  schemaModule: Record<string, unknown>,
  manifest: SyncManifest
): ReflectedSyncTable[] {
  const schemaTables = Object.values(schemaModule).filter(isSQLiteTable);

  return manifest.tables.map((manifestTable) => {
    const table = schemaTables.find(
      (schemaTable) =>
        getTableConfig(schemaTable).name === manifestTable.tableName
    );
    if (!table) {
      throw new Error(
        `Missing Drizzle table for sync table ${manifestTable.tableName}`
      );
    }

    const tableConfig = getTableConfig(table);
    const reflectedColumns = tableConfig.columns
      .map((column) => {
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

    const reflectedByProperty = new Map<string, (typeof reflectedColumns)[number]>();
    for (const col of reflectedColumns) {
      reflectedByProperty.set(col.propertyName, col);
    }

    if (manifestTable.fieldAliases) {
      for (const aliasKey of Object.keys(manifestTable.fieldAliases)) {
        if (!reflectedByProperty.has(aliasKey)) {
          throw new Error(
            `Invalid sync manifest for ${manifestTable.tableName}: fieldAlias references missing property ${aliasKey}`
          );
        }
      }
    }

    if (manifestTable.fieldOrder) {
      for (const name of manifestTable.fieldOrder) {
        if (!reflectedByProperty.has(name)) {
          throw new Error(
            `Invalid sync manifest for ${manifestTable.tableName}: fieldOrder references missing property ${name}`
          );
        }
      }

      const fieldOrderSet = new Set(manifestTable.fieldOrder);
      for (const col of reflectedColumns) {
        if (!fieldOrderSet.has(col.propertyName)) {
          throw new Error(
            `Invalid sync manifest for ${manifestTable.tableName}: fieldOrder omits reflected transport column ${col.propertyName}`
          );
        }
      }
    }

    const columns = manifestTable.fieldOrder
      ? manifestTable.fieldOrder.map((name) => {
          const col = reflectedByProperty.get(name);
          if (!col) {
            throw new Error(
              `Invalid sync manifest for ${manifestTable.tableName}: fieldOrder references missing property ${name}`
            );
          }
          return col;
        })
      : reflectedColumns;

    return {
      changeMessageName: manifestTable.changeMessageName,
      columns,
      protoFieldName: manifestTable.protoFieldName,
      rowMessageName: manifestTable.rowMessageName,
      rustFieldName: manifestTable.rustFieldName,
      serviceKey: manifestTable.serviceKey,
      tableName: manifestTable.tableName,
      tsProtoFieldName: manifestTable.tsProtoFieldName,
    };
  });
}
