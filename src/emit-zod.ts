import type { Table } from "./introspect";
import { pascal } from "./utils";

export function emitZod(table: Table, opts: { numericMode: "string" | "number" }) {
  const Type = pascal(table.name);

  const zFor = (pg: string): string => {
    if (pg === "uuid") return `z.string()`;
    if (pg === "bool" || pg === "boolean") return `z.boolean()`;
    if (pg === "int2" || pg === "int4" || pg === "int8")
      return opts.numericMode === "number" ? `z.number()` : `z.string()`;
    if (pg === "numeric" || pg === "float4" || pg === "float8")
      return opts.numericMode === "number" ? `z.number()` : `z.string()`;
    if (pg === "jsonb" || pg === "json") return `z.unknown()`;
    if (pg === "date" || pg.startsWith("timestamp")) return `z.string()`;
    if (pg.startsWith("_")) return `z.array(${zFor(pg.slice(1))})`;
    return `z.string()`; // text/varchar/unknown
  };

  const fields = table.columns
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

export const Insert${Type}Schema = z.object({
${fields}
});

export const Update${Type}Schema = Insert${Type}Schema.partial();

export type Insert${Type} = z.infer<typeof Insert${Type}Schema>;
export type Update${Type} = z.infer<typeof Update${Type}Schema>;
`;
}
