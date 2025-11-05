// =============================
// src/domain/teams/team.zod.ts
// =============================
import { z } from "zod";

// Base común para create/update (sin id/fechas)
export const TeamBaseSchema = z.object({
  name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
  groupId: z.string().min(1, "Grupo requerido"),

  municipality: z.string().trim().optional().default(""),
  stadium: z.string().trim().optional().default(""),
  venue: z.string().trim().optional().default(""),

  logoUrl: z.string().url("URL inválida").optional(),
});

// Create: solo necesita los campos base
export const TeamCreateSchema = TeamBaseSchema;

// Update: requiere id además de los campos base
export const TeamUpdateSchema = TeamBaseSchema.extend({
  id: z.string().min(1, "Id requerido"),
});

// Tipos de entrada (para actions/repos)
export type TeamCreateInput = z.infer<typeof TeamCreateSchema>;
export type TeamUpdateInput = z.infer<typeof TeamUpdateSchema>;
