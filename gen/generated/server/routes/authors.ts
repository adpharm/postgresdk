/* Generated. Do not edit. */
import { Hono } from "hono";
import { z } from "zod";
import { InsertAuthorsSchema, UpdateAuthorsSchema } from "../zod/authors";
import { loadIncludes } from "../include-loader";

const DEBUG = process.env.SDK_DEBUG === "1" || process.env.SDK_DEBUG === "true";
const log = {
  debug: (...args: any[]) => { if (DEBUG) console.debug("[sdk]", ...args); },
  error: (...args: any[]) => console.error("[sdk]", ...args),
};

const listSchema = z.object({
  include: z.any().optional(),         // TODO: typed include spec in later pass
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().min(0).optional(),
  orderBy: z.any().optional()          // TODO: typed orderBy in a later pass
});

export function registerAuthorsRoutes(app: Hono, deps: { pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> } }) {
  const base = "/v1/authors";

  // CREATE
  app.post(base, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      log.debug("POST authors body:", body);
      const parsed = InsertAuthorsSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.flatten();
        log.debug("POST authors invalid:", issues);
        return c.json({ error: "Invalid body", issues }, 400);
      }

      const data = parsed.data;
      const cols = Object.keys(data);
      const vals = Object.values(data);
      if (!cols.length) return c.json({ error: "No fields provided" }, 400);

      const placeholders = cols.map((_, i) => '$' + (i + 1)).join(", ");
      const text = `INSERT INTO "authors" (${cols.map(c => '"' + c + '"').join(", ")})
                     VALUES (${placeholders})
                     RETURNING *`;
      log.debug("SQL:", text, "vals:", vals);
      const { rows } = await deps.pg.query(text, vals);
      return c.json(rows[0] ?? null, rows[0] ? 201 : 500);
    } catch (e: any) {
      log.error("POST authors error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });

  // GET BY PK
  app.get(`${base}/:id`, async (c) => {
    try {
      const pkValues = [c.req.param("id")];
      const text = `SELECT * FROM "authors" WHERE "id" = $1 LIMIT 1`;
      log.debug("GET authors by PK:", pkValues, "SQL:", text);
      const { rows } = await deps.pg.query(text, pkValues);
      if (!rows[0]) return c.json(null, 404);
      return c.json(rows[0]);
    } catch (e: any) {
      log.error("GET authors error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });

  // LIST
  app.post(`${base}/list`, async (c) => {
    try {
      const body = listSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!body.success) {
        const issues = body.error.flatten();
        log.debug("LIST authors invalid:", issues);
        return c.json({ error: "Invalid body", issues }, 400);
      }
      const { include, limit = 50, offset = 0 } = body.data;

      const where = "";
      const text = `SELECT * FROM "authors" ${where} LIMIT $1 OFFSET $2`;
      log.debug("LIST authors SQL:", text, "params:", [limit, offset]);
      const { rows } = await deps.pg.query(text, [limit, offset]);

      if (!include) {
        log.debug("LIST authors rows:", rows.length);
        return c.json(rows);
      }

      // Attempt include stitching with explicit error handling
      log.debug("LIST authors include spec:", include);
      try {
        const stitched = await loadIncludes("authors", rows, include, deps.pg, 3);
        log.debug("LIST authors stitched count:", Array.isArray(stitched) ? stitched.length : "n/a");
        return c.json(stitched);
      } catch (e: any) {
        const strict = process.env.SDK_STRICT_INCLUDE === "1" || process.env.SDK_STRICT_INCLUDE === "true";
        const msg = e?.message ?? String(e);
        const stack = e?.stack;
        log.error("LIST authors include stitch FAILED:", msg, stack);

        if (strict) {
          return c.json({ error: "include-stitch-failed", message: msg, ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
        }
        // Non-strict fallback: return base rows plus error metadata
        return c.json({ data: rows, includeError: { message: msg, ...(DEBUG ? { stack: e?.stack } : {}) } }, 200);
      }
    } catch (e: any) {
      log.error("LIST authors error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });

  // UPDATE
  app.patch(`${base}/:id`, async (c) => {
    try {
      const pkValues = [c.req.param("id")];
      const body = await c.req.json().catch(() => ({}));
      log.debug("PATCH authors pk:", pkValues, "patch:", body);
      const parsed = UpdateAuthorsSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.flatten();
        log.debug("PATCH authors invalid:", issues);
        return c.json({ error: "Invalid body", issues: issues }, 400);
      }

      const updateData = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => !new Set(["id"]).has(k)));
      if (!Object.keys(updateData).length) return c.json({ error: "No updatable fields provided" }, 400);

      const setSql = Object.keys(updateData).map((k, i) => `"${k}" = $${i + 2}`).join(", ");
      const text = `UPDATE "authors" SET ${setSql} WHERE "id" = $1 RETURNING *`;
      const params = [pkValues[0], ...Object.values(updateData)];
      log.debug("PATCH authors SQL:", text, "params:", params);
      const { rows } = await deps.pg.query(text, params);
      if (!rows[0]) return c.json(null, 404);
      return c.json(rows[0]);
    } catch (e: any) {
      log.error("PATCH authors error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });

  // DELETE (soft or hard)
  app.delete(`${base}/:id`, async (c) => {
    try {
      const pkValues = [c.req.param("id")];
      
      const text = `DELETE FROM "authors" WHERE "id" = $1 RETURNING *`;
      log.debug("DELETE authors SQL:", text, "pk:", pkValues);
      const { rows } = await deps.pg.query(text, pkValues);
      if (!rows[0]) return c.json(null, 404);
      return c.json(rows[0]);
    } catch (e: any) {
      log.error("DELETE authors error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });
}
