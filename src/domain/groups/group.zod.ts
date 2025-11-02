import { z } from "zod";

export const GroupBaseSchema = z.object({
  name: z.string().min(1),
  season: z.string().min(3),
  order: z.number().int().optional(),
});
export const GroupCreateSchema = GroupBaseSchema.extend({ leagueId: z.string() });
export const GroupUpdateSchema = GroupBaseSchema.extend({ id: z.string(), leagueId: z.string() });
