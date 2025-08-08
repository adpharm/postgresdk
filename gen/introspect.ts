import { Client } from "pg";

export type Column = {
  name: string;
  pgType: string;
  nullable: boolean;
  hasDefault: boolean;
};

export type Table = {
  name: string; // SQL table name, e.g. "audit_log"
  columns: Column[];
  pk: string[]; // composite allowed
  uniques: string[][]; // each entry = columns in a unique index
  fks: Array<{
    from: string[]; // child column(s)
    toTable: string; // parent table name
    to: string[]; // parent column(s)
    onDelete?: string;
    onUpdate?: string;
  }>;
  isJunction?: boolean;
};

export type Model = { tables: Record<string, Table>; enums: Record<string, string[]> };

export async function introspect(connectionString: string, schema = "public"): Promise<Model> {
  const pg = new Client({ connectionString });
  await pg.connect();

  const tablesRows = await pg.query<{
    oid: number;
    schema: string;
    table: string;
  }>(
    `
    SELECT c.oid, n.nspname AS schema, c.relname AS table
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = $1
    ORDER BY 2, 3
  `,
    [schema]
  );

  const tableOids = tablesRows.rows.map((r) => r.oid);
  const tables: Record<string, Table> = {};

  // Build empty tables
  for (const r of tablesRows.rows) {
    tables[r.table] = { name: r.table, columns: [], pk: [], uniques: [], fks: [] };
  }

  // Columns + defaults
  const cols = await pg.query<{
    oid: number;
    column: string;
    pg_type: string;
    attnotnull: boolean;
    has_default: boolean;
  }>(
    `
    SELECT c.oid, a.attname AS column, t.typname AS pg_type, a.attnotnull,
           EXISTS(SELECT 1 FROM pg_attrdef d WHERE d.adrelid = c.oid AND d.adnum = a.attnum) AS has_default
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE c.oid = ANY($1::oid[])
    ORDER BY 1, a.attnum
  `,
    [tableOids]
  );

  for (const r of cols.rows) {
    const name = tablesRows.rows.find((t) => t.oid === r.oid)!.table;
    tables[name].columns.push({
      name: r.column,
      pgType: r.pg_type,
      nullable: !r.attnotnull,
      hasDefault: r.has_default,
    });
  }

  // Primary keys
  const pks = await pg.query<{ oid: number; column: string }>(
    `
    SELECT c.oid, a.attname AS column
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indisprimary AND c.oid = ANY($1::oid[])
  `,
    [tableOids]
  );

  for (const r of pks.rows) {
    const name = tablesRows.rows.find((t) => t.oid === r.oid)!.table;
    tables[name].pk.push(r.column);
  }

  // Unique indexes
  const uniques = await pg.query<{ oid: number; indexrelid: number; column: string }>(
    `
    SELECT c.oid, i.indexrelid, a.attname AS column
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE c.oid = ANY($1::oid[]) AND i.indisunique
  `,
    [tableOids]
  );

  const uniqMap = new Map<string, string[]>();
  for (const r of uniques.rows) {
    const key = `${r.oid}:${r.indexrelid}`;
    const arr = uniqMap.get(key) ?? [];
    arr.push(r.column);
    uniqMap.set(key, arr);
  }
  for (const [key, colsArr] of uniqMap) {
    const oid = Number(key.split(":")[0]);
    const name = tablesRows.rows.find((t) => t.oid === oid)!.table;
    tables[name].uniques.push(colsArr);
  }

  // Foreign keys
  const fks = await pg.query<{
    conname: string;
    src_oid: number;
    tgt_oid: number;
    from_col: string;
    to_col: string;
    confdeltype: string;
    confupdtype: string;
    con_oid: number;
  }>(
    `
    SELECT con.conname, src.oid AS src_oid, tgt.oid AS tgt_oid,
           sa.attname AS from_col, ta.attname AS to_col,
           con.confdeltype, con.confupdtype, con.oid AS con_oid
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN LATERAL unnest(conkey) WITH ORDINALITY s(attnum, ord) ON TRUE
    JOIN LATERAL unnest(confkey) WITH ORDINALITY t(attnum, ord) ON s.ord = t.ord
    JOIN pg_attribute sa ON sa.attrelid = src.oid AND sa.attnum = s.attnum
    JOIN pg_attribute ta ON ta.attrelid = tgt.oid AND ta.attnum = t.attnum
    WHERE con.contype = 'f' AND src.oid = ANY($1::oid[])
  `,
    [tableOids]
  );

  const fkGroups = new Map<number, typeof fks.rows>();
  for (const r of fks.rows) {
    const arr = fkGroups.get(r.con_oid) ?? [];
    arr.push(r);
    fkGroups.set(r.con_oid, arr);
  }
  for (const [, group] of fkGroups) {
    const srcName = tablesRows.rows.find((t) => t.oid === group[0].src_oid)!.table;
    const tgtName = tablesRows.rows.find((t) => t.oid === group[0].tgt_oid)!.table;
    tables[srcName].fks.push({
      from: group.map((g) => g.from_col),
      toTable: tgtName,
      to: group.map((g) => g.to_col),
      onDelete: decodeAction(group[0].confdeltype),
      onUpdate: decodeAction(group[0].confupdtype),
    });
  }

  // Enums
  const enumsRows = await pg.query<{ enum_name: string; enumlabel: string }>(
    `
    SELECT t.typname AS enum_name, e.enumlabel
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = $1
    ORDER BY 1, e.enumsortorder
  `,
    [schema]
  );

  const enums: Record<string, string[]> = {};
  for (const r of enumsRows.rows) {
    enums[r.enum_name] ??= [];
    enums[r.enum_name].push(r.enumlabel);
  }

  // Detect junctions: exactly two FKs to different parents + composite unique or PK on those cols
  for (const t of Object.values(tables)) {
    const fkCols = t.fks.flatMap((f) => f.from);
    const distinctParents = new Set(t.fks.map((f) => f.toTable));
    const hasTwoFks = t.fks.length === 2 && distinctParents.size === 2;
    const compositeUnique = t.uniques.some((u) => u.length === 2 && u.every((c) => fkCols.includes(c)));
    const compositePk = t.pk.length === 2 && t.pk.every((c) => fkCols.includes(c));
    if (hasTwoFks && (compositeUnique || compositePk)) t.isJunction = true;
  }

  await pg.end();
  return { tables, enums };
}

function decodeAction(code: string) {
  return (
    { a: "no action", r: "restrict", c: "cascade", n: "set null", d: "set default" } as Record<
      string,
      string | undefined
    >
  )[code];
}
