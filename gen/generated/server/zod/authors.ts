import { z } from "zod";

export const InsertAuthorsSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string()
});

export const UpdateAuthorsSchema = InsertAuthorsSchema.partial();

export type InsertAuthors = z.infer<typeof InsertAuthorsSchema>;
export type UpdateAuthors = z.infer<typeof UpdateAuthorsSchema>;
