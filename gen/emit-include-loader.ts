import type { Graph } from "./rel-classify";
import type { Model } from "./introspect";

/**
 * Emit a generic include loader that:
 * - Walks the include spec
 * - Loads children in batches per edge kind
 * - Stitches onto parent rows (mutates copies)
 */
export function emitIncludeLoader(graph: Graph, model: Model, maxDepth: number) {
  // Precompute helpful maps for FK discovery
  const fkIndex: Record<
    string,
    {
      // table -> array of FKs
      from: string[];
      toTable: string;
      to: string[];
    }[]
  > = {};
  for (const t of Object.values(model.tables)) {
    fkIndex[t.name] = t.fks.map((f) => ({ from: f.from, toTable: f.toTable, to: f.to }));
  }

  return `/* Generated. Do not edit. */
import { RELATION_GRAPH } from "./include-builder";

// Minimal types to keep the file self-contained
type Graph = typeof RELATION_GRAPH;
type TableName = keyof Graph;
type IncludeSpec = any;

// Debug helpers (enabled with SDK_DEBUG=1)
const DEBUG = process.env.SDK_DEBUG === "1" || process.env.SDK_DEBUG === "true";
const log = {
  debug: (...args: any[]) => { if (DEBUG) console.debug("[sdk:include]", ...args); },
  warn:  (...args: any[]) => console.warn("[sdk:include]", ...args),
  error: (...args: any[]) => console.error("[sdk:include]", ...args),
};

// Helpers for PK/FK discovery from model (inlined)
const FK_INDEX = ${JSON.stringify(fkIndex, null, 2)} as const;
const PKS = ${JSON.stringify(
    Object.fromEntries(Object.values(model.tables).map((t) => [t.name, t.pk])),
    null,
    2
  )} as const;

// Build WHERE predicate for OR-of-AND on composite values
function buildOrAndPredicate(cols: string[], count: number, startIndex: number) {
  // Generates: (c1=$i AND c2=$i+1) OR (c1=$j AND c2=$j+1) ...
  const groups: string[] = [];
  let idx = startIndex;
  for (let k = 0; k < count; k++) {
    const parts = cols.map((c, j) => \`"\${c}" = $\${idx + j}\`);
    groups.push('(' + parts.join(' AND ') + ')');
    idx += cols.length;
  }
  return groups.join(' OR ');
}

// Extract distinct tuples from rows
function distinctTuples(rows: any[], cols: string[]): any[] {
  const s = new Set<string>();
  const res: any[] = [];
  for (const r of rows) {
    const tup = cols.map(c => r[c]);
    const key = JSON.stringify(tup);
    if (!s.has(key)) {
      s.add(key);
      res.push(tup);
    }
  }
  return res;
}

// Index rows by tuple key
function indexByTuple(rows: any[], cols: string[]) {
  const map = new Map<string, any>();
  for (const r of rows) {
    const key = JSON.stringify(cols.map(c => r[c]));
    map.set(key, r);
  }
  return map;
}

// Group rows by tuple key (1:N)
function groupByTuple(rows: any[], cols: string[]) {
  const map = new Map<string, any[]>();
  for (const r of rows) {
    const key = JSON.stringify(cols.map(c => r[c]));
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return map;
}

// Public entry
export async function loadIncludes(
  root: TableName,
  parents: any[],
  spec: IncludeSpec | undefined,
  pg: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> },
  maxDepth: number = ${maxDepth}
) {
  try {
    if (!spec || !parents.length) return parents;
    log.debug("loadIncludes root/spec/rows", root, Object.keys(spec ?? {}).length, parents.length);

    // Deep clone parents to avoid mutating caller refs
    const cloned = parents.map(p => ({ ...p }));
    await walk(root, cloned, spec, 0);
    return cloned;
  } catch (e: any) {
    log.error("loadIncludes error:", e?.message ?? e, e?.stack);
    // Never throw to the route; return base rows
    return parents;
  }

  async function walk(table: TableName, rows: any[], s: any, depth: number): Promise<void> {
    if (!s || depth >= maxDepth || rows.length === 0) return;
    const rels: any = (RELATION_GRAPH as any)[table] || {};
    log.debug("walk", { table, depth, keys: Object.keys(s) });

    // Process each requested relation at this level
    for (const key of Object.keys(s)) {
      const rel = rels[key];
      if (!rel) {
        log.warn(\`Unknown include key '\${key}' on '\${table}' — skipping\`);
        continue;
      }
      const target = rel.target as TableName;

      // Safely run each loader; never let one bad edge 500 the route
      if (rel.via) {
        // M:N via junction
        try {
          await loadManyToMany(table, target, rel.via as string, rows, key);
        } catch (e: any) {
          log.error("loadManyToMany failed", { table, key, via: rel.via, target }, e?.message ?? e);
          for (const r of rows) r[key] = [];
        }
        // Recurse if nested include specified
        const childSpec = s[key] && typeof s[key] === "object" ? (s[key] as any).include : undefined;
        if (childSpec) {
          const children = rows.flatMap(r => (r[key] ?? []));
          try {
            await walk(target, children, childSpec, depth + 1);
          } catch (e: any) {
            log.error("walk nested (via) failed", { table: String(target), key }, e?.message ?? e);
          }
        }
        continue;
      }

      if (rel.kind === "many") {
        // 1:N target has FK to current
        try {
          await loadOneToMany(table, target, rows, key);
        } catch (e: any) {
          log.error("loadOneToMany failed", { table, key, target }, e?.message ?? e);
          for (const r of rows) r[key] = [];
        }
        const childSpec = s[key] && typeof s[key] === "object" ? (s[key] as any).include : undefined;
        if (childSpec) {
          const children = rows.flatMap(r => (r[key] ?? []));
          try {
            await walk(target, children, childSpec, depth + 1);
          } catch (e: any) {
            log.error("walk nested (many) failed", { table: String(target), key }, e?.message ?? e);
          }
        }
      } else {
        // kind === "one"
        // Could be belongs-to (current has FK to target) OR has-one (target unique-FK to current)
        const currFks = (FK_INDEX as any)[table] as Array<{from:string[];toTable:string;to:string[]}>;
        const toTarget = currFks.find(f => f.toTable === target);
        if (toTarget) {
          try {
            await loadBelongsTo(table, target, rows, key);
          } catch (e: any) {
            log.error("loadBelongsTo failed", { table, key, target }, e?.message ?? e);
            for (const r of rows) r[key] = null;
          }
        } else {
          try {
            await loadHasOne(table, target, rows, key);
          } catch (e: any) {
            log.error("loadHasOne failed", { table, key, target }, e?.message ?? e);
            for (const r of rows) r[key] = null;
          }
        }
        const childSpec = s[key] && typeof s[key] === "object" ? (s[key] as any).include : undefined;
        if (childSpec) {
          const children = rows.map(r => r[key]).filter(Boolean);
          try {
            await walk(target, children, childSpec, depth + 1);
          } catch (e: any) {
            log.error("walk nested (one) failed", { table: String(target), key }, e?.message ?? e);
          }
        }
      }
    }
  }

  async function loadBelongsTo(curr: TableName, target: TableName, rows: any[], key: string) {
    // current has FK cols referencing target PK
    const fk = (FK_INDEX as any)[curr].find((f: any) => f.toTable === target);
    if (!fk) { for (const r of rows) r[key] = null; return; }
    const tuples = distinctTuples(rows, fk.from).filter(t => t.every((v: any) => v != null));
    if (!tuples.length) { for (const r of rows) r[key] = null; return; }

    // Query target WHERE target.pk IN tuples
    const pkCols = (PKS as any)[target] as string[];
    const where = buildOrAndPredicate(pkCols, tuples.length, 1);
    const params = tuples.flat();
    const sql = \`SELECT * FROM "\${target}" WHERE \${where}\`;
    log.debug("belongsTo SQL", { curr, target, key, sql, paramsCount: params.length });
    const { rows: targets } = await pg.query(sql, params);

    const idx = indexByTuple(targets, pkCols);
    for (const r of rows) {
      const tup = fk.from.map((c: string) => r[c]);
      const keyStr = JSON.stringify(tup);
      r[key] = idx.get(keyStr) ?? null;
    }
  }

  async function loadHasOne(curr: TableName, target: TableName, rows: any[], key: string) {
    // target has FK cols referencing current PK (unique)
    const fk = (FK_INDEX as any)[target].find((f: any) => f.toTable === curr);
    if (!fk) { for (const r of rows) r[key] = null; return; }

    const pkCols = (PKS as any)[curr] as string[];
    const tuples = distinctTuples(rows, pkCols).filter(t => t.every((v: any) => v != null));
    if (!tuples.length) { for (const r of rows) r[key] = null; return; }

    // SELECT target WHERE fk IN tuples
    const where = buildOrAndPredicate(fk.from, tuples.length, 1);
    const params = tuples.flat();
    const sql = \`SELECT * FROM "\${target}" WHERE \${where}\`;
    log.debug("hasOne SQL", { curr, target, key, sql, paramsCount: params.length });
    const { rows: targets } = await pg.query(sql, params);

    const idx = indexByTuple(targets, fk.from);
    for (const r of rows) {
      const keyStr = JSON.stringify(pkCols.map((c: string) => r[c]));
      r[key] = idx.get(keyStr) ?? null;
    }
  }

  async function loadOneToMany(curr: TableName, target: TableName, rows: any[], key: string) {
    // target has FK cols referencing current PK
    const fk = (FK_INDEX as any)[target].find((f: any) => f.toTable === curr);
    if (!fk) { for (const r of rows) r[key] = []; return; }

    const pkCols = (PKS as any)[curr] as string[];
    const tuples = distinctTuples(rows, pkCols).filter(t => t.every((v: any) => v != null));
    if (!tuples.length) { for (const r of rows) r[key] = []; return; }

    const where = buildOrAndPredicate(fk.from, tuples.length, 1);
    const params = tuples.flat();
    const sql = \`SELECT * FROM "\${target}" WHERE \${where}\`;
    log.debug("oneToMany SQL", { curr, target, key, sql, paramsCount: params.length });
    const { rows: children } = await pg.query(sql, params);

    const groups = groupByTuple(children, fk.from);
    for (const r of rows) {
      const keyStr = JSON.stringify(pkCols.map((c: string) => r[c]));
      r[key] = groups.get(keyStr) ?? [];
    }
  }

  async function loadManyToMany(curr: TableName, target: TableName, via: string, rows: any[], key: string) {
    // via has two FKs: one to curr, one to target
    const toCurr = (FK_INDEX as any)[via].find((f: any) => f.toTable === curr);
    const toTarget = (FK_INDEX as any)[via].find((f: any) => f.toTable === target);
    if (!toCurr || !toTarget) { for (const r of rows) r[key] = []; return; }

    const pkCols = (PKS as any)[curr] as string[];
    const tuples = distinctTuples(rows, pkCols).filter(t => t.every((v: any) => v != null));
    if (!tuples.length) { for (const r of rows) r[key] = []; return; }

    // 1) Load junction rows for current parents
    const whereVia = buildOrAndPredicate(toCurr.from, tuples.length, 1);
    const sqlVia = \`SELECT * FROM "\${via}" WHERE \${whereVia}\`;
    const paramsVia = tuples.flat();
    log.debug("manyToMany junction SQL", { curr, target, via, key, sql: sqlVia, paramsCount: paramsVia.length });
    const { rows: jrows } = await pg.query(sqlVia, paramsVia);

    if (!jrows.length) { for (const r of rows) r[key] = []; return; }

    // 2) Load targets by distinct target fk tuples in junction
    const tTuples = distinctTuples(jrows, toTarget.from);
    const whereT = buildOrAndPredicate((PKS as any)[target], tTuples.length, 1);
    const sqlT = \`SELECT * FROM "\${target}" WHERE \${whereT}\`;
    const paramsT = tTuples.flat();
    log.debug("manyToMany target SQL", { curr, target, via, key, sql: sqlT, paramsCount: paramsT.length });
    const { rows: targets } = await pg.query(sqlT, paramsT);

    const tIdx = indexByTuple(targets, (PKS as any)[target]);

    // 3) Group junction rows by current pk tuple, map to target rows
    const byCurr = groupByTuple(jrows, toCurr.from);
    for (const r of rows) {
      const currKey = JSON.stringify(pkCols.map((c: string) => r[c]));
      const j = byCurr.get(currKey) ?? [];
      r[key] = j.map(jr => tIdx.get(JSON.stringify(toTarget.from.map((c: string) => jr[c])))).filter(Boolean);
    }
  }
}
`;
}
