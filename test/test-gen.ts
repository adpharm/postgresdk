import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const PG_URL = "postgres://user:pass@localhost:5432/testdb";
const SERVER_DIR = "gen/generated/server";
const CLIENT_DIR = "gen/generated/client";
const CFG_PATH = join(process.cwd(), "gen.config.ts");

async function applySchemaWithPg(sqlPath: string) {
  const sql = readFileSync(sqlPath, "utf8");
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  try {
    await pg.query(sql);
  } finally {
    await pg.end();
  }
}

function writeTestConfig() {
  const cfg = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outServer: "${SERVER_DIR}",
  outClient: "${CLIENT_DIR}",
  softDeleteColumn: null,
  includeDepthLimit: 3,
  dateType: "date"
};`;
  writeFileSync(CFG_PATH, cfg, "utf-8");
}

async function main() {
  console.log("0) Write test gen.config.ts …");
  writeTestConfig();

  console.log("1) Apply test schema via pg client …");
  await applySchemaWithPg("test/schema.sql");

  console.log("2) Run generator …");
  // Your generator imports ./gen.config.ts
  execSync(`bun run gen/index.ts`, { stdio: "inherit" });

  console.log("3) Verify generated files exist …");
  const required = [
    `${SERVER_DIR}/include-builder.ts`,
    `${SERVER_DIR}/include-loader.ts`,
    `${SERVER_DIR}/routes/authors.ts`,
    `${SERVER_DIR}/routes/books.ts`,
    `${CLIENT_DIR}/authors.ts`,
    `${CLIENT_DIR}/index.ts`,
    `${CLIENT_DIR}/types/authors.ts`,
  ];
  for (const f of required) {
    if (!existsSync(f)) throw new Error(`Missing generated file: ${f}`);
  }

  console.log("4) Type-check generated code …");
  execSync(`tsc --noEmit`, { stdio: "inherit" });

  console.log("5) Boot Hono API using generated routes …");
  // Generated routes export register<Type>Routes(app, { pg })
  const { registerAuthorsRoutes } = await import(`../${SERVER_DIR}/routes/authors.ts`);
  const { registerBooksRoutes } = await import(`../${SERVER_DIR}/routes/books.ts`);

  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  const app = new Hono();
  registerAuthorsRoutes(app, { pg });
  registerBooksRoutes(app, { pg });

  const server = serve({ fetch: app.fetch, port: 3456 });
  console.log("   → Hono on http://localhost:3456");

  try {
    console.log("6) Seed rows …");
    const a = await pg.query(`INSERT INTO authors(name) VALUES ('Jane Doe') RETURNING *`);
    const authorId = a.rows[0].id;
    await pg.query(`INSERT INTO books(author_id, title) VALUES ($1, 'Test Book') RETURNING *`, [authorId]);

    console.log("7) Call generated SDK (with include) …");
    const { SDK } = await import(`../${CLIENT_DIR}/index.ts`);
    const sdk = new SDK({ baseUrl: "http://localhost:3456" });

    const authors = await sdk.authors.list({ include: { books: true } });
    console.log("   → SDK authors.list(include: { books: true })");
    console.log(JSON.stringify(authors, null, 2));

    // Assertions
    if (!Array.isArray(authors) || authors.length < 1) throw new Error("Expected at least one author");
    const jane = authors.find((x: any) => x.name === "Jane Doe");
    if (!jane) throw new Error("Expected Jane Doe");
    if (!Array.isArray(jane.books) || jane.books.length !== 1) throw new Error("Expected 1 book stitched");
    if (jane.books[0].title !== "Test Book") throw new Error("Unexpected book title");

    console.log("✅ Test passed!");
  } finally {
    server.close();
    await pg.end();
  }
}

main().catch((err) => {
  console.error("❌ Test failed", err);
  process.exit(1);
});
