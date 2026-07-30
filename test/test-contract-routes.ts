#!/usr/bin/env bun
/**
 * Tests that CONTRACT.md's documented endpoints match the routes actually emitted.
 *
 * CONTRACT.md is what downstream agents read to call the API, so a wrong method
 * or path there is worse than a missing doc — it sends them to a 404. This drift
 * was real: the contract advertised `GET /v1/<table>` for list while the route
 * emitter has always emitted `POST /v1/<table>/list`.
 *
 * Both emitters are pure functions of a model, so this needs no database — it
 * builds a synthetic schema and diffs the two outputs directly:
 * 1. Parse `app.<verb>(...)` registrations out of the emitted Hono routes
 * 2. Collect the endpoints + `correspondsTo` strings out of the contract
 * 3. Assert the contract never claims an endpoint the router doesn't serve
 */

import type { Model, Table } from "../src/introspect";
import type { Config } from "../src/types";
import { buildGraph } from "../src/rel-classify";
import { emitHonoRoutes } from "../src/emit-routes-hono";
import { generateUnifiedContract } from "../src/emit-sdk-contract";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/** Two related tables: an FK so include methods appear, and a soft-delete column. */
const model: Model = {
  schema: "public",
  enums: {},
  tables: {
    authors: {
      name: "authors",
      columns: [
        { name: "id", pgType: "uuid", nullable: false, hasDefault: true },
        { name: "name", pgType: "text", nullable: false, hasDefault: false },
        { name: "deleted_at", pgType: "timestamptz", nullable: true, hasDefault: false },
      ],
      pk: ["id"],
      uniques: [],
      fks: [],
    },
    books: {
      name: "books",
      columns: [
        { name: "id", pgType: "uuid", nullable: false, hasDefault: true },
        { name: "author_id", pgType: "uuid", nullable: false, hasDefault: false },
        { name: "title", pgType: "text", nullable: false, hasDefault: false },
        { name: "deleted_at", pgType: "timestamptz", nullable: true, hasDefault: false },
      ],
      pk: ["id"],
      uniques: [],
      fks: [
        { from: ["author_id"], toTable: "authors", to: ["id"], onDelete: "cascade", onUpdate: "no action" },
      ],
    },
  },
};

const graph = buildGraph(model);

/**
 * Routes the router actually serves, as `VERB /path`.
 *
 * The emitted source registers them as `app.post(base, ...)` or
 * ``app.get(`${base}/:id`, ...)``, with `base` a string literal near the top.
 */
function actualRoutes(table: Table, config: Config): Set<string> {
  const src = emitHonoRoutes(table, graph, {
    softDeleteColumn: "deleted_at",
    exposeHardDelete: true,
    includeMethodsDepth: 2,
    authStrategy: "none",
    apiPathPrefix: config.apiPathPrefix || "/v1",
    maxLimit: 1000,
  });

  const baseMatch = src.match(/const base = "([^"]+)"/);
  assert(baseMatch !== null, `could not find \`const base\` in emitted routes for ${table.name}`);
  const base = baseMatch[1]!;

  const routes = new Set<string>();
  // `app.post(base,` — the bare base path
  for (const m of src.matchAll(/app\.(get|post|patch|delete|put)\(base\s*,/g)) {
    routes.add(`${m[1]!.toUpperCase()} ${base}`);
  }
  // app.post(`${base}/list`, — a suffix off the base path
  for (const m of src.matchAll(/app\.(get|post|patch|delete|put)\(`\$\{base\}([^`]*)`/g)) {
    routes.add(`${m[1]!.toUpperCase()} ${base}${m[2]!}`);
  }
  return routes;
}

/** Endpoints the contract advertises, as `VERB /path`, plus each SDK method's `correspondsTo`. */
function documentedRoutes(config: Config) {
  const contract = generateUnifiedContract(model, config, graph);
  const endpoints = new Map<string, string[]>();
  const correspondsTo = new Map<string, string[]>();

  for (const resource of contract.resources) {
    endpoints.set(
      resource.tableName,
      resource.api.endpoints.map((e) => `${e.method.toUpperCase()} ${e.path}`),
    );
    correspondsTo.set(
      resource.tableName,
      resource.sdk.methods
        .map((m) => m.correspondsTo)
        .filter((v): v is string => Boolean(v))
        // DELETE documents a `?hard=true` variant; the query string isn't part of the route.
        .map((v) => v.split("?")[0]!.trim()),
    );
  }
  return { endpoints, correspondsTo };
}

function checkConfig(label: string, config: Config) {
  console.log(`\n📝 ${label}`);

  const { endpoints, correspondsTo } = documentedRoutes(config);

  for (const table of Object.values(model.tables)) {
    const actual = actualRoutes(table, config);
    assert(actual.size > 0, `${table.name}: no routes parsed out of the emitted source`);

    const documented = endpoints.get(table.name);
    assert(documented !== undefined, `${table.name}: missing from the contract entirely`);
    assert(documented.length > 0, `${table.name}: contract documents no endpoints`);

    for (const endpoint of documented) {
      assert(
        actual.has(endpoint),
        `${table.name}: contract documents \`${endpoint}\`, but the router only serves:\n    ${[...actual].join("\n    ")}`,
      );
    }

    for (const target of correspondsTo.get(table.name) ?? []) {
      assert(
        actual.has(target),
        `${table.name}: an SDK method claims \`API: ${target}\`, but the router only serves:\n    ${[...actual].join("\n    ")}`,
      );
    }

    console.log(`  ✅ ${table.name}: ${documented.length} endpoints match the emitted routes`);
  }

  // The specific regression: list must be POST /<base>/list, never GET /<base>.
  const prefix = config.apiPathPrefix || "/v1";
  const booksEndpoints = endpoints.get("books") ?? [];
  assert(
    booksEndpoints.includes(`POST ${prefix}/books/list`),
    `list should be documented as \`POST ${prefix}/books/list\`, got: ${booksEndpoints.join(", ")}`,
  );
  assert(
    !booksEndpoints.includes(`GET ${prefix}/books`),
    `\`GET ${prefix}/books\` is not a real route and must not be documented`,
  );
  console.log(`  ✅ list documented as POST ${prefix}/<table>/list`);
}

async function main() {
  console.log("🧪 Testing CONTRACT.md endpoints against emitted routes");
  console.log("=".repeat(50));

  try {
    checkConfig("Default apiPathPrefix", { connectionString: "postgres://unused" });
    // Guards the prefix being hardcoded rather than read from config.
    checkConfig("Custom apiPathPrefix", { connectionString: "postgres://unused", apiPathPrefix: "/api/v2" });

    console.log("\n" + "=".repeat(50));
    console.log("✅ Contract matches the emitted routes!");
    console.log("=".repeat(50));
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Contract/route drift:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
