// =============================
// src/domain/groups/group.zod.ts
// =============================
import { z } from "zod";

export const GroupBaseSchema = z.object({
  name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
  season: z.string().trim().min(4, "Temporada requerida").max(20),
  // 👇 Para ordenar en UI (opcional, por defecto 0)
  order: z.number().int().nonnegative().optional().default(0),
});

export const GroupCreateSchema = GroupBaseSchema.extend({
  leagueId: z.string().min(1, "Liga requerida"),
});

export const GroupUpdateSchema = GroupBaseSchema.extend({
  leagueId: z.string().min(1, "Liga requerida"),
  id: z.string().min(1),
});

export type GroupCreateInput = z.infer<typeof GroupCreateSchema>;
export type GroupUpdateInput = z.infer<typeof GroupUpdateSchema>;
