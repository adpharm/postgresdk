import { z } from "zod";

export const SelectUsersSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(["admin", "moderator", "user", "guest"]),
  backup_role: z.enum(["admin", "moderator", "user", "guest"]).nullable()
});

export const InsertUsersSchema = z.object({
  id: z.string().optional(),
  email: z.string(),
  role: z.enum(["admin", "moderator", "user", "guest"]).optional(),
  backup_role: z.enum(["admin", "moderator", "user", "guest"]).nullish()
});

export const UpdateUsersSchema = InsertUsersSchema.partial();
