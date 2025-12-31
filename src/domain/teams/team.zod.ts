// =============================
// src/domain/teams/team.zod.ts
// =============================
import { z } from "zod";

import { TeamTierValues } from "./team-tier";

// Base común para create/update (sin id/fechas)
export const TeamBaseSchema = z.object({
  name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
  groupId: z.string().min(1, "Grupo requerido"),

  municipality: z.string().trim().optional().default(""),
  stadium: z.string().trim().optional().default(""),
  venue: z.string().trim().optional().default(""),

  logoUrl: z.string().url("URL inválida").optional(),

  /**
   * Tier de comportamiento / complejidad del equipo.
   *
   * - TRANQUILO
   * - REGULARES
   * - COMPLICADO
   * - MUY_COMPLICADO
   *
   * Lo usamos en el motor de sugerencias (historia 5.3).
   */
  tier: z.enum(TeamTierValues).default("REGULARES"),
});

// Create: solo necesita los campos base
export const TeamCreateSchema = TeamBaseSchema; // sin delegateId

// Update: requiere id además de los campos base
export const TeamUpdateSchema = TeamBaseSchema.extend({
  id: z.string().min(1, "Id requerido"),
});

// Tipos de entrada (para actions/repos)
export type TeamCreateInput = z.infer<typeof TeamCreateSchema>;
export type TeamUpdateInput = z.infer<typeof TeamUpdateSchema>;
