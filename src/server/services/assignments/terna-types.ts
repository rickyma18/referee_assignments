// src/server/services/assignments/terna-types.ts

import type { Conflict, ScheduleConflict } from "./validation";

/**
 * Candidatos internos para armar la terna.
 */
export type CandidateRef = {
  id: string;
  name: string;
  status: string;
  rolesAllowed: string[];
  tier: string | null;
  rcsCentral: number | null;
  canAssess: boolean;
  category?: string | null; // 👈 para priorizar TDP
};

/**
 * Resultado de sugerencia para un partido concreto.
 *
 * NOTA: Este servicio NO guarda nada en Firestore, sólo propone.
 * La UI / actions decidirán si llaman luego a assignManualTernaAction.
 */
export type SuggestedTerna = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchId: string;

  centralRefereeId: string | null;
  aa1RefereeId: string | null;
  aa2RefereeId: string | null;
  assessorRefereeId: string | null;

  hasSuggestion: boolean;
  reason?: string;

  // Metadatos útiles para debug / “Motivo de sugerencia”
  mds: number | null;
  rcsCentral: number | null;
  centralTolerance: number;
  assistantsTolerance: number;

  // Solo para diagnóstico interno (no mostrar textos RA-XX en UI)
  scheduleConflicts?: ScheduleConflict[];
  recentTeamConflicts?: Conflict[];
};

/**
 * Parámetros mínimos para sugerir terna de UN partido.
 */
export type SuggestTernaForMatchParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchId: string;
};

export type SuggestTernasForMatchdayParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
};
