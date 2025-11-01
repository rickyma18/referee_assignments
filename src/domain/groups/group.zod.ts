import { z } from "zod";

export const GroupCreateSchema = z.object({
  name: z.string().min(2, "Nombre muy corto"),
  season: z.string().min(2, "Temporada requerida"),
});

export const GroupUpdateSchema = GroupCreateSchema.extend({
  id: z.string().min(1),
});
