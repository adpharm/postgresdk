/**
 * Hono-specific route generation that uses core operations
 */

import type { Table } from "./introspect";
import type { Graph } from "./rel-classify";
import { pascal } from "./utils";

export function emitHonoRoutes(
  table: Table,
  _graph: Graph,
  opts: { softDeleteColumn: string | null; includeDepthLimit: number; authStrategy?: string; useJsExtensions?: boolean }
) {
  const fileTableName = table.name;
  const Type = pascal(table.name);
  
  // Normalize pk to an array and fallback to ["id"] if empty
  const rawPk = (table as any).pk;
  const pkCols: string[] = Array.isArray(rawPk) ? rawPk : rawPk ? [rawPk] : [];
  const safePkCols = pkCols.length ? pkCols : ["id"];
  
  const hasCompositePk = safePkCols.length > 1;
  const pkPath = hasCompositePk ? safePkCols.map((c) => `:${c}`).join("/") : `:${safePkCols[0]}`;
  
  const softDel = opts.softDeleteColumn && table.columns.some((c) => c.name === opts.softDeleteColumn) 
    ? opts.softDeleteColumn 
    : null;
  
  const getPkParams = hasCompositePk
    ? `const pkValues = [${safePkCols.map((c) => `c.req.param("${c}")`).join(", ")}];`
    : `const pkValues = [c.req.param("${safePkCols[0]}")];`;
  
  const hasAuth = opts.authStrategy && opts.authStrategy !== "none";
  const ext = opts.useJsExtensions ? ".js" : "";
  const authImport = hasAuth ? `import { authMiddleware } from "../auth${ext}";` : "";
  
  return `/* Generated. Do not edit. */
import { Hono } from "hono";
import { z } from "zod";
import { Insert${Type}Schema, Update${Type}Schema } from "../zod/${fileTableName}${ext}";
import { loadIncludes } from "../include-loader${ext}";
import * as coreOps from "../core/operations${ext}";
${authImport}

const listSchema = z.object({
  include: z.any().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().min(0).optional(),
  orderBy: z.any().optional()
});

export function register${Type}Routes(app: Hono, deps: { pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> } }) {
  const base = "/v1/${fileTableName}";
  
  // Create operation context
  const ctx: coreOps.OperationContext = {
    pg: deps.pg,
    table: "${fileTableName}",
    pkColumns: ${JSON.stringify(safePkCols)},
    softDeleteColumn: ${softDel ? `"${softDel}"` : "null"},
    includeDepthLimit: ${opts.includeDepthLimit}
  };
${hasAuth ? `
  // 🔐 Auth: protect all routes for this table
  app.use(base, authMiddleware);
  app.use(\`\${base}/*\`, authMiddleware);` : ""}

  // CREATE
  app.post(base, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = Insert${Type}Schema.safeParse(body);
    
    if (!parsed.success) {
      const issues = parsed.error.flatten();
      return c.json({ error: "Invalid body", issues }, 400);
    }
    
    const result = await coreOps.createRecord(ctx, parsed.data);
    
    if (result.error) {
      return c.json({ error: result.error }, result.status as any);
    }
    
    return c.json(result.data, result.status as any);
  });

  // GET BY PK
  app.get(\`\${base}/${pkPath}\`, async (c) => {
    ${getPkParams}
    const result = await coreOps.getByPk(ctx, pkValues);
    
    if (result.error) {
      return c.json({ error: result.error }, result.status as any);
    }
    
    return c.json(result.data, result.status as any);
  });

  // LIST
  app.post(\`\${base}/list\`, async (c) => {
    const body = listSchema.safeParse(await c.req.json().catch(() => ({})));
    
    if (!body.success) {
      const issues = body.error.flatten();
      return c.json({ error: "Invalid body", issues }, 400);
    }
    
    const result = await coreOps.listRecords(ctx, body.data);
    
    if (result.error) {
      return c.json({ error: result.error }, result.status as any);
    }
    
    // Handle includes if needed
    if (result.needsIncludes && result.includeSpec) {
      try {
        const stitched = await loadIncludes(
          "${fileTableName}", 
          result.data, 
          result.includeSpec, 
          deps.pg, 
          ${opts.includeDepthLimit}
        );
        return c.json(stitched);
      } catch (e: any) {
        const strict = process.env.SDK_STRICT_INCLUDE === "1";
        if (strict) {
          return c.json({ 
            error: "include-stitch-failed", 
            message: e?.message,
            ...(process.env.SDK_DEBUG === "1" ? { stack: e?.stack } : {})
          }, 500);
        }
        // Non-strict: return base rows with error metadata
        return c.json({ 
          data: result.data, 
          includeError: { 
            message: e?.message,
            ...(process.env.SDK_DEBUG === "1" ? { stack: e?.stack } : {})
          }
        }, 200);
      }
    }
    
    return c.json(result.data, result.status as any);
  });

  // UPDATE
  app.patch(\`\${base}/${pkPath}\`, async (c) => {
    ${getPkParams}
    const body = await c.req.json().catch(() => ({}));
    const parsed = Update${Type}Schema.safeParse(body);
    
    if (!parsed.success) {
      const issues = parsed.error.flatten();
      return c.json({ error: "Invalid body", issues }, 400);
    }
    
    const result = await coreOps.updateRecord(ctx, pkValues, parsed.data);
    
    if (result.error) {
      return c.json({ error: result.error }, result.status as any);
    }
    
    return c.json(result.data, result.status as any);
  });

  // DELETE
  app.delete(\`\${base}/${pkPath}\`, async (c) => {
    ${getPkParams}
    const result = await coreOps.deleteRecord(ctx, pkValues);
    
    if (result.error) {
      return c.json({ error: result.error }, result.status as any);
    }
    
    return c.json(result.data, result.status as any);
  });
}
`;
}