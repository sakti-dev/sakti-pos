# Turborepo Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the sakti-pos project into a proper turborepo monorepo with shared packages and room for a future Cloudflare Worker backend.

**Architecture:** Move `pos-app/` into `apps/pos-app/`, remove unused turborepo scaffolds, extract shared DB schema into `packages/database/`, consolidate tooling (biome, husky, lint-staged) at root level, and prepare `apps/api/` scaffold for the future Cloudflare Worker.

**Tech Stack:** Turborepo, Bun workspaces, Biome (via Ultracite), TypeScript, SolidJS, Tauri, Drizzle ORM

---

## Target Structure

```
sakti-pos/
├── apps/
│   └── pos-app/              # Tauri + SolidJS Android POS (moved from ./pos-app)
│       ├── src/
│       │   ├── db/
│       │   │   ├── index.ts        # Tauri-specific DB connection (sqlite-proxy)
│       │   │   ├── menu.ts         # Menu queries (imports schema from @repo/database)
│       │   │   ├── orders.ts       # Order queries
│       │   │   └── users.ts        # User queries
│       │   ├── ...
│       ├── src-tauri/              # Rust backend
│       ├── biome.jsonc             # App-specific biome overrides (extends root)
│       ├── drizzle.config.ts       # Points to packages/database schema
│       ├── ...
│   └── api/                        # Cloudflare Worker backend (scaffold only)
├── packages/
│   ├── database/                   # Shared Drizzle schema + types
│   │   ├── src/
│   │   │   ├── schema.ts           # Moved from pos-app/src/db/schema.ts
│   │   │   └── index.ts            # Re-exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── typescript-config/          # Shared TS configs (keep, customize)
│       ├── base.json
│       ├── solid.json              # New: SolidJS + Vite base (for pos-app)
│       └── package.json
├── docs/                           # Project-wide docs (moved from pos-app/docs)
│   ├── MILESTONES.md
│   ├── PRD.md
│   ├── RULES.md
│   ├── plans/
│   └── external/                   # gitignored
├── .husky/                         # Root-level husky
├── biome.jsonc                     # Root biome config (moved from pos-app)
├── turbo.json                      # Updated for our apps
├── package.json                    # Root workspace config
├── .gitignore                      # Updated root gitignore
└── bun.lock
```

---

### Task 1: Remove Unused Turborepo Scaffolds

**Files:**
- Delete: `apps/docs/` (Next.js docs app — not ours)
- Delete: `apps/web/` (Next.js web app — not ours)
- Delete: `packages/eslint-config/` (we use biome, not eslint)
- Delete: `packages/ui/` (React-based — we use SolidJS)

**Step 1: Remove the four unused directories**

```bash
rm -rf apps/docs apps/web packages/eslint-config packages/ui
```

**Step 2: Verify**

```bash
ls apps/ packages/
```

Expected: `apps/` is empty, `packages/` contains only `typescript-config/`

**Step 3: Commit**

```bash
git add -A
git commit -m "🔥 chore: remove unused turborepo scaffold apps and packages"
```

---

### Task 2: Move pos-app into apps/

**Files:**
- Move: `pos-app/` → `apps/pos-app/`

**Step 1: Move the directory**

```bash
mv pos-app apps/pos-app
```

**Step 2: Verify**

```bash
ls apps/pos-app/src/ apps/pos-app/src-tauri/
```

Expected: Both directories exist with all files intact.

**Step 3: Commit**

```bash
git add -A
git commit -m "🚚 chore: move pos-app into apps/pos-app for monorepo structure"
```

---

### Task 3: Update Root package.json

**Files:**
- Modify: `package.json`

**Step 1: Update root package.json**

Replace the entire content:

