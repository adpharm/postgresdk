import { z } from "zod";

// Schema for primary key parameters
export const UsersPkSchema = z.string().min(1);

// Schema for list query parameters
export const UsersListParamsSchema = z.object({
  include: z.any().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  where: z.any().optional(),
  orderBy: z.enum(["id", "email", "role", "backup_role"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

// Schema for ordering parameters
export const UsersOrderParamsSchema = z.object({
  orderBy: z.enum(["id", "email", "role", "backup_role"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
}).strict();

export type UsersPk = z.infer<typeof UsersPkSchema>;
export type UsersListParams = z.infer<typeof UsersListParamsSchema>;
export type UsersOrderParams = z.infer<typeof UsersOrderParamsSchema>;
