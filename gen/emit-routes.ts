import type { Table } from "./introspect";
import type { Graph } from "./rel-classify";
import { pascal } from "./utils";

/**
 * Emits a Hono router for one table, using generated Zod schemas.
 *
 * Expects:
 *   - Generated file at ../zod/<table>.ts exporting Insert<Type>Schema & Update<Type>Schema
 *   - deps: { pg: Pool | Client } with .query(text, params)
 *
 * Endpoints:
 *   POST   /v1/<table>           create (Insert<Type>Schema)
 *   GET    /v1/<table>/:...pk    get by pk
 *   POST   /v1/<table>/list      list (limit/offset; includes TODO)
 *   PATCH  /v1/<table>/:...pk    update (Update<Type>Schema)
 *   DELETE /v1/<table>/:...pk    delete (or soft-delete)
 */
export function emitRoutes(
  table: Table,
  _graph: Graph,
  opts: { softDeleteColumn: string | null; includeDepthLimit: number }
) {
  const fileTableName = table.name; // SQL table name for file/route
  const Type = pascal(table.name); // PascalCase for type/schemas
  const pkCols = table.pk;
  const hasCompositePk = pkCols.length > 1;
  const pkPath = hasCompositePk ? pkCols.map((c) => `:${c}`).join("/") : `:${pkCols[0] || "id"}`;

  const softDel =
    opts.softDeleteColumn && table.columns.some((c) => c.name === opts.softDeleteColumn) ? opts.softDeleteColumn : null;

  const wherePkSql = hasCompositePk
    ? pkCols.map((c, i) => `"${c}" = $${i + 1}`).join(" AND ")
    : `"${pkCols[0] || "id"}" = $1`;

  const getPkParams = hasCompositePk
    ? `const pkValues = [${pkCols.map((c) => `c.req.param("${c}")`).join(", ")}];`
    : `const pkValues = [c.req.param("${pkCols[0] || "id"}")];`;

  // Build SET clause indices for UPDATE (PK params first, then update values)
  const updateSetSql = hasCompositePk
    ? `Object.keys(updateData).map((k, i) => \`"\${k}" = $\${i + ${pkCols.length} + 1}\`).join(", ")`
    : `Object.keys(updateData).map((k, i) => \`"\${k}" = $\${i + 2}\`).join(", ")`;

  // Prevent updating PK columns
  const pkFilter = pkCols.length
    ? `const updateData = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => !new Set(${JSON.stringify(
        pkCols
      )}).has(k)));`
    : `const updateData = parsed.data;`;

  return `/* Generated. Do not edit. */
import { Hono } from "hono";
import { z } from "zod";
import { Insert${Type}Schema, Update${Type}Schema } from "../zod/${fileTableName}";
import { loadIncludes } from "../include-loader";

const listSchema = z.object({
  include: z.any().optional(),         // TODO: use include graph + two-step loader
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().min(0).optional(),
  orderBy: z.any().optional()          // TODO: typed orderBy in a later pass
});

export function register${Type}Routes(app: Hono, deps: { pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> } }) {
  const base = "/v1/${fileTableName}";

  // CREATE
  app.post(base, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = Insert${Type}Schema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.flatten() }, 400);

    const data = parsed.data;
    const cols = Object.keys(data);
    const vals = Object.values(data);
    if (!cols.length) return c.json({ error: "No fields provided" }, 400);

    const placeholders = cols.map((_, i) => '$' + (i + 1)).join(", ");
    const text = \`INSERT INTO "${fileTableName}" (\${cols.map(c => '"' + c + '"').join(", ")})
                   VALUES (\${placeholders})
                   RETURNING *\`;
    const { rows } = await deps.pg.query(text, vals);
    return c.json(rows[0] ?? null, rows[0] ? 201 : 500);
  });

  // GET BY PK
  app.get(\`\${base}/${pkPath}\`, async (c) => {
    ${getPkParams}
    const text = \`SELECT * FROM "${fileTableName}" WHERE ${wherePkSql} LIMIT 1\`;
    const { rows } = await deps.pg.query(text, pkValues);
    if (!rows[0]) return c.json(null, 404);
    return c.json(rows[0]);
  });

  // LIST
  app.post(\`\${base}/list\`, async (c) => {
    const body = listSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "Invalid body", issues: body.error.flatten() }, 400);
    const { include, limit = 50, offset = 0 } = body.data;

    const where = ${softDel ? `\`WHERE "${softDel}" IS NULL\`` : `""`};
    const text = \`SELECT * FROM "${fileTableName}" \${where} LIMIT $1 OFFSET $2\`;
    const { rows } = await deps.pg.query(text, [limit, offset]);

    // NEW: stitch includes using two-step loader
    const stitched = await loadIncludes("${fileTableName}", rows, include, deps.pg, ${opts.includeDepthLimit});
    return c.json(stitched);
  });


  // UPDATE
  app.patch(\`\${base}/${pkPath}\`, async (c) => {
    ${getPkParams}
    const body = await c.req.json().catch(() => ({}));
    const parsed = Update${Type}Schema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.flatten() }, 400);

    ${pkFilter}
    if (!Object.keys(updateData).length) return c.json({ error: "No updatable fields provided" }, 400);

    const setSql = ${updateSetSql};
    const text = \`UPDATE "${fileTableName}" SET \${setSql} WHERE ${wherePkSql} RETURNING *\`;
    const params = ${
      hasCompositePk ? `[...pkValues, ...Object.values(updateData)]` : `[pkValues[0], ...Object.values(updateData)]`
    };
    const { rows } = await deps.pg.query(text, params);
    if (!rows[0]) return c.json(null, 404);
    return c.json(rows[0]);
  });

  // DELETE (soft or hard)
  app.delete(\`\${base}/${pkPath}\`, async (c) => {
    ${getPkParams}
    ${
      softDel
        ? `
    const text = \`UPDATE "${fileTableName}" SET "${softDel}" = NOW() WHERE ${wherePkSql} RETURNING *\`;
    const { rows } = await deps.pg.query(text, pkValues);
    if (!rows[0]) return c.json(null, 404);
    return c.json(rows[0]);`
        : `
    const text = \`DELETE FROM "${fileTableName}" WHERE ${wherePkSql} RETURNING *\`;
    const { rows } = await deps.pg.query(text, pkValues);
    if (!rows[0]) return c.json(null, 404);
    return c.json(rows[0]);`
    }
  });
}
`;
}
