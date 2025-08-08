/* Generated. Do not edit. */
import { Hono } from "hono";
import { z } from "zod";
import { InsertBooksSchema, UpdateBooksSchema } from "../zod/books";
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

export function registerBooksRoutes(app: Hono, deps: { pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> } }) {
  const base = "/v1/books";

  // CREATE
  app.post(base, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      log.debug("POST books body:", body);
      const parsed = InsertBooksSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.flatten();
        log.debug("POST books invalid:", issues);
        return c.json({ error: "Invalid body", issues }, 400);
      }

      const data = parsed.data;
      const cols = Object.keys(data);
      const vals = Object.values(data);
      if (!cols.length) return c.json({ error: "No fields provided" }, 400);

      const placeholders = cols.map((_, i) => '$' + (i + 1)).join(", ");
      const text = `INSERT INTO "books" (${cols.map(c => '"' + c + '"').join(", ")})
                     VALUES (${placeholders})
                     RETURNING *`;
      log.debug("SQL:", text, "vals:", vals);
      const { rows } = await deps.pg.query(text, vals);
      return c.json(rows[0] ?? null, rows[0] ? 201 : 500);
    } catch (e: any) {
      log.error("POST books error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });

  // GET BY PK
  app.get(`${base}/:id`, async (c) => {
    try {
      const pkValues = [c.req.param("id")];
      const text = `SELECT * FROM "books" WHERE "id" = $1 LIMIT 1`;
      log.debug("GET books by PK:", pkValues, "SQL:", text);
      const { rows } = await deps.pg.query(text, pkValues);
      if (!rows[0]) return c.json(null, 404);
      return c.json(rows[0]);
    } catch (e: any) {
      log.error("GET books error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });

  // LIST
  app.post(`${base}/list`, async (c) => {
    try {
      const body = listSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!body.success) {
        const issues = body.error.flatten();
        log.debug("LIST books invalid:", issues);
        return c.json({ error: "Invalid body", issues }, 400);
      }
      const { include, limit = 50, offset = 0 } = body.data;

      const where = "";
      const text = `SELECT * FROM "books" ${where} LIMIT $1 OFFSET $2`;
      log.debug("LIST books SQL:", text, "params:", [limit, offset]);
      const { rows } = await deps.pg.query(text, [limit, offset]);

      if (!include) {
        log.debug("LIST books rows:", rows.length);
        return c.json(rows);
      }

      // Attempt include stitching with explicit error handling
      log.debug("LIST books include spec:", include);
      try {
        const stitched = await loadIncludes("books", rows, include, deps.pg, 3);
        log.debug("LIST books stitched count:", Array.isArray(stitched) ? stitched.length : "n/a");
        return c.json(stitched);
      } catch (e: any) {
        const strict = process.env.SDK_STRICT_INCLUDE === "1" || process.env.SDK_STRICT_INCLUDE === "true";
        const msg = e?.message ?? String(e);
        const stack = e?.stack;
        log.error("LIST books include stitch FAILED:", msg, stack);

        if (strict) {
          return c.json({ error: "include-stitch-failed", message: msg, ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
        }
        // Non-strict fallback: return base rows plus error metadata
        return c.json({ data: rows, includeError: { message: msg, ...(DEBUG ? { stack: e?.stack } : {}) } }, 200);
      }
    } catch (e: any) {
      log.error("LIST books error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });

  // UPDATE
  app.patch(`${base}/:id`, async (c) => {
    try {
      const pkValues = [c.req.param("id")];
      const body = await c.req.json().catch(() => ({}));
      log.debug("PATCH books pk:", pkValues, "patch:", body);
      const parsed = UpdateBooksSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.flatten();
        log.debug("PATCH books invalid:", issues);
        return c.json({ error: "Invalid body", issues: issues }, 400);
      }

      const updateData = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => !new Set(["id"]).has(k)));
      if (!Object.keys(updateData).length) return c.json({ error: "No updatable fields provided" }, 400);

      const setSql = Object.keys(updateData).map((k, i) => `"${k}" = $${i + 2}`).join(", ");
      const text = `UPDATE "books" SET ${setSql} WHERE "id" = $1 RETURNING *`;
      const params = [pkValues[0], ...Object.values(updateData)];
      log.debug("PATCH books SQL:", text, "params:", params);
      const { rows } = await deps.pg.query(text, params);
      if (!rows[0]) return c.json(null, 404);
      return c.json(rows[0]);
    } catch (e: any) {
      log.error("PATCH books error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });

  // DELETE (soft or hard)
  app.delete(`${base}/:id`, async (c) => {
    try {
      const pkValues = [c.req.param("id")];
      
      const text = `DELETE FROM "books" WHERE "id" = $1 RETURNING *`;
      log.debug("DELETE books SQL:", text, "pk:", pkValues);
      const { rows } = await deps.pg.query(text, pkValues);
      if (!rows[0]) return c.json(null, 404);
      return c.json(rows[0]);
    } catch (e: any) {
      log.error("DELETE books error:", e?.stack ?? e);
      return c.json({ error: e?.message ?? "Internal error", ...(DEBUG ? { stack: e?.stack } : {}) }, 500);
    }
  });
}
