export function emitSharedParamsZod() {
  return `import { z } from "zod";

// Shared pagination schema (used across all tables)
export const PaginationParamsSchema = z.object({
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional()
}).strict();

// Shared vector search schema (used across all tables)
export const VectorSearchParamsSchema = z.object({
  field: z.string().min(1),
  query: z.array(z.number()),
  metric: z.enum(["cosine", "l2", "inner"]).optional(),
  maxDistance: z.number().nonnegative().optional()
}).strict();

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;
export type VectorSearchParams = z.infer<typeof VectorSearchParamsSchema>;
`;
}