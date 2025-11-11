/**
 * Emits the core operations module that contains framework-agnostic database logic
 */

export function emitCoreOperations() {
  return `/**
 * Core database operations that are framework-agnostic.
 * These functions handle the actual database logic and can be used by any framework adapter.
 */

import type { z } from "zod";

export interface DatabaseClient {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
}

export interface OperationContext {
  pg: DatabaseClient;
  table: string;
  pkColumns: string[];
  softDeleteColumn?: string | null;
  includeMethodsDepth: number;
}

const DEBUG = process.env.SDK_DEBUG === "1" || process.env.SDK_DEBUG === "true";
const log = {
  debug: (...args: any[]) => { if (DEBUG) console.debug("[sdk]", ...args); },
  error: (...args: any[]) => console.error("[sdk]", ...args),
};

/**
 * CREATE operation - Insert a new record
 */
export async function createRecord(
  ctx: OperationContext,
  data: Record<string, any>
): Promise<{ data?: any; error?: string; issues?: any; status: number }> {
  try {
    const cols = Object.keys(data);
    const vals = Object.values(data);
    
    if (!cols.length) {
      return { error: "No fields provided", status: 400 };
    }

    const placeholders = cols.map((_, i) => '$' + (i + 1)).join(", ");
    const text = \`INSERT INTO "\${ctx.table}" (\${cols.map(c => '"' + c + '"').join(", ")})
                   VALUES (\${placeholders})
                   RETURNING *\`;
    
    log.debug("SQL:", text, "vals:", vals);
    const { rows } = await ctx.pg.query(text, vals);
    
    return { data: rows[0] ?? null, status: rows[0] ? 201 : 500 };
  } catch (e: any) {
    log.error(\`POST \${ctx.table} error:\`, e?.stack ?? e);
    return { 
      error: e?.message ?? "Internal error", 
      ...(DEBUG ? { stack: e?.stack } : {}),
      status: 500 
    };
  }
}

/**
 * READ operation - Get a record by primary key
 */
export async function getByPk(
  ctx: OperationContext,
  pkValues: any[]
): Promise<{ data?: any; error?: string; status: number }> {
  try {
    const hasCompositePk = ctx.pkColumns.length > 1;
    const wherePkSql = hasCompositePk
      ? ctx.pkColumns.map((c, i) => \`"\${c}" = $\${i + 1}\`).join(" AND ")
      : \`"\${ctx.pkColumns[0]}" = $1\`;
    
    const text = \`SELECT * FROM "\${ctx.table}" WHERE \${wherePkSql} LIMIT 1\`;
    log.debug(\`GET \${ctx.table} by PK:\`, pkValues, "SQL:", text);
    
    const { rows } = await ctx.pg.query(text, pkValues);
    
    if (!rows[0]) {
      return { data: null, status: 404 };
    }
    
    return { data: rows[0], status: 200 };
  } catch (e: any) {
    log.error(\`GET \${ctx.table} error:\`, e?.stack ?? e);
    return { 
      error: e?.message ?? "Internal error", 
      ...(DEBUG ? { stack: e?.stack } : {}),
      status: 500 
    };
  }
}

/**
 * LIST operation - Get multiple records with optional filters
 */
export async function listRecords(
  ctx: OperationContext,
  params: { where?: any; limit?: number; offset?: number; include?: any }
): Promise<{ data?: any; error?: string; issues?: any; needsIncludes?: boolean; includeSpec?: any; status: number }> {
  try {
    const { where: whereClause, limit = 50, offset = 0, include } = params;
    
    // Build WHERE clause
    const whereParts: string[] = [];
    const whereParams: any[] = [];
    let paramIndex = 1;
    
    // Add soft delete filter if applicable
    if (ctx.softDeleteColumn) {
      whereParts.push(\`"\${ctx.softDeleteColumn}" IS NULL\`);
    }
    
    // Add user-provided where conditions
    if (whereClause && typeof whereClause === 'object') {
      for (const [key, value] of Object.entries(whereClause)) {
        if (value === undefined) {
          // Skip undefined values
          continue;
        }

        // Handle operator objects like { $gt: 5, $like: "%test%" }
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          for (const [op, opValue] of Object.entries(value)) {
            if (opValue === undefined) continue;

            switch (op) {
              case '$eq':
                whereParts.push(\`"\${key}" = $\${paramIndex}\`);
                whereParams.push(opValue);
                paramIndex++;
                break;
              case '$ne':
                whereParts.push(\`"\${key}" != $\${paramIndex}\`);
                whereParams.push(opValue);
                paramIndex++;
                break;
              case '$gt':
                whereParts.push(\`"\${key}" > $\${paramIndex}\`);
                whereParams.push(opValue);
                paramIndex++;
                break;
              case '$gte':
                whereParts.push(\`"\${key}" >= $\${paramIndex}\`);
                whereParams.push(opValue);
                paramIndex++;
                break;
              case '$lt':
                whereParts.push(\`"\${key}" < $\${paramIndex}\`);
                whereParams.push(opValue);
                paramIndex++;
                break;
              case '$lte':
                whereParts.push(\`"\${key}" <= $\${paramIndex}\`);
                whereParams.push(opValue);
                paramIndex++;
                break;
              case '$in':
                if (Array.isArray(opValue) && opValue.length > 0) {
                  whereParts.push(\`"\${key}" = ANY($\${paramIndex})\`);
                  whereParams.push(opValue);
                  paramIndex++;
                }
                break;
              case '$nin':
                if (Array.isArray(opValue) && opValue.length > 0) {
                  whereParts.push(\`"\${key}" != ALL($\${paramIndex})\`);
                  whereParams.push(opValue);
                  paramIndex++;
                }
                break;
              case '$like':
                whereParts.push(\`"\${key}" LIKE $\${paramIndex}\`);
                whereParams.push(opValue);
                paramIndex++;
                break;
              case '$ilike':
                whereParts.push(\`"\${key}" ILIKE $\${paramIndex}\`);
                whereParams.push(opValue);
                paramIndex++;
                break;
              case '$is':
                if (opValue === null) {
                  whereParts.push(\`"\${key}" IS NULL\`);
                }
                break;
              case '$isNot':
                if (opValue === null) {
                  whereParts.push(\`"\${key}" IS NOT NULL\`);
                }
                break;
            }
          }
        } else if (value === null) {
          // Direct null value
          whereParts.push(\`"\${key}" IS NULL\`);
        } else {
          // Direct value (simple equality)
          whereParts.push(\`"\${key}" = $\${paramIndex}\`);
          whereParams.push(value);
          paramIndex++;
        }
      }
    }
    
    const whereSQL = whereParts.length > 0 ? \`WHERE \${whereParts.join(" AND ")}\` : "";
    
    // Add limit and offset params
    const limitParam = \`$\${paramIndex}\`;
    const offsetParam = \`$\${paramIndex + 1}\`;
    const allParams = [...whereParams, limit, offset];
    
    const text = \`SELECT * FROM "\${ctx.table}" \${whereSQL} LIMIT \${limitParam} OFFSET \${offsetParam}\`;
    log.debug(\`LIST \${ctx.table} SQL:\`, text, "params:", allParams);
    
    const { rows } = await ctx.pg.query(text, allParams);
    
    if (!include) {
      log.debug(\`LIST \${ctx.table} rows:\`, rows.length);
      return { data: rows, status: 200 };
    }
    
    // Include logic will be handled by the include-loader
    // For now, just return the rows with a note that includes need to be applied
    log.debug(\`LIST \${ctx.table} include spec:\`, include);
    return { data: rows, needsIncludes: true, includeSpec: include, status: 200 };
  } catch (e: any) {
    log.error(\`LIST \${ctx.table} error:\`, e?.stack ?? e);
    return { 
      error: e?.message ?? "Internal error", 
      ...(DEBUG ? { stack: e?.stack } : {}),
      status: 500 
    };
  }
}

/**
 * UPDATE operation - Update a record by primary key
 */
export async function updateRecord(
  ctx: OperationContext,
  pkValues: any[],
  updateData: Record<string, any>
): Promise<{ data?: any; error?: string; issues?: any; status: number }> {
  try {
    // Filter out PK columns from update data
    const filteredData = Object.fromEntries(
      Object.entries(updateData).filter(([k]) => !ctx.pkColumns.includes(k))
    );
    
    if (!Object.keys(filteredData).length) {
      return { error: "No updatable fields provided", status: 400 };
    }
    
    const hasCompositePk = ctx.pkColumns.length > 1;
    const wherePkSql = hasCompositePk
      ? ctx.pkColumns.map((c, i) => \`"\${c}" = $\${i + 1}\`).join(" AND ")
      : \`"\${ctx.pkColumns[0]}" = $1\`;
    
    const setSql = Object.keys(filteredData)
      .map((k, i) => \`"\${k}" = $\${i + pkValues.length + 1}\`)
      .join(", ");
    
    const text = \`UPDATE "\${ctx.table}" SET \${setSql} WHERE \${wherePkSql} RETURNING *\`;
    const params = [...pkValues, ...Object.values(filteredData)];
    
    log.debug(\`PATCH \${ctx.table} SQL:\`, text, "params:", params);
    const { rows } = await ctx.pg.query(text, params);
    
    if (!rows[0]) {
      return { data: null, status: 404 };
    }
    
    return { data: rows[0], status: 200 };
  } catch (e: any) {
    log.error(\`PATCH \${ctx.table} error:\`, e?.stack ?? e);
    return { 
      error: e?.message ?? "Internal error", 
      ...(DEBUG ? { stack: e?.stack } : {}),
      status: 500 
    };
  }
}

/**
 * DELETE operation - Delete or soft-delete a record by primary key
 */
export async function deleteRecord(
  ctx: OperationContext,
  pkValues: any[]
): Promise<{ data?: any; error?: string; status: number }> {
  try {
    const hasCompositePk = ctx.pkColumns.length > 1;
    const wherePkSql = hasCompositePk
      ? ctx.pkColumns.map((c, i) => \`"\${c}" = $\${i + 1}\`).join(" AND ")
      : \`"\${ctx.pkColumns[0]}" = $1\`;
    
    const text = ctx.softDeleteColumn
      ? \`UPDATE "\${ctx.table}" SET "\${ctx.softDeleteColumn}" = NOW() WHERE \${wherePkSql} RETURNING *\`
      : \`DELETE FROM "\${ctx.table}" WHERE \${wherePkSql} RETURNING *\`;
    
    log.debug(\`DELETE \${ctx.softDeleteColumn ? '(soft)' : ''} \${ctx.table} SQL:\`, text, "pk:", pkValues);
    const { rows } = await ctx.pg.query(text, pkValues);
    
    if (!rows[0]) {
      return { data: null, status: 404 };
    }
    
    return { data: rows[0], status: 200 };
  } catch (e: any) {
    log.error(\`DELETE \${ctx.table} error:\`, e?.stack ?? e);
    return { 
      error: e?.message ?? "Internal error", 
      ...(DEBUG ? { stack: e?.stack } : {}),
      status: 500 
    };
  }
}`;
}