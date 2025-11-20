import { z } from "zod";

// Schema for primary key parameters
export const TagsPkSchema = z.string().min(1);

// Schema for list query parameters
export const TagsListParamsSchema = z.object({
  include: z.any().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  where: z.any().optional(),
  orderBy: z.enum(["id", "name"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

// Schema for ordering parameters
export const TagsOrderParamsSchema = z.object({
  orderBy: z.enum(["id", "name"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

export type TagsPk = z.infer<typeof TagsPkSchema>;
export type TagsListParams = z.infer<typeof TagsListParamsSchema>;
export type TagsOrderParams = z.infer<typeof TagsOrderParamsSchema>;
