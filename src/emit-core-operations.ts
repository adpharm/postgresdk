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
  vectorColumns?: string[];
  allColumnNames?: string[];
  select?: string[];
  exclude?: string[];
}

const DEBUG = process.env.SDK_DEBUG === "1" || process.env.SDK_DEBUG === "true";
const log = {
  debug: (...args: any[]) => { if (DEBUG) console.debug("[sdk]", ...args); },
  error: (...args: any[]) => console.error("[sdk]", ...args),
};

/**
 * Builds SQL column list from select/exclude parameters
 * @param select - Columns to include (mutually exclusive with exclude)
 * @param exclude - Columns to exclude (mutually exclusive with select)
 * @param allColumns - All available columns for the table
 * @param alwaysInclude - Columns to always include (e.g., vector distance)
 * @returns SQL column list string (e.g., "id", "name", "email")
 */
function buildColumnList(
  select: string[] | undefined,
  exclude: string[] | undefined,
  allColumns: string[] | undefined,
  alwaysInclude: string[] = []
): string {
  if (select && exclude) {
    throw new Error("Cannot specify both 'select' and 'exclude' parameters");
  }

  // If no allColumns provided, fallback to *
  if (!allColumns || allColumns.length === 0) {
    return "*";
  }

  let columns: string[];

  if (select) {
    // Use only selected columns
    columns = select;
  } else if (exclude) {
    // Use all except excluded
    columns = allColumns.filter(col => !exclude.includes(col));
  } else {
    // Use all columns (default behavior)
    return "*";
  }

  // Add always-include columns (e.g., _distance for vector search)
  const finalColumns = [...new Set([...columns, ...alwaysInclude])];

  // Quote column names and join
  return finalColumns.map(col => \`"\${col}"\`).join(", ");
}

/**
 * Prepare query parameters for PostgreSQL.
 * The pg library should handle JSONB automatically, but there are edge cases
 * where explicit stringification is needed (e.g., certain pg versions or when
 * objects have been through serialization/deserialization).
 */
function prepareParams(params: any[]): any[] {
  return params.map(p => {
    if (p === null || p === undefined) return p;
    // Stringify objects/arrays for JSONB - while pg should handle this automatically,
    // we've observed cases where it fails without explicit stringification
    if (typeof p === 'object') return JSON.stringify(p);
    return p;
  });
}

/**
 * Parse vector columns in retrieved rows.
 * pgvector returns vectors as strings (e.g., "[1.5,2.5,3.5]") which need to be
 * parsed back to number[] to match TypeScript types.
 */
function parseVectorColumns(rows: any[], vectorColumns?: string[]): any[] {
  if (!vectorColumns || vectorColumns.length === 0) return rows;

  return rows.map(row => {
    const parsed = { ...row };
    for (const col of vectorColumns) {
      if (parsed[col] !== null && parsed[col] !== undefined && typeof parsed[col] === 'string') {
        try {
          parsed[col] = JSON.parse(parsed[col]);
        } catch (e) {
          // If parsing fails, leave as string (shouldn't happen with valid vectors)
          log.error(\`Failed to parse vector column "\${col}":, e\`);
        }
      }
    }
    return parsed;
  });
}

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
    const returningClause = buildColumnList(ctx.select, ctx.exclude, ctx.allColumnNames);
    const text = \`INSERT INTO "\${ctx.table}" (\${cols.map(c => '"' + c + '"').join(", ")})
                   VALUES (\${placeholders})
                   RETURNING \${returningClause}\`;

    log.debug("SQL:", text, "vals:", vals);
    const { rows } = await ctx.pg.query(text, prepareParams(vals));
    const parsedRows = parseVectorColumns(rows, ctx.vectorColumns);

    return { data: parsedRows[0] ?? null, status: parsedRows[0] ? 201 : 500 };
  } catch (e: any) {
    // Enhanced logging for JSON validation errors
    const errorMsg = e?.message ?? "";
    const isJsonError = errorMsg.includes("invalid input syntax for type json");

    if (isJsonError) {
      log.error(\`POST \${ctx.table} - Invalid JSON input detected!\`);
      log.error("Input data that caused error:", JSON.stringify(data, null, 2));
      log.error("PostgreSQL error:", errorMsg);
    } else {
      log.error(\`POST \${ctx.table} error:\`, e?.stack ?? e);
    }

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

    const columns = buildColumnList(ctx.select, ctx.exclude, ctx.allColumnNames);
    const text = \`SELECT \${columns} FROM "\${ctx.table}" WHERE \${wherePkSql} LIMIT 1\`;
    log.debug(\`GET \${ctx.table} by PK:\`, pkValues, "SQL:", text);

    const { rows } = await ctx.pg.query(text, prepareParams(pkValues));
    const parsedRows = parseVectorColumns(rows, ctx.vectorColumns);

    if (!parsedRows[0]) {
      return { data: null, status: 404 };
    }

    return { data: parsedRows[0], status: 200 };
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
 * Build WHERE clause recursively, supporting $or/$and operators
 * Returns { sql: string, params: any[], nextParamIndex: number }
 */
function buildWhereClause(
  whereClause: any,
  startParamIndex: number
): { sql: string; params: any[]; nextParamIndex: number } {
  const whereParts: string[] = [];
  const whereParams: any[] = [];
  let paramIndex = startParamIndex;

  if (!whereClause || typeof whereClause !== 'object') {
    return { sql: '', params: [], nextParamIndex: paramIndex };
  }

  // Separate logical operators from field conditions
  const { $or, $and, ...fieldConditions } = whereClause;

  // Process field-level conditions
  for (const [key, value] of Object.entries(fieldConditions)) {
    if (value === undefined) {
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
            if (Array.isArray(opValue)) {
              if (opValue.length > 0) {
                whereParts.push(\`"\${key}" = ANY($\${paramIndex})\`);
                whereParams.push(opValue);
                paramIndex++;
              } else {
                // Empty $in is logically FALSE - matches nothing
                whereParts.push('FALSE');
              }
            }
            break;
          case '$nin':
            if (Array.isArray(opValue)) {
              if (opValue.length > 0) {
                whereParts.push(\`"\${key}" != ALL($\${paramIndex})\`);
                whereParams.push(opValue);
                paramIndex++;
              } else {
                // Empty $nin is logically TRUE - matches everything (but we still need a condition)
                // This is handled by simply not adding a condition
              }
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
          case '$jsonbContains':
            whereParts.push(\`"\${key}" @> $\${paramIndex}\`);
            whereParams.push(JSON.stringify(opValue));
            paramIndex++;
            break;
          case '$jsonbContainedBy':
            whereParts.push(\`"\${key}" <@ $\${paramIndex}\`);
            whereParams.push(JSON.stringify(opValue));
            paramIndex++;
            break;
          case '$jsonbHasKey':
            whereParts.push(\`"\${key}" ? $\${paramIndex}\`);
            whereParams.push(opValue);
            paramIndex++;
            break;
          case '$jsonbHasAnyKeys':
            if (Array.isArray(opValue) && opValue.length > 0) {
              whereParts.push(\`"\${key}" ?| $\${paramIndex}\`);
              whereParams.push(opValue);
              paramIndex++;
            }
            break;
          case '$jsonbHasAllKeys':
            if (Array.isArray(opValue) && opValue.length > 0) {
              whereParts.push(\`"\${key}" ?& $\${paramIndex}\`);
              whereParams.push(opValue);
              paramIndex++;
            }
            break;
          case '$jsonbPath':
            const pathConfig = opValue;
            const pathKeys = pathConfig.path;
            const pathOperator = pathConfig.operator || '$eq';
            const pathValue = pathConfig.value;

            if (!Array.isArray(pathKeys) || pathKeys.length === 0) {
              break;
            }

            // Build path accessor: metadata->'user'->'preferences'->>'theme'
            // Use -> for all keys except the last one, use ->> for the last to get text
            const pathParts = pathKeys.slice(0, -1);
            const lastKey = pathKeys[pathKeys.length - 1];

            let pathExpr = \`"\${key}"\`;
            for (const part of pathParts) {
              pathExpr += \`->'\${part}'\`;
            }
            pathExpr += \`->>'\${lastKey}'\`;

            // Apply the operator
            switch (pathOperator) {
              case '$eq':
                whereParts.push(\`\${pathExpr} = $\${paramIndex}\`);
                whereParams.push(String(pathValue));
                paramIndex++;
                break;
              case '$ne':
                whereParts.push(\`\${pathExpr} != $\${paramIndex}\`);
                whereParams.push(String(pathValue));
                paramIndex++;
                break;
              case '$gt':
                whereParts.push(\`(\${pathExpr})::numeric > $\${paramIndex}\`);
                whereParams.push(pathValue);
                paramIndex++;
                break;
              case '$gte':
                whereParts.push(\`(\${pathExpr})::numeric >= $\${paramIndex}\`);
                whereParams.push(pathValue);
                paramIndex++;
                break;
              case '$lt':
                whereParts.push(\`(\${pathExpr})::numeric < $\${paramIndex}\`);
                whereParams.push(pathValue);
                paramIndex++;
                break;
              case '$lte':
                whereParts.push(\`(\${pathExpr})::numeric <= $\${paramIndex}\`);
                whereParams.push(pathValue);
                paramIndex++;
                break;
              case '$like':
                whereParts.push(\`\${pathExpr} LIKE $\${paramIndex}\`);
                whereParams.push(pathValue);
                paramIndex++;
                break;
              case '$ilike':
                whereParts.push(\`\${pathExpr} ILIKE $\${paramIndex}\`);
                whereParams.push(pathValue);
                paramIndex++;
                break;
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

  // Handle $or operator
  if ($or && Array.isArray($or)) {
    if ($or.length === 0) {
      // Empty OR is logically FALSE - matches nothing
      whereParts.push('FALSE');
    } else {
      const orParts: string[] = [];
      for (const orCondition of $or) {
        const result = buildWhereClause(orCondition, paramIndex);
        if (result.sql) {
          orParts.push(result.sql);
          whereParams.push(...result.params);
          paramIndex = result.nextParamIndex;
        }
      }
      if (orParts.length > 0) {
        whereParts.push(\`(\${orParts.join(' OR ')})\`);
      }
    }
  }

  // Handle $and operator
  if ($and && Array.isArray($and) && $and.length > 0) {
    const andParts: string[] = [];
    for (const andCondition of $and) {
      const result = buildWhereClause(andCondition, paramIndex);
      if (result.sql) {
        andParts.push(result.sql);
        whereParams.push(...result.params);
        paramIndex = result.nextParamIndex;
      }
    }
    if (andParts.length > 0) {
      whereParts.push(\`(\${andParts.join(' AND ')})\`);
    }
  }

  const sql = whereParts.join(' AND ');
  return { sql, params: whereParams, nextParamIndex: paramIndex };
}

/**
 * Get distance operator for vector similarity search
 */
function getVectorDistanceOperator(metric?: string): string {
  switch (metric) {
    case "l2":
      return "<->";
    case "inner":
      return "<#>";
    case "cosine":
    default:
      return "<=>";
  }
}

/**
 * LIST operation - Get multiple records with optional filters and vector search
 */
export async function listRecords(
  ctx: OperationContext,
  params: {
    where?: any;
    limit?: number;
    offset?: number;
    include?: any;
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };
  }
): Promise<{ data?: any; total?: number; limit?: number; offset?: number; hasMore?: boolean; error?: string; issues?: any; needsIncludes?: boolean; includeSpec?: any; status: number }> {
  try {
    const { where: whereClause, limit = 50, offset = 0, include, orderBy, order, vector } = params;

    // Get distance operator if vector search
    const distanceOp = vector ? getVectorDistanceOperator(vector.metric) : "";

    // Add vector to params array if present
    const queryParams: any[] = vector ? [JSON.stringify(vector.query)] : [];

    // Build WHERE clause for SELECT/UPDATE queries (with vector as $1 if present)
    let paramIndex = vector ? 2 : 1;
    const whereParts: string[] = [];
    let whereParams: any[] = [];

    // Add soft delete filter if applicable
    if (ctx.softDeleteColumn) {
      whereParts.push(\`"\${ctx.softDeleteColumn}" IS NULL\`);
    }

    // Add user-provided where conditions
    if (whereClause) {
      const result = buildWhereClause(whereClause, paramIndex);
      if (result.sql) {
        whereParts.push(result.sql);
        whereParams = result.params;
        paramIndex = result.nextParamIndex;
      }
    }

    // Add vector distance threshold filter if specified
    if (vector?.maxDistance !== undefined) {
      whereParts.push(\`("\${vector.field}" \${distanceOp} ($1)::vector) < \${vector.maxDistance}\`);
    }

    const whereSQL = whereParts.length > 0 ? \`WHERE \${whereParts.join(" AND ")}\` : "";

    // Build WHERE clause for COUNT query (may need different param indices)
    let countWhereSQL = whereSQL;
    let countParams = whereParams;

    if (vector && vector.maxDistance === undefined && whereParams.length > 0) {
      // COUNT query doesn't use vector, so rebuild WHERE without vector offset
      const countWhereParts: string[] = [];
      if (ctx.softDeleteColumn) {
        countWhereParts.push(\`"\${ctx.softDeleteColumn}" IS NULL\`);
      }
      if (whereClause) {
        const result = buildWhereClause(whereClause, 1); // Start at $1 for count
        if (result.sql) {
          countWhereParts.push(result.sql);
          countParams = result.params;
        }
      }
      countWhereSQL = countWhereParts.length > 0 ? \`WHERE \${countWhereParts.join(" AND ")}\` : "";
    } else if (vector?.maxDistance !== undefined) {
      // COUNT query includes vector for maxDistance filter
      countParams = [...queryParams, ...whereParams];
    }

    // Build SELECT clause
    const baseColumns = buildColumnList(ctx.select, ctx.exclude, ctx.allColumnNames);
    const selectClause = vector
      ? \`\${baseColumns}, ("\${vector.field}" \${distanceOp} ($1)::vector) AS _distance\`
      : baseColumns;

    // Build ORDER BY clause
    let orderBySQL = "";
    if (vector) {
      // For vector search, always order by distance
      orderBySQL = \`ORDER BY "\${vector.field}" \${distanceOp} ($1)::vector\`;
    } else if (orderBy) {
      const columns = Array.isArray(orderBy) ? orderBy : [orderBy];
      const directions = Array.isArray(order) ? order : (order ? Array(columns.length).fill(order) : Array(columns.length).fill("asc"));

      const orderParts = columns.map((col, i) => {
        const dir = (directions[i] || "asc").toUpperCase();
        return \`"\${col}" \${dir}\`;
      });

      orderBySQL = \`ORDER BY \${orderParts.join(", ")}\`;
    }

    // Add limit and offset params
    const limitParam = \`$\${paramIndex}\`;
    const offsetParam = \`$\${paramIndex + 1}\`;
    const allParams = [...queryParams, ...whereParams, limit, offset];

    // Get total count for pagination
    const countText = \`SELECT COUNT(*) FROM "\${ctx.table}" \${countWhereSQL}\`;
    log.debug(\`LIST \${ctx.table} COUNT SQL:\`, countText, "params:", countParams);
    const countResult = await ctx.pg.query(countText, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated data
    const text = \`SELECT \${selectClause} FROM "\${ctx.table}" \${whereSQL} \${orderBySQL} LIMIT \${limitParam} OFFSET \${offsetParam}\`;
    log.debug(\`LIST \${ctx.table} SQL:\`, text, "params:", allParams);

    const { rows } = await ctx.pg.query(text, allParams);
    const parsedRows = parseVectorColumns(rows, ctx.vectorColumns);

    // Calculate hasMore
    const hasMore = offset + limit < total;

    const metadata = {
      data: parsedRows,
      total,
      limit,
      offset,
      hasMore,
      needsIncludes: !!include,
      includeSpec: include,
      status: 200
    };

    log.debug(\`LIST \${ctx.table} result: \${rows.length} rows, \${total} total, hasMore=\${hasMore}\`);
    return metadata;
  } catch (e: any) {
    // Enhanced logging for JSON validation errors
    const errorMsg = e?.message ?? "";
    const isJsonError = errorMsg.includes("invalid input syntax for type json");

    if (isJsonError) {
      log.error(\`LIST \${ctx.table} - Invalid JSON input detected in query!\`);
      log.error("WHERE clause:", JSON.stringify(params.where, null, 2));
      log.error("PostgreSQL error:", errorMsg);
    } else {
      log.error(\`LIST \${ctx.table} error:\`, e?.stack ?? e);
    }

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

    const returningClause = buildColumnList(ctx.select, ctx.exclude, ctx.allColumnNames);
    const text = \`UPDATE "\${ctx.table}" SET \${setSql} WHERE \${wherePkSql} RETURNING \${returningClause}\`;
    const params = [...pkValues, ...Object.values(filteredData)];

    log.debug(\`PATCH \${ctx.table} SQL:\`, text, "params:", params);
    const { rows } = await ctx.pg.query(text, prepareParams(params));
    const parsedRows = parseVectorColumns(rows, ctx.vectorColumns);

    if (!parsedRows[0]) {
      return { data: null, status: 404 };
    }

    return { data: parsedRows[0], status: 200 };
  } catch (e: any) {
    // Enhanced logging for JSON validation errors
    const errorMsg = e?.message ?? "";
    const isJsonError = errorMsg.includes("invalid input syntax for type json");

    if (isJsonError) {
      log.error(\`PATCH \${ctx.table} - Invalid JSON input detected!\`);
      log.error("Input data that caused error:", JSON.stringify(updateData, null, 2));
      log.error("Filtered data (sent to DB):", JSON.stringify(Object.fromEntries(
        Object.entries(updateData).filter(([k]) => !ctx.pkColumns.includes(k))
      ), null, 2));
      log.error("PostgreSQL error:", errorMsg);
    } else {
      log.error(\`PATCH \${ctx.table} error:\`, e?.stack ?? e);
    }

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

    const returningClause = buildColumnList(ctx.select, ctx.exclude, ctx.allColumnNames);
    const text = ctx.softDeleteColumn
      ? \`UPDATE "\${ctx.table}" SET "\${ctx.softDeleteColumn}" = NOW() WHERE \${wherePkSql} RETURNING \${returningClause}\`
      : \`DELETE FROM "\${ctx.table}" WHERE \${wherePkSql} RETURNING \${returningClause}\`;

    log.debug(\`DELETE \${ctx.softDeleteColumn ? '(soft)' : ''} \${ctx.table} SQL:\`, text, "pk:", pkValues);
    const { rows } = await ctx.pg.query(text, prepareParams(pkValues));
    const parsedRows = parseVectorColumns(rows, ctx.vectorColumns);

    if (!parsedRows[0]) {
      return { data: null, status: 404 };
    }

    return { data: parsedRows[0], status: 200 };
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