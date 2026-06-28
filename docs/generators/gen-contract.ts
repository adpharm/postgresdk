/**
 * Generates a real "what gets generated" example page by actually running
 * postgresdk against a fixture schema (test/schema.sql) and lifting the
 * generated CONTRACT.md. This makes the example impossible to fake or drift.
 *
 * Requires Docker. If Docker is unavailable, the generator skips (leaving the
 * previously committed page in place) so offline builds still work.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Client } from "pg";
import { ROOT, SRC, writeReferencePage } from "./_shared";

const CONTAINER = "postgresdk-test-db";
const PG_URL = "postgres://user:pass@localhost:5432/testdb";
const IMAGE = "pgvector/pgvector:pg17";

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

async function ensurePostgres(): Promise<void> {
  const running = sh("docker", ["ps", "--filter", `name=${CONTAINER}`, "--format", "{{.Names}}"]).trim();
  if (running === CONTAINER) return;
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
  await waitForPg();
}

async function loadSchema(): Promise<void> {
  const sql = readFileSync(resolve(ROOT, "test/schema.sql"), "utf-8");
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  await pg.query(sql); // simple-protocol multi-statement
  await pg.end();
}

/**
 * Demote ATX headings by one level (cap at h6) so the page keeps a single h1.
 * Fence-aware: never touches `#` inside fenced code blocks (e.g. shell comments).
 */
function demoteHeadings(md: string): string {
  let inFence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(/^(#{1,6})(\s)/, (_m, hashes: string, sp: string) =>
        (hashes.length >= 6 ? hashes : hashes + "#") + sp,
      );
    })
    .join("\n");
}

async function main() {
  if (!quiet("docker", ["--version"])) {
    console.warn("⚠ gen-contract: Docker not available — skipping (keeping committed page).");
    return;
  }

  await ensurePostgres();
  await loadSchema();

  const work = mkdtempSync(join(tmpdir(), "postgresdk-docs-"));
  const outDir = join(work, "api");
  const cfgPath = join(work, "postgresdk.config.ts");
  writeFileSync(
    cfgPath,
    `export default {\n` +
      `  connectionString: ${JSON.stringify(PG_URL)},\n` +
      `  outDir: { client: ${JSON.stringify(join(outDir, "client"))}, server: ${JSON.stringify(join(outDir, "server"))} },\n` +
      `};\n`,
    "utf-8",
  );

  execFileSync("bun", [resolve(SRC, "cli.ts"), "gen", "-c", cfgPath, "--force"], {
    stdio: ["ignore", "ignore", "inherit"],
    cwd: ROOT,
  });

  const contract = readFileSync(join(outDir, "server", "CONTRACT.md"), "utf-8").trim();

  const body = `
This page is a **real, unedited \`CONTRACT.md\`** produced by running postgresdk against the
project's fixture schema ([\`test/schema.sql\`](https://github.com/adpharm/postgresdk/blob/main/test/schema.sql))
— a small library domain (\`authors\` → \`books\`, \`books\` ↔ \`tags\`, plus \`users\`/\`products\` with
\`pgvector\` and \`pg_trgm\`). Use it to see exactly what tables, types, methods, and endpoints
postgresdk emits for your own schema.

---

${demoteHeadings(contract)}
`;

  const path = writeReferencePage({
    slug: "generated-api-example",
    title: "Generated API example (CONTRACT.md)",
    description: "A real CONTRACT.md produced by running postgresdk against the fixture schema.",
    source: "test/schema.sql → postgresdk gen → CONTRACT.md",
    body,
  });

  console.log(`✓ Contract example → ${path}`);
}

main().catch((err) => {
  console.error("✖ gen-contract failed:", err);
  process.exit(1);
});
