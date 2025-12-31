import { z } from "zod";

// Timestamps en Firestore
export type FireTimestamp =
  | {
      toDate: () => Date;
    }
  | Date; // por si normalizas

export const MatchdayBaseSchema = z.object({
  leagueId: z.string().min(1),
  groupId: z.string().min(1),
  number: z.number().int().positive(), // autoincrement dentro del grupo
  startDate: z.date(), // se convierte a Timestamp en el repo
  endDate: z.date(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE").optional(),
  createdBy: z.string().optional(),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export const MatchdayCreateSchema = MatchdayBaseSchema.omit({
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  number: true, // <- se setea en el repo con autoincrement
}).extend({
  // mostrarlo en el form como solo-lectura si quieres:
  _prefillNumber: z.number().int().positive().optional(),
  delegateId: z.string().optional(), // tolerancia
});

export const MatchdayUpdateSchema = MatchdayBaseSchema.pick({
  leagueId: true,
  groupId: true,
  startDate: true,
  endDate: true,
  status: true,
}).extend({
  id: z.string().min(1),
});

export type MatchdayCreateInput = z.infer<typeof MatchdayCreateSchema>;
export type MatchdayUpdateInput = z.infer<typeof MatchdayUpdateSchema>;

export type Matchday = z.infer<typeof MatchdayBaseSchema> & { id: string };
