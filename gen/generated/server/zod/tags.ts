import { z } from "zod";

export const InsertTagsSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string()
});

export const UpdateTagsSchema = InsertTagsSchema.partial();

export type InsertTags = z.infer<typeof InsertTagsSchema>;
export type UpdateTags = z.infer<typeof UpdateTagsSchema>;
