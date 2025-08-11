import type { Table } from "./introspect";
import { pascal } from "./utils";

/**
 * Emits the Hono server router file that exports helper functions for route registration
 */
export function emitHonoRouter(tables: Table[], hasAuth: boolean, useJsExtensions?: boolean) {
  const tableNames = tables.map(t => t.name).sort();
  const ext = useJsExtensions ? ".js" : "";
  
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

  return `/* Generated. Do not edit. */
import { Hono } from "hono";
import { SDK_MANIFEST } from "./sdk-bundle${ext}";
${imports}
${hasAuth ? `export { authMiddleware } from "./auth${ext}";` : ""}

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
 * // OR using Neon driver (Edge-compatible)
 * import { Pool } from "@neondatabase/serverless";
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
 * const pg = pool; // Pool already has the compatible query method
 * 
 * // Mount all generated routes
 * const app = new Hono();
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
 * import { registerAllRoutes } from "./generated/server/router";
 * 
 * const app = new Hono();
 * 
 * // Setup database connection (see createRouter example for both pg and Neon options)
 * const pg = yourDatabaseClient;
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
export * from "./include-spec${ext}";
`;
}