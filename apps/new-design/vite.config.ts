import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";
import solidSVG from "vite-plugin-solid-svg";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), solid(), solidSVG()],
  resolve: {
    alias: { "~": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/__test__/**/*.{test,spec}.{ts,tsx}"],
  },
});
