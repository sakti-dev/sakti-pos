import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import solidSVG from "vite-plugin-solid-svg";
import { defineConfig } from "vitest/config";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), solid(), solidSVG()],

  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
      "@sync-contract/local-schema": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/local-schema.ts"
      ),
      "@sync-contract/local-synced-schema": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/local-synced-schema.ts"
      ),
      "@sync-contract/api-schema": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/api-schema.ts"
      ),
      "@sync-contract/api-synced-schema": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/src/api-synced-schema.ts"
      ),
      "@sync-contract/generated": path.resolve(
        import.meta.dirname,
        "../../packages/sync-contract/generated"
      ),
    },
    conditions: ["development", "browser"],
  },

  build: {
    minify: "esbuild",
    sourcemap: false,
    target: "esnext",
  },

  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/__test__/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
});
