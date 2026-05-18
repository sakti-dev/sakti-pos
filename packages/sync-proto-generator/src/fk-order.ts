import { type AnySQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";

export interface SyncTableOrder {
  deleteOrder: string[];
  upsertOrder: string[];
}

interface ForeignKeyReference {
  columns: Array<{ notNull: boolean }>;
  foreignColumns: Array<{ table: AnySQLiteTable }>;
}

interface TableNode {
  dependencies: Set<string>;
  tableName: string;
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

function getTableName(table: AnySQLiteTable): string {
  return getTableConfig(table).name;
}

function getForeignKeyReferences(table: AnySQLiteTable): ForeignKeyReference[] {
  const config = getTableConfig(table) as {
    foreignKeys?: Array<{ reference: () => ForeignKeyReference }>;
  };

  return config.foreignKeys?.map((foreignKey) => foreignKey.reference()) ?? [];
}

function getReferencedTableName(reference: ForeignKeyReference): string {
  const foreignTable = reference.foreignColumns[0]?.table;
  if (!foreignTable) {
    throw new Error("Foreign key reference is missing target table metadata");
  }

  return getTableName(foreignTable);
}

function buildGraph(input: {
  schemaModule: Record<string, unknown>;
  syncedTableNames: string[];
}): Map<string, TableNode> {
  const syncedTableNameSet = new Set(input.syncedTableNames);
  const nodes = new Map<string, TableNode>();
  const tables = Object.values(input.schemaModule).filter(isSQLiteTable);

  for (const table of tables) {
    const tableName = getTableName(table);
    if (!syncedTableNameSet.has(tableName)) {
      continue;
    }

    nodes.set(tableName, {
      dependencies: new Set<string>(),
      tableName,
    });
  }

  for (const table of tables) {
    const tableName = getTableName(table);
    const node = nodes.get(tableName);
    if (!node) {
      continue;
    }

    for (const reference of getForeignKeyReferences(table)) {
      const referencedTableName = getReferencedTableName(reference);
      if (!syncedTableNameSet.has(referencedTableName)) {
        if (reference.columns.every((column) => !column.notNull)) {
          continue;
        }

        throw new Error(
          `Sync FK order cannot ignore required reference from ${tableName} to external table ${referencedTableName}`
        );
      }

      if (referencedTableName !== tableName) {
        node.dependencies.add(referencedTableName);
      }
    }
  }

  return nodes;
}

function topologicalSort(nodes: Map<string, TableNode>): string[] {
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(tableName: string): void {
    if (visited.has(tableName)) {
      return;
    }

    if (visiting.has(tableName)) {
      throw new Error(`Sync FK order cycle detected at ${tableName}`);
    }

    visiting.add(tableName);
    const node = nodes.get(tableName);
    if (!node) {
      throw new Error(`Missing sync table node for ${tableName}`);
    }

    for (const dependency of node.dependencies) {
      visit(dependency);
    }

    visiting.delete(tableName);
    visited.add(tableName);
    ordered.push(tableName);
  }

  for (const tableName of nodes.keys()) {
    visit(tableName);
  }

  return ordered;
}

export function computeSyncTableOrder(input: {
  schemaModule: Record<string, unknown>;
  syncedTableNames?: string[];
}): SyncTableOrder {
  const allTableNames =
    input.syncedTableNames ??
    Object.values(input.schemaModule)
      .filter(isSQLiteTable)
      .map((table) => getTableName(table));
  const nodes = buildGraph({
    schemaModule: input.schemaModule,
    syncedTableNames: allTableNames,
  });
  const upsertOrder = topologicalSort(nodes);

  return {
    deleteOrder: [...upsertOrder].reverse(),
    upsertOrder,
  };
}
