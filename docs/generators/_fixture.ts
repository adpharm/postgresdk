/**
 * Shared fixture helpers: bring up a Postgres with the project's test schema and
 * generate an SDK from it. Used by both the "generated API example" page
 * (gen-contract) and the docs usage typecheck (check-usage).
 *
 * DB acquisition:
 * - If POSTGRESDK_DOCS_PG_URL is set (e.g. a CI service container), it's used as-is
 *   and Docker is never touched.
 * - Otherwise a local Docker container (pgvector/pgvector:pg17) is started, matching
 *   the test harness.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { Client } from "pg";
import { ROOT, SRC } from "./_shared";

const CONTAINER = "postgresdk-test-db";
const IMAGE = "pgvector/pgvector:pg17";
const DEFAULT_URL = "postgres://user:pass@localhost:5432/testdb";

/** Connection string for the fixture DB (env override wins). */
export const PG_URL = process.env.POSTGRESDK_DOCS_PG_URL ?? DEFAULT_URL;

/** True when an external DB is provided and we should not manage Docker. */
const externalDb = Boolean(process.env.POSTGRESDK_DOCS_PG_URL);

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}
function quiet(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Resolve whether we can/should proceed. Returns false if no DB is obtainable. */
export function fixtureDbAvailable(): boolean {
  return externalDb || quiet("docker", ["--version"]);
}

async function waitForPg(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const pg = new Client({ connectionString: PG_URL });
      await pg.connect();
      await pg.query("SELECT 1");
      await pg.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("Postgres did not become ready in time");
}

async function ensureDockerPostgres(): Promise<void> {
  const running = sh("docker", ["ps", "--filter", `name=${CONTAINER}`, "--format", "{{.Names}}"]).trim();
  if (running !== CONTAINER) {
    const exists = sh("docker", ["ps", "-a", "--filter", `name=${CONTAINER}`, "--format", "{{.Names}}"]).trim();
    if (exists === CONTAINER) {
      sh("docker", ["start", CONTAINER]);
    } else {
      quiet("docker", ["pull", IMAGE]);
      sh("docker", [
        "run", "-d", "--name", CONTAINER,
        "-e", "POSTGRES_USER=user", "-e", "POSTGRES_PASSWORD=pass", "-e", "POSTGRES_DB=testdb",
        "-p", "5432:5432", IMAGE,
      ]);
    }
  }
  await waitForPg();
}

/** Ensure the fixture DB is up and loaded with test/schema.sql. */
export async function ensureFixtureDb(): Promise<void> {
  if (!externalDb) await ensureDockerPostgres();
  else await waitForPg();

  const sql = readFileSync(resolve(ROOT, "test/schema.sql"), "utf-8");
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  await pg.query(sql); // simple-protocol multi-statement; schema.sql is re-runnable
  await pg.end();
}

/**
 * Generate an SDK from the fixture into `outDir` (fresh). Returns the client/server dirs.
 */
export function generateFixtureSdk(outDir: string): { client: string; server: string } {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const client = join(outDir, "client");
  const server = join(outDir, "server");
  const cfgPath = join(outDir, "postgresdk.config.ts");
  writeFileSync(
    cfgPath,
    `export default {\n` +
      `  connectionString: ${JSON.stringify(PG_URL)},\n` +
      `  outDir: { client: ${JSON.stringify(client)}, server: ${JSON.stringify(server)} },\n` +
      `};\n`,
    "utf-8",
  );
  execFileSync("bun", [resolve(SRC, "cli.ts"), "gen", "-c", cfgPath, "--force"], {
    stdio: ["ignore", "ignore", "inherit"],
    cwd: ROOT,
  });
  return { client, server };
}
