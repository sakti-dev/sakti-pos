// Generate the frozen Elysia AOT manifest under Node so Headers APIs in the
// captured source match workerd (Bun's Headers differ). The manifest is
// imported first by src/index.ts, letting wrangler dev serve the app without
// runtime eval (workerd bans new Function).
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// elysia doesn't export the AOT capture internals; reach them by path
// (same approach as elysia's own test/cloudflare/gen-node.mjs).
const here = dirname(fileURLToPath(import.meta.url));
const aotCore = await import(
  new URL("../node_modules/elysia/dist/plugin/aot/core.mjs", import.meta.url)
    .href
);
const { generateCompiledArtifacts } = aotCore;
const entry = resolve(here, "../src/app.ts");
const { source } = await generateCompiledArtifacts(entry, {
  registerFrom: "elysia",
});
writeFileSync(resolve(here, "../src/manifest.generated.js"), source);
console.log(`manifest.generated.js: ${source.length} bytes`);
