import type { ReflectedSyncTable } from "./drizzle-reflection";
import type { SyncManifest } from "./manifest";

function renderRowMessage(table: ReflectedSyncTable): string {
  const lines = [`message ${table.rowMessageName} {`];
  for (const [index, column] of table.columns.entries()) {
    lines.push(`  ${column.protoType} ${column.protoName} = ${index + 1};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function renderChangesMessage(table: ReflectedSyncTable): string {
  return [
    `message ${table.changeMessageName} {`,
    `  repeated ${table.rowMessageName} created = 1;`,
    `  repeated ${table.rowMessageName} updated = 2;`,
    "  repeated string deleted_ids = 3;",
    "}",
  ].join("\n");
}

function renderPushRequest(manifest: SyncManifest): string {
  const lines = [
    "message SyncPushBatchRequest {",
    "  string outlet_id = 1;",
    "  string idempotency_key = 2;",
  ];
  for (const [index, table] of manifest.tables.entries()) {
    lines.push(
      `  ${table.changeMessageName} ${table.protoFieldName} = ${
        manifest.requestTypedFieldStart + index
      };`
    );
  }
  lines.push("}");
  return lines.join("\n");
}

function renderPullResponse(manifest: SyncManifest): string {
  const lines = ["message SyncPullBatchResponse {"];
  for (const [index, table] of manifest.tables.entries()) {
    lines.push(
      `  ${table.changeMessageName} ${table.protoFieldName} = ${
        manifest.requestTypedFieldStart + index
      };`
    );
  }
  lines.push("  int64 latest_event_id = 100;");
  lines.push("  bool needs_full_resync = 101;");
  lines.push("  string server_time = 102;");
  lines.push("  bool has_more = 103;");
  lines.push("  string next_page_cursor = 104;");
  lines.push("}");
  return lines.join("\n");
}

export function renderSyncProto(
  manifest: SyncManifest,
  tables: ReflectedSyncTable[]
): string {
  return [
    'syntax = "proto3";',
    "",
    `package ${manifest.packageName};`,
    "",
    "message SyncStatusRequest {",
    "  string outlet_id = 1;",
    "  int64 last_server_event_id = 2;",
    "}",
    "",
    "message SyncStatusResponse {",
    "  repeated string changed_tables = 1;",
    "  bool has_changes = 2;",
    "  int64 latest_event_id = 3;",
    "  bool needs_full_resync = 4;",
    "  int64 oldest_available_event_id = 5;",
    "  bool has_oldest_available_event_id = 6;",
    "}",
    "",
    "message SyncRejectedRow {",
    "  string id = 1;",
    "  string reason = 2;",
    "}",
    "",
    "message SyncTableAck {",
    "  string table = 1;",
    "  repeated string accepted_created_ids = 2;",
    "  repeated string accepted_updated_ids = 3;",
    "  repeated string accepted_deleted_ids = 4;",
    "  repeated SyncRejectedRow rejected = 5;",
    "}",
    "",
    ...tables.flatMap((table) => [renderRowMessage(table), ""]),
    ...tables.flatMap((table) => [renderChangesMessage(table), ""]),
    renderPushRequest(manifest),
    "",
    "message SyncPushBatchResponse {",
    "  repeated SyncTableAck tables = 1;",
    "  string server_time = 2;",
    "  int64 latest_event_id = 3;",
    "}",
    "",
    "message SyncPullBatchRequest {",
    "  string outlet_id = 1;",
    "  int64 after_event_id = 2;",
    "  repeated string tables = 3;",
    "  int32 limit = 4;",
    "  string page_cursor = 5;",
    "}",
    "",
    renderPullResponse(manifest),
    "",
  ].join("\n");
}
