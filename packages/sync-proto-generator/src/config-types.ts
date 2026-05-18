export interface SyncGeneratorConfig {
  changedRowsFieldName: string;
  changeMessageSuffix: string;
  deletedIdsFieldName: string;
  localOnlyColumns: readonly string[];
  packageName: string;
  primaryKeyColumn: string;
  requestTypedFieldStart: number;
  rowMessageSuffix: string;
  serverOnlyColumns: readonly string[];
}

export interface SyncProtoOutputs {
  apiPushAdapters: string;
  apiSyncMappers: string;
  proto: string;
  rustSyncMappers: string;
  syncTs: string;
}
