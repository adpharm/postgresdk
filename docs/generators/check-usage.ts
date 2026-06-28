/**
 * Docs usage typecheck (`task docs:check`).
 *
 * Generates an SDK from test/schema.sql, then compiles docs/checks/usage.ts —
 * which mirrors the documented call patterns — against it. A compile error means
 * the SDK API drifted from what the guides claim. Never runs the SDK.
 *
 * Needs a fixture DB (Docker locally, or POSTGRESDK_DOCS_PG_URL in CI). Skips
 * cleanly if neither is available.
 */
import { cpSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./_shared";
import { ensureFixtureDb, fixtureDbAvailable, generateFixtureSdk } from "./_fixture";

const GEN_DIR = resolve(import.meta.dir, "../.generated");
const USAGE_SRC = resolve(import.meta.dir, "../checks/usage.ts");

const tsconfig = {
  compilerOptions: {
    target: "ES2022",
    module: "ES2022",
    moduleResolution: "bundler",
    lib: ["ES2022", "DOM"],
    strict: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    types: [] as string[],
  },
  include: ["usage.ts", "client/**/*.ts"],
};

async function main() {
  if (!fixtureDbAvailable()) {
    console.warn("⚠ docs:check: no fixture DB (Docker/POSTGRESDK_DOCS_PG_URL) — skipping.");
    return;
  }

  await ensureFixtureDb();
  generateFixtureSdk(GEN_DIR); // → GEN_DIR/client, GEN_DIR/server
  cpSync(USAGE_SRC, join(GEN_DIR, "usage.ts"));
  const tsconfigPath = join(GEN_DIR, "tsconfig.json");
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), "utf-8");

  const tsc = resolve(ROOT, "node_modules/.bin/tsc");
  try {
    execFileSync(tsc, ["-p", tsconfigPath, "--noEmit"], { stdio: "pipe", encoding: "utf-8" });
    console.log("✓ docs usage typecheck passed — guides match the generated SDK API.");
  } catch (e: any) {
    console.error("✖ docs usage typecheck FAILED — the SDK API drifted from the docs:\n");
    console.error((e.stdout ?? "") + (e.stderr ?? ""));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
