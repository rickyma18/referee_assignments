// src/domain/leagues/league.zod.ts
import { z } from "zod";

export const LeagueBaseSchema = z.object({
  name: z.string({ required_error: "El nombre es obligatorio" }).min(3, "Debe tener al menos 3 caracteres"),
  season: z.string({ required_error: "La temporada es obligatoria" }).min(3, "Debe tener al menos 3 caracteres"),
  color: z.string().regex(/^#([0-9A-Fa-f]{6})$/, "Debe ser un color hexadecimal válido"),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  region: z.string().optional().nullable(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  // 👇 ahora es opcional:
  logoUrl: z.string().url("Debe ser una URL válida").optional().or(z.literal("")), // permite vacío sin error
  notes: z.string().optional().nullable(),
});

export const LeagueCreateSchema = LeagueBaseSchema.extend({
  slug: z.string().optional(),
});

export const LeagueUpdateSchema = LeagueBaseSchema.extend({
  id: z.string(),
  slug: z.string().optional(),
});
