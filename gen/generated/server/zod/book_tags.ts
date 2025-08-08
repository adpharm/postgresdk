import { z } from "zod";

export const InsertBookTagsSchema = z.object({
  book_id: z.string().uuid(),
  tag_id: z.string().uuid()
});

export const UpdateBookTagsSchema = InsertBookTagsSchema.partial();

export type InsertBookTags = z.infer<typeof InsertBookTagsSchema>;
export type UpdateBookTags = z.infer<typeof UpdateBookTagsSchema>;
