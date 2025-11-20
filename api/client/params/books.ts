import { z } from "zod";

// Schema for primary key parameters
export const BooksPkSchema = z.string().min(1);

// Schema for list query parameters
export const BooksListParamsSchema = z.object({
  include: z.any().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  where: z.any().optional(),
  orderBy: z.enum(["id", "author_id", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

// Schema for ordering parameters
export const BooksOrderParamsSchema = z.object({
  orderBy: z.enum(["id", "author_id", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

export type BooksPk = z.infer<typeof BooksPkSchema>;
export type BooksListParams = z.infer<typeof BooksListParamsSchema>;
export type BooksOrderParams = z.infer<typeof BooksOrderParamsSchema>;
