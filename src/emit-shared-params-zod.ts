export function emitSharedParamsZod() {
  return `import { z } from "zod";

// Shared pagination schema (used across all tables)
export const PaginationParamsSchema = z.object({
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional()
}).strict();

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;
`;
}