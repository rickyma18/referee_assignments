// src/schemas/matches.ts
import { z } from "zod";

export const ExcelRowSchema = z.object({
  Local: z.string().min(1),
  Visitante: z.string().min(1),
  Fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  Hora: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm
  Sede: z.string().min(1),
});

export type ExcelRowInput = z.infer<typeof ExcelRowSchema>;
