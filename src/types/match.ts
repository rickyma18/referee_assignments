// src/types/match.ts

export type MatchStatus = "scheduled" | "played" | "postponed" | "canceled";

export interface MatchDoc {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchdayNumber: number;

  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;

  venueId: string;
  venueName: string;

  kickoff: FirebaseFirestore.Timestamp;
  status: MatchStatus;

  // 🔹 Asesores (ya lo tenías)
  assessors?: string[]; // IDs de referees con canAssess=true

  // 🔹 NUEVO: asignación manual de terna (Historia 5.1)
  centralRefereeId?: string | null;
  aa1RefereeId?: string | null;
  aa2RefereeId?: string | null;
  // Opcional: nombres cacheados (para mostrar en UI sin más lecturas)
  centralRefereeName?: string | null;
  aa1RefereeName?: string | null;
  aa2RefereeName?: string | null;

  source?: string;
  importBatchId?: string;

  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface ExcelRowRaw {
  Local: string;
  Visitante: string;
  Fecha: string; // YYYY-MM-DD
  Hora: string; // HH:mm (24h)
  Sede: string;
}

export interface ValidatedRow {
  rowNumber: number;
  raw: ExcelRowRaw;
  errors: string[];
  normalized?: {
    homeTeamId: string;
    awayTeamId: string;
    venueId: string;
    kickoff: Date; // en TZ MX, luego convertimos a Timestamp
  };
}
