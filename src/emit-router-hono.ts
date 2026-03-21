import type { Table } from "./introspect";
import { pascal, isVectorType, isJsonbType } from "./utils";

/**
 * Emits the Hono server router file that exports helper functions for route registration
 */
export function emitHonoRouter(
  tables: Table[],
  hasAuth: boolean,
  useJsExtensions?: boolean,
  pullToken?: string,
  opts?: {
    apiPathPrefix?: string;
    softDeleteCols?: Record<string, string | null>;
    includeMethodsDepth?: number;
  }
) {
  const tableNames = tables.map(t => t.name).sort();
  const ext = useJsExtensions ? ".js" : "";
  const apiPathPrefix = opts?.apiPathPrefix ?? "/v1";
  const softDeleteCols = opts?.softDeleteCols ?? {};
  const includeMethodsDepth = opts?.includeMethodsDepth ?? 2;

  // Resolve pullToken if it uses "env:" syntax
  let resolvedPullToken: string | undefined;
  let pullTokenEnvVar: string | undefined;
  if (pullToken) {
    if (pullToken.startsWith("env:")) {
      const envVarName = pullToken.slice(4);
      resolvedPullToken = `process.env.${envVarName}`;
      pullTokenEnvVar = envVarName;
    } else {
      // Hardcoded token (not recommended, but support it)
      resolvedPullToken = JSON.stringify(pullToken);
    }
  }
  
  const imports = tableNames
    .map(name => {
      const Type = pascal(name);
      return `import { register${Type}Routes } from "./routes/${name}${ext}";`;
    })
    .join("\n");

  const registrations = tableNames
    .map(name => {
      const Type = pascal(name);
      return `  register${Type}Routes(router, deps);`;
    })
    .join("\n");

  const reExports = tableNames
    .map(name => {
      const Type = pascal(name);
      return `export { register${Type}Routes } from "./routes/${name}${ext}";`;
    })
    .join("\n");

  // Zod schema imports for transaction validation (one per table)
  const txSchemaImports = tableNames
    .map(name => {
      const Type = pascal(name);
      return `import { Insert${Type}Schema, Update${Type}Schema } from "./zod/${name}${ext}";`;
    })
    .join("\n");

  /** Generates the transaction route block for a given Hono app variable name. */
  function txRouteBlock(appVar: string): string {
    const authLine = hasAuth ? `  ${appVar}.use(\`${apiPathPrefix}/transaction\`, authMiddleware);\n` : "";
    // Single-escape: \` → backtick, \${ → literal ${ in generated TypeScript
    return `${authLine}  ${appVar}.post(\`${apiPathPrefix}/transaction\`, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const rawOps: unknown[] = Array.isArray(body.ops) ? body.ops : [];

    if (rawOps.length === 0) {
      return c.json({ error: "ops must be a non-empty array" }, 400);
    }

    // Validate all ops against their table schemas BEFORE opening a transaction
    const validatedOps: coreOps.TransactionOperation[] = [];
    for (let i = 0; i < rawOps.length; i++) {
      const item = rawOps[i] as any;
      const entry = TABLE_TX_METADATA[item?.table as string];
      if (!entry) {
        return c.json({ error: \`Unknown table "\${item?.table}" at index \${i}\`, failedAt: i }, 400);
      }
      if (item.op === "create") {
        const parsed = entry.insertSchema.safeParse(item.data ?? {});
        if (!parsed.success) {
          return c.json({ error: "Validation failed", issues: parsed.error.flatten(), failedAt: i }, 400);
        }
        validatedOps.push({ op: "create", table: item.table, data: parsed.data });
      } else if (item.op === "update") {
        const parsed = entry.updateSchema.safeParse(item.data ?? {});
        if (!parsed.success) {
          return c.json({ error: "Validation failed", issues: parsed.error.flatten(), failedAt: i }, 400);
        }
        if (item.pk == null) {
          return c.json({ error: \`Missing pk at index \${i}\`, failedAt: i }, 400);
        }
        validatedOps.push({ op: "update", table: item.table, pk: item.pk, data: parsed.data });
      } else if (item.op === "delete") {
        if (item.pk == null) {
          return c.json({ error: \`Missing pk at index \${i}\`, failedAt: i }, 400);
        }
        validatedOps.push({ op: "delete", table: item.table, pk: item.pk });
      } else {
        return c.json({ error: \`Unknown op "\${item?.op}" at index \${i}\`, failedAt: i }, 400);
      }
    }

    const onBegin = deps.onRequest
      ? (txClient: typeof deps.pg) => deps.onRequest!(c, txClient)
      : undefined;

    const result = await coreOps.executeTransaction(deps.pg, validatedOps, TABLE_TX_METADATA, onBegin);

    if (!result.ok) {
      return c.json({ error: result.error, failedAt: result.failedAt }, 400);
    }
    return c.json({ results: result.results.map(r => r.data) }, 200);
  });`;
  }

  // TABLE_TX_METADATA constant entries
  const txMetadataEntries = tables
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => {
      const rawPk = (t as any).pk;
      const pkCols: string[] = Array.isArray(rawPk) ? rawPk : rawPk ? [rawPk] : ["id"];
      const softDel = softDeleteCols[t.name] ?? null;
      const allCols = t.columns.map(c => `"${c.name}"`).join(", ");
      const vecCols = t.columns.filter(c => isVectorType(c.pgType)).map(c => `"${c.name}"`).join(", ");
      const jsonCols = t.columns.filter(c => isJsonbType(c.pgType)).map(c => `"${c.name}"`).join(", ");
      const Type = pascal(t.name);
      return `  "${t.name}": {
    table: "${t.name}",
    pkColumns: ${JSON.stringify(pkCols)},
    softDeleteColumn: ${softDel ? `"${softDel}"` : "null"},
    allColumnNames: [${allCols}],
    vectorColumns: [${vecCols}],
    jsonbColumns: [${jsonCols}],
    includeMethodsDepth: ${includeMethodsDepth},
    insertSchema: Insert${Type}Schema,
    updateSchema: Update${Type}Schema,
  }`;
    })
    .join(",\n");

  return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * This file was automatically generated by PostgreSDK.
 * Any manual changes will be overwritten on the next generation.
 *
 * To make changes, modify your schema or configuration and regenerate.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { SDK_MANIFEST } from "./sdk-bundle${ext}";
