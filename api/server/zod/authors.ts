import { z } from "zod";

export const SelectAuthorsSchema = z.object({
  id: z.string(),
  name: z.string()
});

export const InsertAuthorsSchema = z.object({
  id: z.string().optional(),
  name: z.string()
});

export const UpdateAuthorsSchema = InsertAuthorsSchema.partial();
