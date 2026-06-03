import path from "node:path";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
      "@sync-contract/local-synced-schema": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/local-synced-schema.ts"
      ),
      "@sync-contract/constants": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/sync-constants.ts"
      ),
      "@sync-contract/api-schema": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/api-schema.ts"
      ),
      "@sync-contract/local-schema": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/local-schema.ts"
      ),
      "@sync-contract/api-synced-schema": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/api-synced-schema.ts"
      ),
    },
    conditions: ["development", "browser"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test.setup.ts"],
    include: ["src/**/__test__/*.{test,test}.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/__test__/**", "src/vite-env.d.ts"],
    },
  },
});
