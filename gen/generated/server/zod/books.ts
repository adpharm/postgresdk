import { z } from "zod";

export const InsertBooksSchema = z.object({
  id: z.string().uuid().optional(),
  author_id: z.string().uuid().nullable(),
  title: z.string()
});

export const UpdateBooksSchema = InsertBooksSchema.partial();

export type InsertBooks = z.infer<typeof InsertBooksSchema>;
export type UpdateBooks = z.infer<typeof UpdateBooksSchema>;
