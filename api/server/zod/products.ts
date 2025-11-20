import { z } from "zod";

export const SelectProductsSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  tags: z.array(z.enum(["admin", "moderator", "user", "guest"])).nullable()
});

export const InsertProductsSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  tags: z.array(z.enum(["admin", "moderator", "user", "guest"])).nullish()
});

export const UpdateProductsSchema = InsertProductsSchema.partial();
