import { z } from "zod";

// Schema for primary key parameters
export const BookTagsPkSchema = z.object({ book_id: z.string().min(1), tag_id: z.string().min(1) });

// Schema for list query parameters
export const BookTagsListParamsSchema = z.object({
  include: z.any().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  where: z.any().optional(),
  orderBy: z.enum(["book_id", "tag_id"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

// Schema for ordering parameters
export const BookTagsOrderParamsSchema = z.object({
  orderBy: z.enum(["book_id", "tag_id"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

export type BookTagsPk = z.infer<typeof BookTagsPkSchema>;
export type BookTagsListParams = z.infer<typeof BookTagsListParamsSchema>;
export type BookTagsOrderParams = z.infer<typeof BookTagsOrderParamsSchema>;
