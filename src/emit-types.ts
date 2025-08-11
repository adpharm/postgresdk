/* Emits TypeScript types (Insert/Update/Select) for each table. */
import type { Table } from "./introspect";

function tsTypeFor(pgType: string, opts: { numericMode: "string" | "number" }): string {
  const t = pgType.toLowerCase();
  if (t.startsWith("_")) return `${tsTypeFor(t.slice(1), opts)}[]`;
  if (t === "uuid") return "string";
  if (t === "bool" || t === "boolean") return "boolean";
  if (t === "int2" || t === "int4" || t === "int8" || t === "float4" || t === "float8" || t === "numeric") {
    return opts.numericMode === "number" ? "number" : "string";
  }
  if (t === "date" || t.startsWith("timestamp")) return "string";
  if (t === "json" || t === "jsonb") return "unknown";
  return "string";
}

const pascal = (s: string) =>
  s
    .split(/[_\s-]+/)
    .map((w) => (w?.[0] ? w[0].toUpperCase() + w.slice(1) : ""))
    .join("");

export function emitTypes(table: Table, opts: { numericMode: "string" | "number" }) {
  const Type = pascal(table.name);

  const insertFields = table.columns
    .map((col) => {
      const base = tsTypeFor(col.pgType, opts);
      const optional = col.hasDefault || col.nullable ? "?" : "";
      const valueType = col.nullable ? `${base} | null` : base;
      return `  ${col.name}${optional}: ${valueType};`;
    })
    .join("\n");

  const selectFields = table.columns
    .map((col) => {
      const base = tsTypeFor(col.pgType, opts);
      const valueType = col.nullable ? `${base} | null` : base;
      return `  ${col.name}: ${valueType};`;
    })
    .join("\n");

  return `/* Generated. Do not edit. */
export type Insert${Type} = {
${insertFields}
};

export type Update${Type} = Partial<Insert${Type}>;

export type Select${Type} = {
${selectFields}
};
`;
}
