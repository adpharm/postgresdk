#!/usr/bin/env bun
/**
 * Tests the package's PUBLIC type surface — what a consumer actually gets from
 * `import ... from "postgresdk"`.
 *
 * The docs tell users to annotate their config with `satisfies Config`, but the
 * repo's own `example.config.ts` imports from "./src/types", so nothing here
 * exercised the published entry point. `Config` was declared-but-not-exported
 * from dist/index.d.ts for several releases (TS2459) and no test caught it.
 *
 * This test:
 * 1. Builds the .d.ts files the same way `bun run build` does
 * 2. Links the package into a throwaway consumer project (node_modules symlink)
 * 3. Type checks a config file written exactly as the docs prescribe
 * 4. Asserts deep imports stay blocked, so step 3 can only pass via "."
 */

import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const TEST_DIR = join(ROOT, "test/.public-types-test");
const TSC = join(ROOT, "node_modules/.bin/tsc");

/** Assertion signature so narrowing survives the check (e.g. `errors !== null`). */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
}

/** Emits dist/*.d.ts so we check the real published surface, not src/. */
function buildDeclarations() {
  console.log("\n📦 Building declarations (tsconfig.build.json)...");
  execFileSync(TSC, ["-p", join(ROOT, "tsconfig.build.json"), "--emitDeclarationOnly"], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf-8",
  });
  assert(existsSync(join(ROOT, "dist/index.d.ts")), "dist/index.d.ts should exist after build");
}

/** Throwaway project with postgresdk resolvable by name, honouring the exports map. */
function scaffoldConsumer() {
  cleanup();
  mkdirSync(join(TEST_DIR, "node_modules"), { recursive: true });
  symlinkSync(ROOT, join(TEST_DIR, "node_modules/postgresdk"), "dir");

  writeFileSync(
    join(TEST_DIR, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          target: "ES2022",
          // "Bundler" enforces the exports map — deep imports must not resolve.
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["*.ts"],
      },
      null,
      2
    ),
    "utf-8"
  );
}

/** Returns tsc's combined output, or null when it exits clean. */
function typeCheck(): string | null {
  try {
    execFileSync(TSC, ["-p", TEST_DIR], { stdio: "pipe", encoding: "utf-8" });
    return null;
  } catch (error: any) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
  }
}

function writeFixture(name: string, source: string) {
  rmSync(join(TEST_DIR, "fixture.ts"), { force: true });
  writeFileSync(join(TEST_DIR, "fixture.ts"), source, "utf-8");
  return name;
}

/** The exact snippet the docs and the config generator hand to users. */
function testDocumentedConfigCompiles() {
  console.log("\n📝 Test 1: documented `satisfies Config` config compiles");

  writeFixture(
    "documented config",
    `import type { Config } from "postgresdk";

export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  outDir: { server: "./api/server", client: "./api/client" },
  auth: { apiKey: "env:API_KEY" },
  delete: { softDeleteColumn: "deleted_at" },
  pull: { from: "https://example.com", output: "./src/sdk" },
} satisfies Config;
`
  );

  const errors = typeCheck();
  assert(errors === null, `docs-prescribed config should type check, got:\n${errors}`);
  console.log("  ✅ Config is exported from the package entry point");
}

/** Config references these; annotating a fragment separately needs them too. */
function testRelatedConfigTypesExported() {
  console.log("\n📝 Test 2: related config types are reachable");

  writeFixture(
    "related types",
    `import type { AuthConfig, AuthConfigInput, DeleteConfig, PullConfig } from "postgresdk";

const auth: AuthConfig = { apiKeyHeader: "x-api-key", apiKeys: ["k"] };
const authInput: AuthConfigInput = { apiKey: "env:API_KEY" };
const del: DeleteConfig = { softDeleteColumn: "deleted_at" };
const pull: PullConfig = { from: "https://example.com" };

export { auth, authInput, del, pull };
`
  );

  const errors = typeCheck();
  assert(errors === null, `related config types should type check, got:\n${errors}`);
  console.log("  ✅ AuthConfig, AuthConfigInput, DeleteConfig, PullConfig are exported");
}

/**
 * Negative control: if deep imports resolved, tests 1-2 could pass without the
 * entry point re-exporting anything. The exports map must keep them blocked.
 */
function testDeepImportBlocked() {
  console.log("\n📝 Test 3: deep import into dist/ stays blocked");

  writeFixture(
    "deep import",
    `import type { Config } from "postgresdk/dist/types";
export type C = Config;
`
  );

  const errors = typeCheck();
  assert(errors !== null, "postgresdk/dist/types should NOT resolve (exports map only defines '.')");
  assert(
    errors.includes("TS2307"),
    `expected TS2307 (cannot find module) for the deep import, got:\n${errors}`
  );
  console.log("  ✅ Deep imports rejected — tests 1-2 passed via the '.' export");
}

async function main() {
  console.log("🧪 Testing public type exports");
  console.log("=".repeat(50));

  try {
    buildDeclarations();
    scaffoldConsumer();

    testDocumentedConfigCompiles();
    testRelatedConfigTypesExported();
    testDeepImportBlocked();

    console.log("\n" + "=".repeat(50));
    console.log("✅ All public type export tests passed!");
    console.log("=".repeat(50));

    cleanup();
    console.log("\n🧹 Cleaned up test files");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Public type export test failed:", error instanceof Error ? error.message : error);
    console.log(`\n📁 Files left for inspection in:\n   ${TEST_DIR}`);
    process.exit(1);
  }
}

main();
