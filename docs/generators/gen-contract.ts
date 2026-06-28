/**
 * Generates a real "what gets generated" example page by actually running
 * postgresdk against a fixture schema (test/schema.sql) and lifting the
 * generated CONTRACT.md. This makes the example impossible to fake or drift.
 *
 * Requires a fixture DB (Docker locally, or POSTGRESDK_DOCS_PG_URL in CI). If
 * neither is available, the generator skips (leaving the committed page in place)
 * so offline builds still work.
 */
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeReferencePage } from "./_shared";
import { ensureFixtureDb, fixtureDbAvailable, generateFixtureSdk } from "./_fixture";

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
  if (!fixtureDbAvailable()) {
    console.warn("⚠ gen-contract: no fixture DB (Docker/POSTGRESDK_DOCS_PG_URL) — skipping.");
    return;
  }

  await ensureFixtureDb();
  const work = mkdtempSync(join(tmpdir(), "postgresdk-docs-"));
  const { server } = generateFixtureSdk(join(work, "api"));
  const contract = readFileSync(join(server, "CONTRACT.md"), "utf-8").trim();

  const body = `
This page is a **real, unedited \`CONTRACT.md\`** produced by running postgresdk against the
project's fixture schema ([\`test/schema.sql\`](https://github.com/adpharm/postgresdk/blob/main/test/schema.sql))
— a small library domain (\`authors\` → \`books\`, \`books\` ↔ \`tags\`, plus \`users\`/\`products\` with
\`pgvector\` and \`pg_trgm\`). Use it to see exactly what tables, types, methods, and endpoints
postgresdk emits for your own schema.

:::note[Reading the examples below]
- **Import paths are relative to the generated *client* directory** (e.g. \`./client\`). In the guides
  we use the default \`outDir\` of \`{ client: "./api/client", server: "./api/server" }\`, so your
  imports there would start \`./api/client\`. Adjust to wherever your \`outDir\` points.
- Some feature snippets (e.g. vector search) use **placeholder table names** to illustrate the
  shape of a call — match them to the real tables in *your* schema.
:::

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
