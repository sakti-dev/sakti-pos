import { type AnySQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";

export interface SchemaDriftIssue {
  code:
    | "missing_api_table"
    | "missing_local_table"
    | "missing_api_column"
    | "missing_local_column"
    | "type_mismatch"
    | "nullability_mismatch"
    | "primary_key_mismatch"
    | "property_name_mismatch";
  columnName?: string;
  message: string;
  tableName: string;
}

export interface CompareSyncedSchemasInput {
  apiTables: AnySQLiteTable[];
  localOnlyColumns?: string[];
  localTables: AnySQLiteTable[];
  serverOnlyColumns?: string[];
}

type SyncScalarType = "bool" | "int64" | "string";

interface TableColumnInfo {
  columnName: string;
  notNull: boolean;
  primary: boolean;
  propertyName: string;
  type: SyncScalarType;
}

interface TableColumnMap {
  columnsByColumnName: Map<string, TableColumnInfo>;
  columnsByPropertyName: Map<string, TableColumnInfo>;
}

function resolvePropertyName(table: AnySQLiteTable, column: unknown): string {
  for (const [propertyName, candidate] of Object.entries(
    table as unknown as Record<string, unknown>
  )) {
    if (candidate === column) {
      return propertyName;
    }
  }

  throw new Error("Unable to resolve Drizzle column property name");
}

function inferSyncScalarType(column: unknown): SyncScalarType {
  const columnConfig = column as {
    dataType?: string;
    mode?: string;
  };

  if (columnConfig.dataType === "boolean" || columnConfig.mode === "boolean") {
    return "bool";
  }

  if (
    columnConfig.dataType === "number" ||
    columnConfig.dataType === "bigint"
  ) {
    return "int64";
  }

  return "string";
}

function reflectColumns(
  table: AnySQLiteTable,
  excludedColumns: ReadonlySet<string>
): TableColumnMap {
  const columnsByColumnName = new Map<string, TableColumnInfo>();
  const columnsByPropertyName = new Map<string, TableColumnInfo>();

  for (const column of getTableConfig(table).columns) {
    const propertyName = resolvePropertyName(table, column);
    if (excludedColumns.has(propertyName)) {
      continue;
    }

    const reflectedColumn: TableColumnInfo = {
      columnName: column.name,
      notNull: column.notNull || column.primary,
      primary: column.primary,
      propertyName,
      type: inferSyncScalarType(column),
    };
    columnsByColumnName.set(reflectedColumn.columnName, reflectedColumn);
    columnsByPropertyName.set(reflectedColumn.propertyName, reflectedColumn);
  }

  return { columnsByColumnName, columnsByPropertyName };
}

function compareColumns(input: {
  apiColumn: TableColumnInfo | undefined;
  localColumn: TableColumnInfo | undefined;
  tableName: string;
}): SchemaDriftIssue[] {
  const { apiColumn, localColumn, tableName } = input;

  if (!(apiColumn || localColumn)) {
    return [];
  }

  if (!apiColumn && localColumn) {
    return [
      {
        columnName: localColumn.columnName,
        code: "missing_api_column",
        message: `Local column ${localColumn.columnName} is missing from API table ${tableName}`,
        tableName,
      },
    ];
  }

  if (apiColumn && !localColumn) {
    return [
      {
        columnName: apiColumn.columnName,
        code: "missing_local_column",
        message: `API column ${apiColumn.columnName} is missing from local table ${tableName}`,
        tableName,
      },
    ];
  }

  if (!(apiColumn && localColumn)) {
    return [];
  }

  const issues: SchemaDriftIssue[] = [];
  if (apiColumn.columnName !== localColumn.columnName) {
    issues.push(
      {
        columnName: apiColumn.columnName,
        code: "missing_local_column",
        message: `Local table ${tableName} is missing SQLite column ${apiColumn.columnName} from API`,
        tableName,
      },
      {
        columnName: localColumn.columnName,
        code: "missing_api_column",
        message: `API table ${tableName} is missing SQLite column ${localColumn.columnName} from local`,
        tableName,
      }
    );
    return issues;
  }

  if (apiColumn.type !== localColumn.type) {
    issues.push({
      columnName: apiColumn.columnName,
      code: "type_mismatch",
      message: `SQLite column ${tableName}.${apiColumn.columnName} has type ${localColumn.type} locally but ${apiColumn.type} in API`,
      tableName,
    });
  }

  if (apiColumn.propertyName !== localColumn.propertyName) {
    issues.push({
      columnName: apiColumn.columnName,
      code: "property_name_mismatch",
      message: `SQLite column ${tableName}.${apiColumn.columnName} has Drizzle property ${localColumn.propertyName} locally but ${apiColumn.propertyName} in API`,
      tableName,
    });
  }

  if (apiColumn.notNull !== localColumn.notNull) {
    issues.push({
      columnName: apiColumn.columnName,
      code: "nullability_mismatch",
      message: `SQLite column ${tableName}.${apiColumn.columnName} has nullability ${localColumn.notNull} locally but ${apiColumn.notNull} in API`,
      tableName,
    });
  }

  if (apiColumn.primary !== localColumn.primary) {
    issues.push({
      columnName: apiColumn.columnName,
      code: "primary_key_mismatch",
      message: `SQLite column ${tableName}.${apiColumn.columnName} has primary key ${localColumn.primary} locally but ${apiColumn.primary} in API`,
      tableName,
    });
  }

  return issues;
}

function compareTableColumns(input: {
  apiTable: AnySQLiteTable;
  localOnlyColumns: ReadonlySet<string>;
  localTable: AnySQLiteTable;
  serverOnlyColumns: ReadonlySet<string>;
}): SchemaDriftIssue[] {
  const { apiTable, localOnlyColumns, localTable, serverOnlyColumns } = input;
  const tableName = getTableConfig(apiTable).name;
  const apiColumns = reflectColumns(
    apiTable,
    new Set([...localOnlyColumns, ...serverOnlyColumns])
  );
  const localColumns = reflectColumns(localTable, localOnlyColumns);
  const issues: SchemaDriftIssue[] = [];

  for (const [columnName, apiColumn] of apiColumns.columnsByColumnName) {
    const localColumn = localColumns.columnsByColumnName.get(columnName);
    issues.push(...compareColumns({ apiColumn, localColumn, tableName }));
  }

  for (const [columnName, localColumn] of localColumns.columnsByColumnName) {
    if (!apiColumns.columnsByColumnName.has(columnName)) {
      issues.push(
        ...compareColumns({ apiColumn: undefined, localColumn, tableName })
      );
    }
  }

  return issues;
}

function compareTablePair(input: {
  apiTable: AnySQLiteTable | undefined;
  localOnlyColumns: ReadonlySet<string>;
  localTable: AnySQLiteTable | undefined;
  serverOnlyColumns: ReadonlySet<string>;
  tableName: string;
}): SchemaDriftIssue[] {
  const {
    apiTable,
    localOnlyColumns,
    localTable,
    serverOnlyColumns,
    tableName,
  } = input;

  if (!(apiTable || localTable)) {
    return [];
  }

  if (!apiTable) {
    return [
      {
        code: "missing_api_table",
        message: `Local table ${tableName} is missing from API schema`,
        tableName,
      },
    ];
  }

  if (!localTable) {
    return [
      {
        code: "missing_local_table",
        message: `API table ${tableName} is missing from local schema`,
        tableName,
      },
    ];
  }

  return compareTableColumns({
    apiTable,
    localOnlyColumns,
    localTable,
    serverOnlyColumns,
  });
}

export function compareSyncedSchemas(
  input: CompareSyncedSchemasInput
): SchemaDriftIssue[] {
  const localOnlyColumns = new Set(input.localOnlyColumns ?? []);
  const serverOnlyColumns = new Set(input.serverOnlyColumns ?? []);
  const apiTables = new Map<string, AnySQLiteTable>();
  const localTables = new Map<string, AnySQLiteTable>();

  for (const table of input.apiTables) {
    apiTables.set(getTableConfig(table).name, table);
  }

  for (const table of input.localTables) {
    localTables.set(getTableConfig(table).name, table);
  }

  const tableNames = new Set<string>([
    ...apiTables.keys(),
    ...localTables.keys(),
  ]);
  const issues: SchemaDriftIssue[] = [];

  for (const tableName of tableNames) {
    issues.push(
      ...compareTablePair({
        apiTable: apiTables.get(tableName),
        localOnlyColumns,
        localTable: localTables.get(tableName),
        serverOnlyColumns,
        tableName,
      })
    );
  }

  return issues;
}
