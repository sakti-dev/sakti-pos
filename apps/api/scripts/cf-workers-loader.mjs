// Node loader shim for Elysia AOT tooling:
// 1. resolve "cloudflare:workers" to a stub (the AOT capture dry-runs the app
//    under Node, where the workerd-provided module doesn't exist; env reads in
//    app code are null-guarded, so an empty env is safe)
// 2. append TS-style extensions for extensionless relative imports, matching
//    the bundler resolution the codebase is written for
const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];
// tsconfig paths that bundlers/tsc honor but plain Node does not
const TSCONFIG_PATHS = {
  "@sync-contract/api-schema": new URL(
    "../../../packages/sync-contract/src/api-schema.ts",
    import.meta.url
  ),
};

export async function resolve(specifier, context, next) {
  const tsconfigPath = TSCONFIG_PATHS[specifier];
  if (tsconfigPath) {
    return {
      url: tsconfigPath.href,
      shortCircuit: true,
    };
  }
  if (specifier === "cloudflare:workers") {
    return {
      url: "data:text/javascript,export const env = {}",
      shortCircuit: true,
    };
  }
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative) {
    const candidates = [
      ...TS_EXTENSIONS.map((ext) => specifier + ext),
      ...TS_EXTENSIONS.map((ext) => `${specifier}/index${ext}`),
    ];
    for (const candidate of candidates) {
      try {
        return await next(candidate, context);
      } catch {
        // try the next candidate
      }
    }
  }
  try {
    return await next(specifier, context);
  } catch {
    // extensionless package subpaths (e.g. @sync-contract/generated/...)
    for (const ext of TS_EXTENSIONS) {
      try {
        return await next(specifier + ext, context);
      } catch {
        // try the next extension
      }
    }
    throw new Error(`[cf-workers-loader] cannot resolve: ${specifier}`);
  }
}