```json
{
  "name": "sakti-pos",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "check-types": "turbo run check-types",
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^16.4.0",
    "turbo": "^2.9.8",
    "typescript": "5.9.2",
    "ultracite": "7.6.2",
    "@biomejs/biome": "2.4.12"
  },
  "lint-staged": {
    "*.{js,jsx,ts,tsx,json,jsonc,css,scss,md,mdx}": [
      "bun x ultracite fix"
    ]
  },
  "engines": {
    "node": ">=18"
  },
  "packageManager": "bun@1.3.13",
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

Key changes:
- Remove `prettier` (we use biome/ultracite)
- Remove `format` script
- Move `husky` + `lint-staged` + `ultracite` + `@biomejs/biome` here from pos-app
- Add `prepare` script for husky

**Step 2: Commit**

```bash
git add package.json
git commit -m "🔧 chore: update root package.json for monorepo tooling"
```

---

### Task 4: Move biome.jsonc to Root

**Files:**
- Move: `apps/pos-app/biome.jsonc` → `biome.jsonc` (root)

**Step 1: Move biome config to root**

```bash
mv apps/pos-app/biome.jsonc biome.jsonc
```

**Step 2: Update paths in biome.jsonc**

The `files.includes` array needs path updates since it's now at root level. Update to scan all workspace packages:

```jsonc
{
  "extends": ["ultracite/biome/core", "ultracite/biome/solid"],
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "files": {
    "includes": [
      "apps/pos-app/src/**",
      "apps/pos-app/vite.config.ts",
      "apps/pos-app/drizzle.config.ts",
      "packages/database/src/**",
      "*.json",
      "*.jsonc",
      "!!**/tauri-drizzle-proxy",
      "!!**/dist",
      "!!**/src-tauri/target",
      "!!**/node_modules",
      "!!**/drizzle/meta",
      "!!docs/external"
    ]
  },
  "linter": {
    "rules": {
      "style": {
        "noExportedImports": "off",
        "noNonNullAssertion": "off",
        "useFilenamingConvention": "off"
      },
      "suspicious": {
        "noEmptyBlockStatements": "off",
        "noUnknownAtRules": "off"
      },
      "performance": {
        "noNamespaceImport": "warn"
      }
    }
  }
}
```

**Step 3: Remove biome devDependencies from pos-app/package.json**

Remove `"@biomejs/biome": "2.4.12"` and `"ultracite": "7.6.2"` from `apps/pos-app/package.json` devDependencies (they're now at root).

**Step 4: Commit**

```bash
git add -A
git commit -m "🔧 chore: move biome config to monorepo root"
```

---

### Task 5: Move Husky to Root

**Files:**
- Move: `apps/pos-app/.husky/` → `.husky/` (root)

**Step 1: Move husky directory**

```bash
mv apps/pos-app/.husky .husky
```

**Step 2: Remove husky/lint-staged from pos-app/package.json**

Remove these devDependencies and the `lint-staged` and `prepare` entries from `apps/pos-app/package.json`:
- Remove `"husky": "^9.1.7"`
- Remove `"lint-staged": "^16.4.0"`
- Remove `"prepare": "husky"` from scripts
- Remove the entire `lint-staged` block

**Step 3: Commit**

```bash
git add -A
git commit -m "🔧 chore: move husky and lint-staged to monorepo root"
```

---

### Task 6: Create packages/database

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/src/schema.ts` (moved from `apps/pos-app/src/db/schema.ts`)
- Create: `packages/database/src/index.ts`
- Modify: `apps/pos-app/src/db/` query files to import from `@repo/database`

**Step 1: Create package directory**

```bash
mkdir -p packages/database/src
```

**Step 2: Create packages/database/package.json**

```json
{
  "name": "@repo/database",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "@repo/typescript-config": "*",
    "typescript": "5.9.2"
  }
}
```

