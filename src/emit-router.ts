import type { Table } from "./introspect";
import { pascal } from "./utils";

/**
 * Emits the server router file that exports helper functions for route registration
 */
export function emitRouter(tables: Table[], hasAuth: boolean) {
  const tableNames = tables.map(t => t.name).sort();
  const imports = tableNames
    .map(name => {
      const Type = pascal(name);
      return `import { register${Type}Routes } from "./routes/${name}";`;
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
      return `export { register${Type}Routes } from "./routes/${name}";`;
    })
    .join("\n");

  return `/* Generated. Do not edit. */
import { Hono } from "hono";
import { SDK_MANIFEST } from "./sdk-bundle";
${imports}
${hasAuth ? `export { authMiddleware } from "./auth";` : ""}

/**
 * Creates a Hono router with all generated routes that can be mounted into your existing app.
 * 
 * @example
 * import { Hono } from "hono";
 * import { Client } from "pg";
 * import { createRouter } from "./generated/server/router";
 * 
 * const app = new Hono();
 * const pg = new Client({ connectionString: process.env.DATABASE_URL });
 * await pg.connect();
 * 
 * // Mount all generated routes under /api
 * const apiRouter = createRouter({ pg });
 * app.route("/api", apiRouter);
 * 
 * // Or mount directly at root
 * const router = createRouter({ pg });
 * app.route("/", router);
 */
export function createRouter(
  deps: { pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> } }
): Hono {
  const router = new Hono();
  
  // Register table routes
${registrations}
  
  // SDK distribution endpoints
  router.get("/sdk/manifest", (c) => {
    return c.json({
      version: SDK_MANIFEST.version,
      generated: SDK_MANIFEST.generated,
      files: Object.keys(SDK_MANIFEST.files)
    });
  });
  
  router.get("/sdk/download", (c) => {
    return c.json(SDK_MANIFEST);
  });
  
  router.get("/sdk/files/:path{.*}", (c) => {
    const path = c.req.param("path");
    const content = SDK_MANIFEST.files[path as keyof typeof SDK_MANIFEST.files];
    if (!content) {
      return c.text("File not found", 404);
    }
    return c.text(content, 200, {
      "Content-Type": "text/plain; charset=utf-8"
    });
  });
  
  return router;
}

/**
 * Register all generated routes directly on an existing Hono app.
 * 
 * @example
 * import { Hono } from "hono";
 * import { Client } from "pg";
 * import { registerAllRoutes } from "./generated/server/router";
 * 
 * const app = new Hono();
 * const pg = new Client({ connectionString: process.env.DATABASE_URL });
 * await pg.connect();
 * 
 * // Register all routes at once
 * registerAllRoutes(app, { pg });
 */
export function registerAllRoutes(
  app: Hono,
  deps: { pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> } }
) {
${registrations.replace(/router/g, 'app')}
}

// Individual route registrations (for selective use)
${reExports}

// Re-export types and schemas for convenience
export * from "./include-spec";
`;
}