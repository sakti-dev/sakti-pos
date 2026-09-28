// Registers the loader hooks (cf-workers-loader.mjs) for AOT tooling runs:
//   node --import ./scripts/cf-workers-shim.mjs scripts/gen-manifest.mjs
import { register } from "node:module";

register(new URL("./cf-workers-loader.mjs", import.meta.url));
