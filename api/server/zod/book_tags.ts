import { z } from "zod";

export const SelectBookTagsSchema = z.object({
  book_id: z.string(),
  tag_id: z.string()
});

export const InsertBookTagsSchema = z.object({
  book_id: z.string(),
  tag_id: z.string()
});

export const UpdateBookTagsSchema = InsertBookTagsSchema.partial();
