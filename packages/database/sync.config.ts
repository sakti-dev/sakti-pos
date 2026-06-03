import { defineSyncConfig } from "baresync/generator";
import * as apiSyncedSchema from "./src/api-synced-schema.ts";
import * as localSyncedSchema from "./src/synced-schema.ts";

export const syncGeneratorConfig = defineSyncConfig({
  apiSyncedSchema,
  localSyncedSchema,
  outputDir: "./generated",
  tables: {
    merchants: { scopeColumn: "id" },
    outlets: { scopeColumn: "merchantId" },
    registers: { scopeColumn: "outletId" },
    staff: { scopeColumn: "merchantId" },
    categories: { scopeColumn: "merchantId" },
    assets: { scopeColumn: "merchantId" },
    products: { scopeColumn: "merchantId" },
    outletProducts: { scopeColumn: "outletId" },
    orders: { scopeColumn: "outletId" },
    orderItems: { scopeColumn: "outletId" },
  },
});
