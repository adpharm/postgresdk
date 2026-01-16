import type { Table } from "./introspect";
import { pascal } from "./utils";

export function emitZod(table: Table, opts: { numericMode: "string" | "number" | "auto" }, enums: Record<string, string[]>) {
  const Type = pascal(table.name);

  const zFor = (pg: string): string => {
    const t = pg.toLowerCase();

    // Check if this is an enum type
    if (enums[t]) {
      const values = enums[t].map(v => `"${v}"`).join(", ");
      return `z.enum([${values}])`;
    }

    if (t === "uuid") return `z.string()`;
    if (t === "bool" || t === "boolean") return `z.boolean()`;
    if (t === "int2" || t === "int4" || t === "int8") {
      if (opts.numericMode === "number") return `z.number()`;
      if (opts.numericMode === "string") return `z.string()`;
      // auto mode: int2/int4 → number, int8 → string (for precision safety)
      return (t === "int2" || t === "int4") ? `z.number()` : `z.string()`;
    }
    if (t === "numeric" || t === "float4" || t === "float8") {
      if (opts.numericMode === "number") return `z.number()`;
      if (opts.numericMode === "string") return `z.string()`;
      // auto mode: floats → number, numeric (arbitrary precision) → string
      return (t === "float4" || t === "float8") ? `z.number()` : `z.string()`;
    }
    if (t === "jsonb" || t === "json") return `z.unknown()`;
    if (t === "date" || t.startsWith("timestamp")) return `z.string()`;
    if (t === "vector" || t === "halfvec" || t === "sparsevec" || t === "bit") return `z.array(z.number())`;
    if (t.startsWith("_")) return `z.array(${zFor(t.slice(1))})`;
    return `z.string()`; // text/varchar/unknown
  };

  const selectFields = table.columns
    .map((c) => {
      let z = zFor(c.pgType);
      if (c.nullable) {
        z += `.nullable()`;
      }
      return `  ${c.name}: ${z}`;
    })
    .join(",\n");

  const insertFields = table.columns
    .map((c) => {
      let z = zFor(c.pgType);
      if (c.nullable) {
        z += `.nullish()`;
      } else if (c.hasDefault) {
        z += `.optional()`;
      }
      return `  ${c.name}: ${z}`;
    })
    .join(",\n");

  return `import { z } from "zod";

export const Select${Type}Schema = z.object({
${selectFields}
});

export const Insert${Type}Schema = z.object({
${insertFields}
});

export const Update${Type}Schema = Insert${Type}Schema.partial();
`;
}
