import { z } from "zod";

export const SelectBooksSchema = z.object({
  id: z.string(),
  author_id: z.string().nullable(),
  title: z.string()
});

export const InsertBooksSchema = z.object({
  id: z.string().optional(),
  author_id: z.string().nullish(),
  title: z.string()
});

export const UpdateBooksSchema = InsertBooksSchema.partial();