**Step 3: Create packages/database/tsconfig.json**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  },
  "include": ["src"]
}
```

Note: `jsxImportSource: "solid-js"` is harmless for a non-JSX package. We could also omit the JSX settings since this package only has `.ts` files.

**Step 4: Create packages/database/src/schema.ts**

Copy the content of `apps/pos-app/src/db/schema.ts` verbatim. The file only imports from `drizzle-orm/sqlite-core` so it's fully portable.

**Step 5: Create packages/database/src/index.ts**

```typescript
export * from "./schema";
```

**Step 6: Update apps/pos-app/src/db/ files to import from @repo/database**

In every file under `apps/pos-app/src/db/` that imports from `./schema`, change to:

```typescript
import { users, categories, products, orders, orderItems } from "@repo/database";
// or whatever specific tables are needed
```

Files to update:
- `apps/pos-app/src/db/index.ts` — change `import * as schema from "./schema"` → `import * as schema from "@repo/database"`
- `apps/pos-app/src/db/menu.ts` — change schema imports
- `apps/pos-app/src/db/orders.ts` — change schema imports
- `apps/pos-app/src/db/users.ts` — change schema imports

**Step 7: Delete apps/pos-app/src/db/schema.ts**

```bash
rm apps/pos-app/src/db/schema.ts
```

**Step 8: Add @repo/database to pos-app dependencies**

In `apps/pos-app/package.json`, add to dependencies:

```json
"@repo/database": "*"
```

**Step 9: Commit**

```bash
git add -A
git commit -m "📦️ chore: extract DB schema into @repo/database shared package"
```

---

### Task 7: Update TypeScript Config Package

**Files:**
- Modify: `packages/typescript-config/base.json`
- Create: `packages/typescript-config/solid.json`
- Modify: `apps/pos-app/tsconfig.json`

**Step 1: Update packages/typescript-config/base.json**

Keep the existing base but adjust for our needs:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "esModuleInterop": true,
    "isolatedModules": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2020"
  }
}
```

**Step 2: Create packages/typescript-config/solid.json**

For SolidJS + Vite apps:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Step 3: Update apps/pos-app/tsconfig.json to extend from @repo/typescript-config**

```json
{
  "extends": "@repo/typescript-config/solid.json",
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"],
      "@repo/database": ["../../packages/database/src/index.ts"]
    }
  },
  "include": ["src"],
  "exclude": ["docs/external"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Delete packages/typescript-config/nextjs.json and react-library.json** (unused)

```bash
rm packages/typescript-config/nextjs.json packages/typescript-config/react-library.json
```

**Step 5: Commit**

```bash
git add -A
git commit -m "🏷️ chore: add SolidJS tsconfig preset, clean up unused configs"
```

---

### Task 8: Update turbo.json

**Files:**
- Modify: `turbo.json`

**Step 1: Replace turbo.json**

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "filter": ["./apps/*"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "check-types": {
      "dependsOn": ["^build"]
    }
  }
}
```

