import { z } from "zod";

export const TeamBaseSchema = z.object({
  name: z.string().min(1),
  municipality: z.string().optional(),
  stadium: z.string().optional(),
  venue: z.string().optional(),
});
export const TeamCreateSchema = TeamBaseSchema.extend({ leagueId: z.string(), groupId: z.string() });
export const TeamUpdateSchema = TeamBaseSchema.extend({ id: z.string(), leagueId: z.string(), groupId: z.string() });
