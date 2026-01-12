import { Client } from "pg";

export type Column = {
  name: string;
  pgType: string;
  nullable: boolean;
  hasDefault: boolean;
  vectorDimension?: number;
};

export type ForeignKey = {
  from: string[];
  toTable: string;
  to: string[];
  onDelete: "cascade" | "restrict" | "set null" | "no action";
  onUpdate: "cascade" | "restrict" | "set null" | "no action";
};

export type Table = {
  name: string;
  columns: Column[];
  pk: string[];
  uniques: string[][];
  fks: ForeignKey[];
};

export type Model = {
  schema: string;
  tables: Record<string, Table>;
  enums: Record<string, string[]>;
};

function ensureTable(tables: Record<string, Table>, name: string): Table {
  if (!tables[name]) tables[name] = { name, columns: [], pk: [], uniques: [], fks: [] };
  return tables[name];
}

function decodeAction(ch?: string | null): ForeignKey["onDelete"] {
  switch (ch) {
    case "c":
      return "cascade";
    case "r":
      return "restrict";
    case "n":
      return "set null";
    default:
      return "no action";
  }
}

export async function introspect(connectionString: string, schema: string): Promise<Model> {
  const pg = new Client({ connectionString });
  await pg.connect();

  const tables: Record<string, Table> = {};
  const enums: Record<string, string[]> = {};

  try {
    const tablesRows = await pg.query<{ oid: number; table: string }>(
      `
      SELECT c.oid, c.relname AS table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname = $1
      ORDER BY c.relname
      `,
      [schema]
    );
    for (const r of tablesRows.rows) ensureTable(tables, r.table);

    const colsRows = await pg.query<{
      table_name: string;
      column_name: string;
      is_nullable: "YES" | "NO";
      udt_name: string;
      data_type: string;
      column_default: string | null;
      atttypmod: number | null;
    }>(
      `
      SELECT
        c.table_name,
        c.column_name,
        c.is_nullable,
        c.udt_name,
        c.data_type,
        c.column_default,
        a.atttypmod
      FROM information_schema.columns c
      LEFT JOIN pg_catalog.pg_class cl ON cl.relname = c.table_name
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = c.table_schema
      LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = cl.oid AND a.attname = c.column_name
      WHERE c.table_schema = $1
      ORDER BY c.table_name, c.ordinal_position
      `,
      [schema]
    );
    for (const r of colsRows.rows) {
      const t = ensureTable(tables, r.table_name);
      const pgType = (r.udt_name ?? r.data_type).toLowerCase();
      const col: Column = {
        name: r.column_name,
        pgType,
        nullable: r.is_nullable === "YES",
        hasDefault: r.column_default != null,
      };

      // Extract vector dimension if column is a vector type (vector, halfvec, sparsevec, bit)
      const isVectorType = pgType === "vector" || pgType === "halfvec" || pgType === "sparsevec" || pgType === "bit";
      if (isVectorType && r.atttypmod != null && r.atttypmod !== -1) {
        // atttypmod for vector types stores dimension + 4 (typmod encoding)
        col.vectorDimension = r.atttypmod - 4;
      }

      t.columns.push(col);
    }

    const pkRows = await pg.query<{ table_name: string; cols: string[] }>(
      `
      SELECT
        tc.table_name,
        COALESCE(json_agg(kcu.column_name ORDER BY kcu.ordinal_position), '[]'::json) AS cols
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
      GROUP BY tc.table_name
      `,
      [schema]
    );
    for (const r of pkRows.rows) {
      const t = ensureTable(tables, r.table_name);
      t.pk = (r.cols ?? []).slice();
    }

    const uniqRows = await pg.query<{ table_name: string; cols: string[] }>(
      `
      SELECT
        tc.table_name,
        COALESCE(json_agg(kcu.column_name ORDER BY kcu.ordinal_position), '[]'::json) AS cols
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = $1
      GROUP BY tc.table_name, tc.constraint_name
      `,
      [schema]
    );
    for (const r of uniqRows.rows) {
      const t = ensureTable(tables, r.table_name);
      if (r.cols && r.cols.length) t.uniques.push(r.cols);
    }

    const fkRows = await pg.query<{
      con_oid: number;
      src_table: string;
      tgt_table: string;
      confdeltype: string;
      confupdtype: string;
      src_cols: string[];
      tgt_cols: string[];
    }>(
      `
      SELECT
        con.oid AS con_oid,
        src.relname AS src_table,
        tgt.relname AS tgt_table,
        con.confdeltype,
        con.confupdtype,
        COALESCE(json_agg(src_att.attname ORDER BY ord.n), '[]'::json) AS src_cols,
        COALESCE(json_agg(tgt_att.attname ORDER BY ord.n), '[]'::json) AS tgt_cols
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN LATERAL generate_subscripts(con.conkey, 1) ord(n) ON true
      JOIN pg_attribute src_att ON src_att.attrelid = src.oid AND src_att.attnum = con.conkey[ord.n]
      JOIN pg_attribute tgt_att ON tgt_att.attrelid = tgt.oid AND tgt_att.attnum = con.confkey[ord.n]
      JOIN pg_namespace ns ON ns.oid = src.relnamespace
      WHERE con.contype = 'f'
        AND ns.nspname = $1
      GROUP BY con.oid, src.relname, tgt.relname, con.confdeltype, con.confupdtype
      ORDER BY src.relname, con.oid
      `,
      [schema]
    );
    for (const r of fkRows.rows) {
      const t = ensureTable(tables, r.src_table);
      t.fks.push({
        from: (r.src_cols ?? []).slice(),
        toTable: r.tgt_table,
        to: (r.tgt_cols ?? []).slice(),
        onDelete: decodeAction(r.confdeltype),
        onUpdate: decodeAction(r.confupdtype),
      });
    }

    const enumRows = await pg.query<{ enum_name: string; enumlabel: string }>(
      `
      SELECT t.typname AS enum_name, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = $1
      ORDER BY t.typname, e.enumsortorder
      `,
      [schema]
    );
    for (const r of enumRows.rows) {
      if (!enums[r.enum_name]) enums[r.enum_name] = [];
      enums[r.enum_name]!.push(r.enumlabel);
    }
  } finally {
    await pg.end();
  }

  return { schema, tables, enums };
}
