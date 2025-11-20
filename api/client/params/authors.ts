import { z } from "zod";

// Schema for primary key parameters
export const AuthorsPkSchema = z.string().min(1);

// Schema for list query parameters
export const AuthorsListParamsSchema = z.object({
  include: z.any().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  where: z.any().optional(),
  orderBy: z.enum(["id", "name"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

// Schema for ordering parameters
export const AuthorsOrderParamsSchema = z.object({
  orderBy: z.enum(["id", "name"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

export type AuthorsPk = z.infer<typeof AuthorsPkSchema>;
export type AuthorsListParams = z.infer<typeof AuthorsListParamsSchema>;
export type AuthorsOrderParams = z.infer<typeof AuthorsOrderParamsSchema>;
