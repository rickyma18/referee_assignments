import { z } from "zod";

export const LeagueBaseSchema = z.object({
  name: z.string({ required_error: "El nombre es obligatorio" }).min(3, "Debe tener al menos 3 caracteres"),
  season: z.string({ required_error: "La temporada es obligatoria" }).min(3, "Debe tener al menos 3 caracteres"),
  color: z.string().regex(/^#([0-9A-Fa-f]{6})$/, "Debe ser un color hexadecimal válido"),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  region: z.string().optional().nullable(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  logoUrl: z.string().url("Debe ser una URL válida").optional().or(z.literal("")),
  notes: z.string().optional().nullable(),
});

// ✅ Input desde UI (sin delegateId)
export const LeagueCreateSchema = LeagueBaseSchema.extend({
  slug: z.string().optional(),
  delegateId: z.string().optional(), // el server lo puede inyectar
});

// ✅ Update desde UI (sin delegateId)
export const LeagueUpdateSchema = LeagueBaseSchema.extend({
  id: z.string(),
  slug: z.string().optional(),
});
