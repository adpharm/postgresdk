#!/usr/bin/env bun

/**
 * Integration test: soft-delete filtering in nested includes (real DB)
 *
 * Tests that hidden (soft-deleted) children are excluded from nested include
 * results even when the request fetches multiple parent rows in a single batch —
 * specifically targeting the OR/AND SQL operator-precedence bug where the
 * IS NULL filter was previously only applied to the last OR group.
 */

import { test, expect, beforeAll } from "bun:test";
import { Client } from "pg";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emitIncludeLoader } from "../src/emit-include-loader";
import { emitIncludeBuilder } from "../src/emit-include-builder";
import { buildGraph } from "../src/rel-classify";
import type { Model } from "../src/introspect";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-db";
const CONNECTION_STRING = "postgres://user:pass@localhost:5432/testdb";

/** Temp dir for the generated include-loader/builder used by this test. */
const TMP_DIR = join(import.meta.dir, ".tmp-soft-delete-include");

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) return;
  } catch {}

  console.log("🐳 Starting PostgreSQL container for soft-delete include tests...");
  try {
    const { stdout } = await execAsync(`docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      await execAsync(`docker start ${CONTAINER_NAME}`);
    } else {
      await execAsync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=testdb -p 5432:5432 postgres:17-alpine`);
    }
  } catch (error) {
    console.error("Failed to start container:", error);
    throw error;
  }

  console.log("  → Waiting for PostgreSQL to be ready...");
  for (let attempts = 0; attempts < 30; attempts++) {
    try {
      const pg = new Client({ connectionString: CONNECTION_STRING });
      await pg.connect();
      await pg.query("SELECT 1");
      await pg.end();
      console.log("  ✓ PostgreSQL is ready!");
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error("PostgreSQL failed to start in time");
}

/**
 * Minimal model: sd_post 1:N sd_comment.
 * sd_comment has a deleted_at soft-delete column; sd_post does not.
 * Using singular base names so the relation graph produces clean plural keys
 * ("sd_comments" on sd_post, "sd_post" on sd_comment).
 */
const model: Model = {
  schema: "public",
  enums: {},
  tables: {
    sd_post: {
      name: "sd_post",
      pk: ["id"],
      uniques: [],
      columns: [
        { name: "id", pgType: "int4", nullable: false, hasDefault: true },
        { name: "title", pgType: "text", nullable: true, hasDefault: false },
      ],
      fks: [],
    },
    sd_comment: {
      name: "sd_comment",
      pk: ["id"],
      uniques: [],
      columns: [
        { name: "id", pgType: "int4", nullable: false, hasDefault: true },
        { name: "body", pgType: "text", nullable: true, hasDefault: false },
        { name: "post_id", pgType: "int4", nullable: true, hasDefault: false },
        { name: "deleted_at", pgType: "timestamptz", nullable: true, hasDefault: false },
      ],
      fks: [{ from: ["post_id"], toTable: "sd_post", to: ["id"], onDelete: "no action", onUpdate: "no action" }],
    },
  },
};

const softDeleteCols: Record<string, string | null> = {
  sd_post: null,
  sd_comment: "deleted_at",
};

beforeAll(async () => {
  await ensurePostgresRunning();

  // Generate the include-builder and include-loader with soft-delete baked in,
  // then write them to a temp dir so they can be dynamically imported below.
  mkdirSync(TMP_DIR, { recursive: true });
  const graph = buildGraph(model);
  writeFileSync(join(TMP_DIR, "include-builder.ts"), emitIncludeBuilder(graph, 2));
  writeFileSync(join(TMP_DIR, "include-loader.ts"), emitIncludeLoader(model, 2, { softDeleteCols }));

  // Create schema once; individual tests clean their own data via DELETE.
  const pg = new Client({ connectionString: CONNECTION_STRING });
  await pg.connect();
  try {
    await pg.query("DROP TABLE IF EXISTS sd_comment");
    await pg.query("DROP TABLE IF EXISTS sd_post");
    await pg.query("CREATE TABLE sd_post (id SERIAL PRIMARY KEY, title TEXT)");
    await pg.query(`
      CREATE TABLE sd_comment (
        id SERIAL PRIMARY KEY,
        body TEXT,
        post_id INT REFERENCES sd_post(id),
        deleted_at TIMESTAMPTZ
      )
    `);
  } finally {
    await pg.end();
  }
});

test("1:N nested include excludes soft-deleted rows for ALL parents in a multi-parent batch", async () => {
  // This is the critical regression test for the OR/AND precedence bug.
  // With 3 parents the WHERE clause is:
  //   WHERE ("post_id" = $1) OR ("post_id" = $2) OR ("post_id" = $3) AND "deleted_at" IS NULL
  // Due to AND > OR precedence, pre-fix only parent 3's comments were filtered.
  const pg = new Client({ connectionString: CONNECTION_STRING });
  await pg.connect();

  try {
    await pg.query("DELETE FROM sd_comment");
    await pg.query("DELETE FROM sd_post");

    const p1 = (await pg.query("INSERT INTO sd_post (title) VALUES ('Post 1') RETURNING *")).rows[0];
    const p2 = (await pg.query("INSERT INTO sd_post (title) VALUES ('Post 2') RETURNING *")).rows[0];
    const p3 = (await pg.query("INSERT INTO sd_post (title) VALUES ('Post 3') RETURNING *")).rows[0];

    for (const p of [p1, p2, p3]) {
      await pg.query("INSERT INTO sd_comment (body, post_id) VALUES ($1, $2)", [`${p.title} visible`, p.id]);
      await pg.query(
        "INSERT INTO sd_comment (body, post_id, deleted_at) VALUES ($1, $2, NOW())",
        [`${p.title} deleted`, p.id],
      );
    }

    const { loadIncludes } = await import("./.tmp-soft-delete-include/include-loader");
    const result = await loadIncludes("sd_post", [p1, p2, p3], { sd_comments: true }, pg);

    for (const post of result) {
      expect(post.sd_comments).toHaveLength(1);
      expect(post.sd_comments[0].deleted_at).toBeNull();
    }
    expect(result[0].sd_comments[0].body).toBe("Post 1 visible");
    expect(result[1].sd_comments[0].body).toBe("Post 2 visible");
    expect(result[2].sd_comments[0].body).toBe("Post 3 visible");
  } finally {
    await pg.end();
  }
});

test("1:N nested include surfaces soft-deleted rows when includeSoftDeleted: true is passed", async () => {
  // Verifies that includeSoftDeleted propagates into the nested loader.
  // Pre-fix: even with includeSoftDeleted: true the nested query still appended
  // AND "deleted_at" IS NULL, so hidden rows never appeared.
  const pg = new Client({ connectionString: CONNECTION_STRING });
  await pg.connect();

  try {
    await pg.query("DELETE FROM sd_comment");
    await pg.query("DELETE FROM sd_post");

    const p1 = (await pg.query("INSERT INTO sd_post (title) VALUES ('Post 1') RETURNING *")).rows[0];
    const p2 = (await pg.query("INSERT INTO sd_post (title) VALUES ('Post 2') RETURNING *")).rows[0];
    const p3 = (await pg.query("INSERT INTO sd_post (title) VALUES ('Post 3') RETURNING *")).rows[0];

    for (const p of [p1, p2, p3]) {
      await pg.query("INSERT INTO sd_comment (body, post_id) VALUES ($1, $2)", [`${p.title} visible`, p.id]);
      await pg.query(
        "INSERT INTO sd_comment (body, post_id, deleted_at) VALUES ($1, $2, NOW())",
        [`${p.title} deleted`, p.id],
      );
    }

    const { loadIncludes } = await import("./.tmp-soft-delete-include/include-loader");
    const result = await loadIncludes("sd_post", [p1, p2, p3], { sd_comments: true }, pg, 2, true);

    // With includeSoftDeleted: true every parent should see both comments.
    for (const post of result) {
      expect(post.sd_comments).toHaveLength(2);
    }
    // Deleted comments must be present for all parents, not just the last.
    const allBodies = result.flatMap((p: any) => p.sd_comments.map((c: any) => c.body)).sort();
    expect(allBodies).toEqual([
      "Post 1 deleted", "Post 1 visible",
      "Post 2 deleted", "Post 2 visible",
      "Post 3 deleted", "Post 3 visible",
    ]);
  } finally {
    await pg.end();
  }
});

test("1:N nested include excludes soft-deleted rows with a single parent (baseline)", async () => {
  const pg = new Client({ connectionString: CONNECTION_STRING });
  await pg.connect();

  try {
    await pg.query("DELETE FROM sd_comment");
    await pg.query("DELETE FROM sd_post");

    const p1 = (await pg.query("INSERT INTO sd_post (title) VALUES ('Solo Post') RETURNING *")).rows[0];
    await pg.query("INSERT INTO sd_comment (body, post_id) VALUES ('visible', $1)", [p1.id]);
    await pg.query("INSERT INTO sd_comment (body, post_id, deleted_at) VALUES ('deleted', $1, NOW())", [p1.id]);

    const { loadIncludes } = await import("./.tmp-soft-delete-include/include-loader");
    const result = await loadIncludes("sd_post", [p1], { sd_comments: true }, pg);

    expect(result[0].sd_comments).toHaveLength(1);
    expect(result[0].sd_comments[0].body).toBe("visible");
  } finally {
    await pg.end();
  }
});
