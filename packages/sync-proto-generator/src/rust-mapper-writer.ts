import type { ReflectedSyncTable } from "./drizzle-reflection";
import type { SyncManifest, SyncTableManifest } from "./manifest";

const ACRONYM_BOUNDARY_PATTERN = /([A-Z]+)([A-Z][a-z])/g;
const LOWER_TO_UPPER_PATTERN = /([a-z0-9])([A-Z])/g;
const NON_IDENTIFIER_PATTERN = /[^a-zA-Z0-9]+/g;
const ROW_SUFFIX_PATTERN = /Row$/;
const LEADING_UNDERSCORE_PATTERN = /^_/;
const SNAKE_TO_CAMEL_PATTERN = /_([a-z])/g;

function snakeToCamel(value: string): string {
  return value.replace(SNAKE_TO_CAMEL_PATTERN, (_, letter: string) =>
    letter.toUpperCase()
  );
}

function toRustSnakeIdentifier(value: string): string {
  return value
    .replace(ROW_SUFFIX_PATTERN, "")
    .replace(ACRONYM_BOUNDARY_PATTERN, "$1_$2")
    .replace(LOWER_TO_UPPER_PATTERN, "$1_$2")
    .replace(NON_IDENTIFIER_PATTERN, "_")
    .toLowerCase()
    .replace(LEADING_UNDERSCORE_PATTERN, "");
}

function rowFromValueFuncName(rowMessageName: string): string {
  return `${toRustSnakeIdentifier(rowMessageName)}_row_from_value`;
}

function rowToValueFuncName(rowMessageName: string): string {
  return `${toRustSnakeIdentifier(rowMessageName)}_row_to_value`;
}

function buildChangesFuncName(rowMessageName: string): string {
  return `build_${toRustSnakeIdentifier(rowMessageName)}_changes`;
}

function renderHelpers(): string {
  return `#[derive(Debug, Clone, Default)]
pub(super) struct TablePushChanges {
    pub created: Vec<Value>,
    pub updated: Vec<Value>,
    pub deleted_ids: Vec<String>,
}

fn value_to_string(row: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(value) = row.get(key) {
            if let Some(string) = value.as_str() {
                return string.to_string();
            }
            if let Some(number) = value.as_i64() {
                return number.to_string();
            }
            if let Some(number) = value.as_u64() {
                return number.to_string();
            }
            if let Some(boolean) = value.as_bool() {
                return boolean.to_string();
            }
        }
    }
    String::new()
}

fn value_to_bool(row: &Value, keys: &[&str]) -> bool {
    for key in keys {
        if let Some(value) = row.get(key) {
            if let Some(boolean) = value.as_bool() {
                return boolean;
            }
            if let Some(number) = value.as_i64() {
                return number != 0;
            }
            if let Some(string) = value.as_str() {
                if let Ok(parsed) = string.parse::<bool>() {
                    return parsed;
                }
                if let Ok(parsed) = string.parse::<i64>() {
                    return parsed != 0;
                }
            }
        }
    }
    false
}

fn value_to_i64(row: &Value, keys: &[&str]) -> i64 {
    for key in keys {
        if let Some(value) = row.get(key) {
            if let Some(number) = value.as_i64() {
                return number;
            }
            if let Some(number) = value.as_u64() {
                return i64::try_from(number).unwrap_or(0);
            }
            if let Some(string) = value.as_str() {
                if let Ok(parsed) = string.parse::<i64>() {
                    return parsed;
                }
            }
        }
    }
    0
}`;
}

function columnKeys(column: {
  propertyName: string;
  protoName: string;
}): string {
  const camelProto = snakeToCamel(column.protoName);
  if (column.protoName.includes("_")) {
    return `&["${camelProto}", "${column.protoName}"]`;
  }
  return `&["${column.propertyName}"]`;
}

function renderRowFromValue(
  table: ReflectedSyncTable,
  _manifestTable: SyncTableManifest
): string {
  const funcName = rowFromValueFuncName(table.rowMessageName);
  const lines = [
    `fn ${funcName}(row: &Value) -> ${table.rowMessageName} {`,
    `    ${table.rowMessageName} {`,
  ];

  for (const column of table.columns) {
    const keys = columnKeys(column);
    let helper = "value_to_string";
    if (column.protoType === "int64") {
      helper = "value_to_i64";
    } else if (column.protoType === "bool") {
      helper = "value_to_bool";
    }
    lines.push(`        ${column.protoName}: ${helper}(row, ${keys}),`);
  }

  lines.push("    }", "}");
  return lines.join("\n");
}

function renderEmptyStringToNull(): string {
  return `fn empty_string_to_null(value: &str) -> Value {
    if value.is_empty() {
        Value::Null
    } else {
        Value::String(value.to_string())
    }
}`;
}

function renderRowToValue(
  table: ReflectedSyncTable,
  _manifestTable: SyncTableManifest
): string {
  const funcName = rowToValueFuncName(table.rowMessageName);
  const lines = [
    `fn ${funcName}(row: &${table.rowMessageName}) -> Value {`,
    "    serde_json::json!({",
  ];

  for (const column of table.columns) {
    const jsonKey = column.propertyName;
    const protoField = column.protoName;
    const needsNullWrap = !column.notNull && column.protoType === "string";

    if (needsNullWrap) {
      lines.push(
        `        "${jsonKey}": empty_string_to_null(&row.${protoField}),`
      );
    } else {
      lines.push(`        "${jsonKey}": row.${protoField},`);
    }
  }

  lines.push("    })", "}");
  return lines.join("\n");
}