import { getContract } from "./contract${ext}";
import * as coreOps from "./core/operations${ext}";
${txSchemaImports}
${imports}
${hasAuth ? `import { authMiddleware } from "./auth${ext}";\nexport { authMiddleware };` : ""}

/** Discriminated result from safeParse — mirrors Zod's actual return shape */
type SchemaParseResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: { flatten: () => unknown } };

/** Registry entry — core metadata + Zod schemas for request validation */
interface TxTableRegistry extends coreOps.TransactionTableMetadata {
  insertSchema: { safeParse: (v: unknown) => SchemaParseResult };
  updateSchema: { safeParse: (v: unknown) => SchemaParseResult };
}

// Registry used by POST /v1/transaction — maps table name to metadata + Zod schemas
const TABLE_TX_METADATA: Record<string, TxTableRegistry> = {
${txMetadataEntries}
};

/**
 * Creates a Hono router with all generated routes that can be mounted into your existing app.
 *
 * @example
 * import { Hono } from "hono";
 * import { createRouter } from "./generated/server/router";
 *
 * // Using pg driver (Node.js)
 * import { Client } from "pg";
 * const pg = new Client({ connectionString: process.env.DATABASE_URL });
 * await pg.connect();
 *
 * // OR using Neon driver
 * import { Pool } from "@neondatabase/serverless";
 *
 * // For serverless (Vercel/Netlify) - one connection per instance
 * const pool = new Pool({
 *   connectionString: process.env.DATABASE_URL!,
 *   max: 1
 * });
 *
 * // For traditional servers - connection pooling
 * const pool = new Pool({
 *   connectionString: process.env.DATABASE_URL!,
 *   max: 10
 * });
 *
 * const pg = pool;
 *
 * // Mount all generated routes
 * const app = new Hono();
 * const apiRouter = createRouter({ pg });
 * app.route("/api", apiRouter);
 *
 * // Or mount directly at root
 * const router = createRouter({ pg });
 * app.route("/", router);
 *
 * // With onRequest hook for audit logging or session variables
 * const router = createRouter({
 *   pg,
 *   onRequest: async (c, pg) => {
 *     const auth = c.get('auth'); // Type-safe! IDE autocomplete works
 *     if (auth?.kind === 'jwt' && auth.claims?.sub) {
 *       await pg.query(\`SET LOCAL app.user_id = '\${auth.claims.sub}'\`);
 *     }
 *   }
 * });
 */
