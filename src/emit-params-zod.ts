import type { Table } from "./introspect";
import type { Graph } from "./rel-classify";
import { pascal } from "./utils";

export function emitParamsZod(table: Table, graph: Graph) {
  const Type = pascal(table.name);
  
  // Get column names for orderBy validation
  const columnNames = table.columns.map(c => `"${c.name}"`).join(", ");
  
  // Normalize PKs (copied from emit-client.ts)
  const pkCols: string[] = Array.isArray((table as any).pk)
    ? (table as any).pk
    : (table as any).pk
    ? [(table as any).pk]
    : [];
  const safePk = pkCols.length ? pkCols : ["id"];
  const hasCompositePk = safePk.length > 1;
  
  // Use z.any() for includes to avoid Zod recursive schema complexity.
  // TypeScript types (${Type}IncludeSpec) provide compile-time type safety.
  const includeSpecSchema = `z.any()`;

  // Generate PK schema
  const pkSchema = hasCompositePk
    ? `z.object({ ${safePk.map(col => `${col}: z.string().min(1)`).join(', ')} })`
    : `z.string().min(1)`;

  return `import { z } from "zod";
import { VectorSearchParamsSchema } from "./shared.js";

// Schema for primary key parameters
export const ${Type}PkSchema = ${pkSchema};

// Schema for list query parameters
export const ${Type}ListParamsSchema = z.object({
  include: ${includeSpecSchema}.optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  where: z.any().optional(),
  vector: VectorSearchParamsSchema.optional(),
  orderBy: z.enum([${columnNames}]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

// Schema for ordering parameters
export const ${Type}OrderParamsSchema = z.object({
  orderBy: z.enum([${columnNames}]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

export type ${Type}Pk = z.infer<typeof ${Type}PkSchema>;
export type ${Type}ListParams = z.infer<typeof ${Type}ListParamsSchema>;
export type ${Type}OrderParams = z.infer<typeof ${Type}OrderParamsSchema>;
`;
}