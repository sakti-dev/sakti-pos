/// <reference types="node" />
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "../../packages/sync-contract/src/local-schema.ts",
    "../../packages/sync-contract/src/local-synced-schema.ts",
  ],
  out: "./src-tauri/migrations",
  dbCredentials: {
    url: process.env.POS_APP_DB_URL ?? "file:./.db-snapshots/latest.sqlite",
  },
});
