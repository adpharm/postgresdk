import { z } from "zod";

// Schema for primary key parameters
export const ProductsPkSchema = z.string().min(1);

// Schema for list query parameters
export const ProductsListParamsSchema = z.object({
  include: z.any().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  where: z.any().optional(),
  orderBy: z.enum(["id", "name", "status", "priority", "tags"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

// Schema for ordering parameters
export const ProductsOrderParamsSchema = z.object({
  orderBy: z.enum(["id", "name", "status", "priority", "tags"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

export type ProductsPk = z.infer<typeof ProductsPkSchema>;
export type ProductsListParams = z.infer<typeof ProductsListParamsSchema>;
export type ProductsOrderParams = z.infer<typeof ProductsOrderParamsSchema>;
