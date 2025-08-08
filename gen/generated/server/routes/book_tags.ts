/* Generated. Do not edit. */
import { Hono } from "hono";
import { z } from "zod";
import { InsertBookTagsSchema, UpdateBookTagsSchema } from "../zod/book_tags";
import { loadIncludes } from "../include-loader";

const listSchema = z.object({
  include: z.any().optional(),         // TODO: use include graph + two-step loader
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().min(0).optional(),
  orderBy: z.any().optional()          // TODO: typed orderBy in a later pass
});

export function registerBookTagsRoutes(app: Hono, deps: { pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> } }) {
  const base = "/v1/book_tags";

  // CREATE
  app.post(base, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = InsertBookTagsSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.flatten() }, 400);

    const data = parsed.data;
    const cols = Object.keys(data);
    const vals = Object.values(data);
    if (!cols.length) return c.json({ error: "No fields provided" }, 400);

    const placeholders = cols.map((_, i) => '$' + (i + 1)).join(", ");
    const text = `INSERT INTO "book_tags" (${cols.map(c => '"' + c + '"').join(", ")})
                   VALUES (${placeholders})
                   RETURNING *`;
    const { rows } = await deps.pg.query(text, vals);
    return c.json(rows[0] ?? null, rows[0] ? 201 : 500);
  });

  // GET BY PK
  app.get(`${base}/:book_id/:tag_id`, async (c) => {
    const pkValues = [c.req.param("book_id"), c.req.param("tag_id")];
    const text = `SELECT * FROM "book_tags" WHERE "book_id" = $1 AND "tag_id" = $2 LIMIT 1`;
    const { rows } = await deps.pg.query(text, pkValues);
    if (!rows[0]) return c.json(null, 404);
    return c.json(rows[0]);
  });

  // LIST
  app.post(`${base}/list`, async (c) => {
    const body = listSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "Invalid body", issues: body.error.flatten() }, 400);
    const { include, limit = 50, offset = 0 } = body.data;

    const where = "";
    const text = `SELECT * FROM "book_tags" ${where} LIMIT $1 OFFSET $2`;
    const { rows } = await deps.pg.query(text, [limit, offset]);

    // NEW: stitch includes using two-step loader
    const stitched = await loadIncludes("book_tags", rows, include, deps.pg, 3);
    return c.json(stitched);
  });


  // UPDATE
  app.patch(`${base}/:book_id/:tag_id`, async (c) => {
    const pkValues = [c.req.param("book_id"), c.req.param("tag_id")];
    const body = await c.req.json().catch(() => ({}));
    const parsed = UpdateBookTagsSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.flatten() }, 400);

    const updateData = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => !new Set(["book_id","tag_id"]).has(k)));
    if (!Object.keys(updateData).length) return c.json({ error: "No updatable fields provided" }, 400);

    const setSql = Object.keys(updateData).map((k, i) => `"${k}" = $${i + 2 + 1}`).join(", ");
    const text = `UPDATE "book_tags" SET ${setSql} WHERE "book_id" = $1 AND "tag_id" = $2 RETURNING *`;
    const params = [...pkValues, ...Object.values(updateData)];
    const { rows } = await deps.pg.query(text, params);
    if (!rows[0]) return c.json(null, 404);
    return c.json(rows[0]);
  });

  // DELETE (soft or hard)
  app.delete(`${base}/:book_id/:tag_id`, async (c) => {
    const pkValues = [c.req.param("book_id"), c.req.param("tag_id")];
    
    const text = `DELETE FROM "book_tags" WHERE "book_id" = $1 AND "tag_id" = $2 RETURNING *`;
    const { rows } = await deps.pg.query(text, pkValues);
    if (!rows[0]) return c.json(null, 404);
    return c.json(rows[0]);
  });
}
