import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import solidSVG from "vite-plugin-solid-svg";

export default defineConfig({
  plugins: [tailwindcss(), solid(), solidSVG()],
  resolve: {
    alias: { "~": path.resolve(import.meta.dirname, "./src") },
  },
});