function renderTypedRowsToJsonValues(): string {
  return `fn typed_rows_to_json_values<T>(
    created: &[T],
    updated: &[T],
    deleted_ids: &[String],
    server_time: &str,
    mapper: impl Fn(&T) -> Value,
) -> Vec<Value> {
    let mut rows = created.iter().chain(updated.iter()).map(mapper).collect::<Vec<_>>();
    rows.extend(
        deleted_ids
            .iter()
            .map(|id| serde_json::json!({ "id": id, "deletedAt": server_time })),
    );
    rows
}`;
}

function renderBuildChanges(table: ReflectedSyncTable): string {
  const funcName = buildChangesFuncName(table.rowMessageName);
  const rowFunc = rowFromValueFuncName(table.rowMessageName);
  return `pub(super) fn ${funcName}(changes: &TablePushChanges) -> ${table.changeMessageName} {
    ${table.changeMessageName} {
        created: changes.created.iter().map(${rowFunc}).collect::<Vec<_>>(),
        deleted_ids: changes.deleted_ids.clone(),
        updated: changes.updated.iter().map(${rowFunc}).collect::<Vec<_>>(),
    }
}`;
}

function renderBuildPushRequest(manifest: SyncManifest): string {
  const params = ["outlet_id: &str", "idempotency_key: &str"];
  const fields = [
    "outlet_id: outlet_id.to_string()",
    "idempotency_key: idempotency_key.to_string()",
  ];

  for (const table of manifest.tables) {
    const rustField = table.rustFieldName;
    const paramType = table.changeMessageName;
    params.push(`${rustField}: Option<${paramType}>`);
    fields.push(`${rustField}`);
  }

  return [
    "pub(super) fn build_sync_push_batch_request(",
    ...params.map((p) => `    ${p},`),
    ") -> SyncPushBatchRequest {",
    "    SyncPushBatchRequest {",
    ...fields.map((f) => `        ${f},`),
    "    }",
    "}",
  ].join("\n");
}

function renderDecodePullResponse(tables: ReflectedSyncTable[]): string {
  const lines = [
    "pub(super) fn decode_pull_batch_response_tables(",
    "    response: &SyncPullBatchResponse,",
    ") -> Result<std::collections::BTreeMap<String, Value>, String> {",
    "    let mut map = std::collections::BTreeMap::new();",
    "",
  ];

  for (const table of tables) {
    const rustField = table.rustFieldName;
    const rowFunc = rowToValueFuncName(table.rowMessageName);
    lines.push(`    if let Some(changes) = &response.${rustField} {`);
    lines.push("        map.insert(");
    lines.push(`            "${table.serviceKey}".to_string(),`);
    lines.push("            Value::Array(typed_rows_to_json_values(");
    lines.push("                &changes.created,");
    lines.push("                &changes.updated,");
    lines.push("                &changes.deleted_ids,");
    lines.push("                &response.server_time,");
    lines.push(`                ${rowFunc},`);
    lines.push("            )),");
    lines.push("        );");
    lines.push("    }");
    lines.push("");
  }

  lines.push("    Ok(map)", "}");
  return lines.join("\n");
}

function renderResponseHelpers(): string {
  return `pub(super) fn pull_batch_response_has_more(response: &SyncPullBatchResponse) -> bool {
    response.has_more
}

pub(super) fn pull_batch_response_next_cursor(response: &SyncPullBatchResponse) -> String {
    response.next_page_cursor.clone()
}

pub(super) fn pull_batch_response_latest_event_id(response: &SyncPullBatchResponse) -> i64 {
    response.latest_event_id
}

pub(super) fn pull_batch_response_server_time(response: &SyncPullBatchResponse) -> String {
    response.server_time.clone()
}

pub(super) fn pull_batch_response_needs_full_resync(response: &SyncPullBatchResponse) -> bool {
    response.needs_full_resync
}`;
}

export function renderRustSyncMappers(
  manifest: SyncManifest,
  tables: ReflectedSyncTable[]
): string {
  const manifestMap = new Map<string, SyncTableManifest>();
  for (const t of manifest.tables) {
    manifestMap.set(t.tableName, t);
  }

  const imports = [
    ...new Set([
      ...tables.map((t) => t.changeMessageName),
      ...tables.map((t) => t.rowMessageName),
      "SyncPushBatchRequest",
      "SyncPullBatchResponse",
    ]),
  ].sort();

  const parts: string[] = [
    "// AUTO-GENERATED FILE. DO NOT EDIT.",
    "// Generated by @repo/sync-proto-generator.",
    "",
    "use serde_json::Value;",
    "use std::convert::TryFrom;",
    "",
    "use super::sync_proto::{",
    ...imports.map((name) => `    ${name},`),
    "};",
    "",
    renderHelpers(),
    "",
  ];

  for (const table of tables) {
    const manifestTable = manifestMap.get(table.tableName);
    if (!manifestTable) {
      throw new Error(`No manifest entry for table ${table.tableName}`);
    }
    parts.push(renderRowFromValue(table, manifestTable));
    parts.push("");
  }

  parts.push(renderEmptyStringToNull());
  parts.push("");

  for (const table of tables) {
    const manifestTable = manifestMap.get(table.tableName);
    if (!manifestTable) {
      throw new Error(`No manifest entry for table ${table.tableName}`);
    }
    parts.push(renderRowToValue(table, manifestTable));
    parts.push("");
  }

  parts.push(renderTypedRowsToJsonValues());
  parts.push("");

  for (const table of tables) {
    parts.push(renderBuildChanges(table));
    parts.push("");
  }

  parts.push(renderBuildPushRequest(manifest));
  parts.push("");

  parts.push(renderDecodePullResponse(tables));
  parts.push("");

  parts.push(renderResponseHelpers());
  parts.push("");

  return parts.join("\n");
}
