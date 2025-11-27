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
 *
 * Por defecto:
 * - El motor NO sugiere nada si el partido ya tiene terna en Firestore.
 * - La rotación del pool de árbitros es determinista según leagueId/groupId/matchdayId/matchId.
 *
 * Opcionales:
 * - ignoreExistingAssignment: si es true, el motor ignora la terna ya guardada
 *   y genera una nueva sugerencia igualmente (útil para “recalcular”).
 * - variantSeed: string opcional para variar la rotación de candidatos y así
 *   obtener una “opción alternativa” de terna sin romper el resto de la lógica.
 */
// src/server/services/assignments/terna-types.ts

export type SuggestTernaForMatchParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchId: string;

  /** Opcional: si lo pasas, el motor NO volverá a leer el partido de Firestore */
  matchData?: any;

  /** Si true, se genera sugerencia aunque ya exista terna en Firestore. */
  ignoreExistingAssignment?: boolean;

  /**
   * Semilla opcional para variar la rotación de candidatos.
   * Si se manda un valor distinto en cada llamada de “otra opción”,
   * la terna propuesta debería cambiar (en la medida de lo posible)
   * respetando RA-XX, MDS, etc.
   */
  variantSeed?: string;
};

export type SuggestTernasForMatchdayParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
};
