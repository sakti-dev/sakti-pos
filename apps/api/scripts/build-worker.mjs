// Bundle the Worker for deploy with Elysia AOT precompiled at build time.
// Mirrors elysia's own Cloudflare test setup (test/cloudflare/build-standalone.mjs):
// workerd conditions, browser platform, node builtins left for nodejs_compat.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aot } from "elysia/plugin/aot/esbuild";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, "../src/app.ts");

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  outfile: resolve(here, "../dist-cf/worker.mjs"),
  conditions: ["workerd", "worker", "browser", "import"],
  platform: "browser",
  target: "esnext",
  external: ["node:*", "cloudflare:workers"],
  minify: true,
  plugins: [aot(entry, { registerFrom: "elysia", target: "workerd" })],
});
console.log("built dist-cf/worker.mjs");