export function createRouter(
  deps: {
    pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> },
    onRequest?: (c: Context, pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> }) => Promise<void>
  }
): Hono {
  const router = new Hono();

  // Register table routes
${registrations}
${pullToken ? `
  // 🔐 Protect /_psdk/* endpoints with pullToken
  router.use("/_psdk/*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const expectedToken = ${resolvedPullToken};

    if (!expectedToken) {
      // Token not configured in environment - reject request
      return c.json({
        error: "SDK endpoints are protected but pullToken environment variable not set. ${pullTokenEnvVar ? `Set ${pullTokenEnvVar} in your environment, or remove pullToken from config.` : 'Remove pullToken from config or set the expected environment variable.'}"
      }, 500);
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const providedToken = authHeader.slice(7); // Remove "Bearer " prefix

    if (providedToken !== expectedToken) {
      return c.json({ error: "Invalid pull token" }, 401);
    }

    await next();
  });
` : ""}
  // Transaction endpoint — executes multiple operations atomically
${txRouteBlock('router')}

  // SDK distribution endpoints
  router.get("/_psdk/sdk/manifest", (c) => {
    return c.json({
      version: SDK_MANIFEST.version,
      files: Object.keys(SDK_MANIFEST.files)
    });
  });

  router.get("/_psdk/sdk/download", (c) => {
    return c.json(SDK_MANIFEST);
  });

  router.get("/_psdk/sdk/files/:path{.*}", (c) => {
    const path = c.req.param("path");
    const content = SDK_MANIFEST.files[path as keyof typeof SDK_MANIFEST.files];
    if (!content) {
      return c.text("File not found", 404);
    }
    return c.text(content, 200, {
      "Content-Type": "text/plain; charset=utf-8"
    });
  });

  // API Contract endpoints - describes the entire API
  router.get("/_psdk/contract", (c) => {
    const format = c.req.query("format") || "json";

    if (format === "markdown") {
      return c.text(getContract("markdown") as string, 200, {
        "Content-Type": "text/markdown; charset=utf-8"
      });
    }

    return c.json(getContract("json"));
  });

  router.get("/_psdk/contract.json", (c) => {
    return c.json(getContract("json"));
  });

  router.get("/_psdk/contract.md", (c) => {
    return c.text(getContract("markdown") as string, 200, {
      "Content-Type": "text/markdown; charset=utf-8"
    });
  });
  
  return router;
}

/**
 * Register all generated routes directly on an existing Hono app.
 *
 * @example
 * import { Hono } from "hono";
 * import { registerAllRoutes } from "./generated/server/router";
 *
 * const app = new Hono();
 *
 * // Setup database connection (see createRouter example for both pg and Neon options)
 * const pg = yourDatabaseClient;
 *
 * // Register all routes at once
 * registerAllRoutes(app, { pg });
 *
 * // With onRequest hook
 * registerAllRoutes(app, {
 *   pg,
 *   onRequest: async (c, pg) => {
 *     const auth = c.get('auth'); // Type-safe!
 *     if (auth?.kind === 'jwt' && auth.claims?.sub) {
 *       await pg.query(\`SET LOCAL app.user_id = '\${auth.claims.sub}'\`);
 *     }
 *   }
 * });
 */
export function registerAllRoutes(
  app: Hono,
  deps: {
    pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> },
    onRequest?: (c: Context, pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> }) => Promise<void>
  }
) {
${registrations.replace(/router/g, 'app')}
${txRouteBlock('app')}
}

// Individual route registrations (for selective use)
${reExports}

// Re-export types and schemas for convenience
export * from "./include-spec${ext}";
`;
}