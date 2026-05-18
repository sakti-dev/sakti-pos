/** biome-ignore-all lint/performance/noNamespaceImport: Config intentionally groups synced schema exports. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  SyncGeneratorConfig,
  SyncProtoOutputs,
} from "@repo/sync-proto-generator";
import * as apiSyncedSchema from "../database/src/api-synced-schema";
import * as localSyncedSchema from "../database/src/synced-schema";

const packageRoot = dirname(fileURLToPath(import.meta.url));

export const syncGeneratorConfig = {
  changedRowsFieldName: "changed_rows",
  changeMessageSuffix: "_changes",
  deletedIdsFieldName: "deleted_ids",
  localOnlyColumns: ["isSynced"],
  packageName: "sakti.sync.v1",
  primaryKeyColumn: "id",
  requestTypedFieldStart: 10,
  rowMessageSuffix: "_row",
  serverOnlyColumns: ["syncUpdatedAt"],
} satisfies SyncGeneratorConfig;

export const syncProtoSchemas = {
  apiSyncedSchema,
  localSyncedSchema,
} as const;

export const syncProtoOutputs: SyncProtoOutputs = {
  apiPushAdapters: join(
    packageRoot,
    "..",
    "..",
    "apps",
    "api",
    "src",
    "sync",
    "push-adapters.generated.ts"
  ),
  apiSyncMappers: join(
    packageRoot,
    "..",
    "..",
    "apps",
    "api",
    "src",
    "sync",
    "protobuf.generated.ts"
  ),
  proto: join(packageRoot, "proto", "sync.proto"),
  syncTs: join(packageRoot, "src", "sync.ts"),
  rustSyncMappers: join(
    packageRoot,
    "..",
    "..",
    "apps",
    "pos-app",
    "src-tauri",
    "src",
    "sync",
    "protobuf_generated.rs"
  ),
};