Key changes:
- `lint` depends on `^build` (not `^lint`) to ensure workspace packages build first
- `dev` scoped to `apps/*` only (packages don't have dev servers)
- Removed `inputs` from build (we don't have `.env*` patterns that matter)

**Step 2: Commit**

```bash
git add turbo.json
git commit -m "🔧 chore: update turbo.json for POS monorepo task pipeline"
```

---

### Task 9: Update pos-app package.json

**Files:**
- Modify: `apps/pos-app/package.json`

**Step 1: Update the package.json**

Key changes needed:
- Rename package to `@repo/pos-app`
- Remove devDependencies now at root: `@biomejs/biome`, `ultracite`, `husky`, `lint-staged`
- Remove `lint-staged` block and `prepare` script
- Add `"@repo/database": "*"` to dependencies
- Keep scripts that are pos-app-specific: `start`, `tauri`, `check`, `fix`
- Update `dev` and `build` scripts to work in turbo context

```json
{
  "name": "@repo/pos-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "vite preview",
    "tauri": "tauri",
    "lint": "ultracite check",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@corvu/drawer": "^0.2.4",
    "@fontsource-variable/bricolage-grotesque": "^5.2.10",
    "@fontsource-variable/inter": "^5.2.8",
    "@kobalte/core": "^0.13.11",
    "@repo/database": "*",
    "@solid-primitives/presence": "^0.1.3",
    "@solidjs/router": "^0.16.1",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "@tauri-apps/plugin-sql": "^2.4.0",
    "bcryptjs": "^3.0.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.45.2",
    "solid-icons": "^1.2.0",
    "solid-js": "^1.9.3",
    "tailwind-merge": "^3.5.0",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/bcryptjs": "^3.0.0",
    "@types/node": "^25.6.0",
    "@repo/typescript-config": "*",
    "autoprefixer": "^10.5.0",
    "drizzle-kit": "^0.31.10",
    "postcss": "^8.5.12",
    "tailwindcss": "3",
    "typescript": "5.9.2",
    "vite": "^6.0.3",
    "vite-plugin-solid": "^2.11.0"
  }
}
```

**Step 2: Commit**

```bash
git add apps/pos-app/package.json
git commit -m "🔧 chore: rename pos-app to @repo/pos-app and clean up deps"
```

---

### Task 10: Move docs to Root

**Files:**
- Move: `apps/pos-app/docs/` → `docs/` (root level)

**Step 1: Move docs directory**

```bash
mv apps/pos-app/docs docs
```

**Step 2: Update any doc-internal references**

Check if any docs reference relative paths that need updating (e.g., `../../src/...` → `../apps/pos-app/src/...`). Update if needed.

**Step 3: Update .gitignore for docs/external**

Ensure `docs/external` is in the root `.gitignore`.

**Step 4: Commit**

```bash
git add -A
git commit -m "🚚 chore: move project docs to monorepo root"
```

---

### Task 11: Update Root .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Update .gitignore for monorepo**

```gitignore
# Dependencies
node_modules
.pnp
.pnp.js

# Local env files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Testing
coverage

# Turbo
.turbo

# Build Outputs
dist
.next/
out/
build

# Tauri
src-tauri/target/
*.apk*
*.apk.idsig

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Misc
.DS_Store
*.pem
.direnv
log.txt

# External docs (reference material, not tracked)
docs/external/
```

**Step 2: Delete apps/pos-app/.gitignore**

The pos-app no longer needs its own gitignore — everything is handled at root.

```bash
rm apps/pos-app/.gitignore
```

**Step 3: Commit**

```bash
git add -A
git commit -m "🙈 chore: update root .gitignore for monorepo"
```

---

### Task 12: Move Helper Scripts (Optional Cleanup)

**Files:**
- Keep in place: `apps/pos-app/dev`, `apps/pos-app/build-apk`, `apps/pos-app/resize`, `apps/pos-app/restart`

These scripts contain distrobox/waydroid/ADB-specific commands that are tightly coupled to the pos-app. They should stay in `apps/pos-app/`. No action needed — just verify they still work.

**Step 1: Verify scripts reference correct paths**

The `build-apk` script references `src-tauri/` — since it runs from `apps/pos-app/`, the relative paths are still correct. No changes needed.

---

### Task 13: Update drizzle.config.ts

**Files:**
- Modify: `apps/pos-app/drizzle.config.ts`

**Step 1: Update schema path to point to shared package**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../../packages/database/src/schema.ts",
  out: "./drizzle",
});
```

**Step 2: Commit**

```bash
git add apps/pos-app/drizzle.config.ts
git commit -m "🔧 chore: update drizzle config to use shared schema package"
```

---

### Task 14: Install Dependencies and Verify

**Step 1: Remove old lockfiles and node_modules**

```bash
rm -rf apps/pos-app/bun.lock apps/pos-app/node_modules bun.lock node_modules
```

**Step 2: Install from root**

```bash
bun install
```

This will:
- Resolve all workspace dependencies
- Create a single root `bun.lock`
- Hoist shared dependencies
- Link `@repo/database` and `@repo/typescript-config`

**Step 3: Verify workspace links**

```bash
bun run --filter '@repo/pos-app' tauri --version
```

Or check that TypeScript resolves workspace packages:

```bash
bun run --filter '@repo/pos-app' check-types
```

**Step 4: Verify lint works**

```bash
bun run lint
```

**Step 5: Fix any issues**

If TypeScript can't resolve `@repo/database`, check that the `exports` field in `packages/database/package.json` and the `paths` in `apps/pos-app/tsconfig.json` are correct.

If biome can't find files, check `includes` paths in root `biome.jsonc`.

**Step 6: Commit**

```bash
git add -A
git commit -m "🔧 chore: regenerate lockfile for monorepo workspace"
```

---

### Task 15: Create apps/api Scaffold (Future Cloudflare Worker)

**Files:**
- Create: `apps/api/` directory with minimal scaffold

This task creates an empty scaffold — no actual implementation. Just enough to verify the workspace wiring.

**Step 1: Create directory**

```bash
mkdir -p apps/api/src
```

**Step 2: Create apps/api/package.json**

```json
{
  "name": "@repo/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run",
    "lint": "biome check src/",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/database": "*"
  },
  "devDependencies": {
    "@repo/typescript-config": "*",
    "typescript": "5.9.2",
    "wrangler": "^4"
  }
}
```

**Step 3: Create apps/api/tsconfig.json**

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src"]
}
```

