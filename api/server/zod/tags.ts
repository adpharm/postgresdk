import { z } from "zod";

export const SelectTagsSchema = z.object({
  id: z.string(),
  name: z.string()
});

export const InsertTagsSchema = z.object({
  id: z.string().optional(),
  name: z.string()
});

export const UpdateTagsSchema = InsertTagsSchema.partial();