**Step 4: Create apps/api/src/index.ts (placeholder)**

```typescript
export default {
  fetch() {
    return new Response("Sakti POS API — not yet implemented");
  },
};
```

**Step 5: Create apps/api/wrangler.toml**

```toml
name = "sakti-pos-api"
main = "src/index.ts"
compatibility_date = "2026-05-04"
```

**Step 6: Commit**

```bash
git add -A
git commit -m "🌱 chore: scaffold apps/api for future Cloudflare Worker backend"
```

---

### Task 16: Final Verification

**Step 1: Run full install**

```bash
bun install
```

**Step 2: Run lint across all packages**

```bash
bun run lint
```

**Step 3: Run type checking across all packages**

```bash
bun run check-types
```

**Step 4: Verify pos-app still builds frontend**

```bash
bun run --filter '@repo/pos-app' build
```

**Step 5: Verify the dev script still works (manual)**

```bash
cd apps/pos-app && ./dev
```

This requires distrobox/waydroid so it's a manual check. The key thing is that `bun tauri android dev` still finds the vite dev server.

**Step 6: Update AGENTS.md / CLAUDE.md**

Move the project context file from `apps/pos-app/AGENTS.md` to root `AGENTS.md` (or keep in pos-app if it's pos-app-specific). Update paths to reflect new structure.

---

## Summary of Shared Packages

| Package | Purpose | Used By |
|---------|---------|---------|
| `@repo/database` | Drizzle ORM schema + types | `pos-app`, `api` (future) |
| `@repo/typescript-config` | Shared TS configs | All packages |

## What NOT to Share

- **UI components** — pos-app uses SolidJS; api has no UI. No shared UI package needed.
- **Drizzle DB connection** — pos-app uses sqlite-proxy (Tauri IPC), api will use D1. Only the schema is shared.
- **Tailwind/Vite config** — pos-app-specific, stays in `apps/pos-app/`.
- **Tauri/Rust code** — pos-app-specific, stays in `apps/pos-app/src-tauri/`.

## Notes

- Bun workspaces handles the `workspaces` field in root `package.json` — no lerna/nx needed
- `bun install` at root creates a single `bun.lock` — delete `apps/pos-app/bun.lock`
- Husky at root means pre-commit hooks run for all changes across the monorepo
- The `@repo/` scope is a convention for private workspace packages (not published to npm)
- Drizzle Kit's `schema` path in `drizzle.config.ts` must be relative to that config file's location
- The `apps/api/` scaffold does NOT install `wrangler` yet — that happens when actual development begins. Adding it to `package.json` now is fine but `bun install` will download it
