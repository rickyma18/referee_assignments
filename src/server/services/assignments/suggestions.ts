"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";

import { refereeTierToRcsCentral } from "@/domain/referees/referee-tier";
import { computeMatchMdsFromTeams, type TeamDifficultyTier } from "@/domain/teams/team-difficulty-tier";

import { findRecentTeamConflicts, findScheduleConflicts, type Conflict, type ScheduleConflict } from "./validation";

/**
 * Candidatos internos para armar la terna.
 */
type CandidateRef = {
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

/* ------------------------------------------------------------------ */
/* Helpers internos                                                   */
/* ------------------------------------------------------------------ */

function toDateSafe(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input?.toDate === "function") {
    try {
      return input.toDate();
    } catch {
      return null;
    }
  }
  if (typeof input === "string") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Detecta si la liga es TDP (varonil o femenil) a partir del nombre
 * o, si lo usas después, de un campo category en el doc de la liga.
 */
function isTdpLeague(leagueData: any): boolean {
  const leagueName = (leagueData?.name ?? "").toString().toUpperCase();
  const leagueCategory = (leagueData?.category ?? "").toString().toUpperCase();

  if (leagueCategory.includes("TDP")) return true;
  if (leagueName.includes("TDP")) return true;

  return false;
}

/**
 * Regla para decidir si un partido debe llevar asesor automático.
 *
 * - Liga TDP varonil → SÍ asesor.
 * - TDP femenil → NO asesor.
 * - Resto de ligas → sin asesor automático.
 */
function shouldAssignAssessor(options: { leagueData: any; matchData: any }): boolean {
  const { leagueData } = options;

  const leagueName = (leagueData?.name ?? "").toString().toUpperCase();
  const leagueCategory = (leagueData?.category ?? "").toString().toUpperCase();

  const isFemenil = leagueName.includes("FEM") ?? leagueName.includes("FEMENIL") ?? leagueCategory.includes("FEM");

  // ❌ TDP femenil -> NO asesor
  if (isTdpLeague(leagueData) && isFemenil) {
    return false;
  }

  // ✅ Liga TDP varonil -> SÍ asesor
  if (isTdpLeague(leagueData)) {
    return true;
  }

  // Resto de ligas -> sin asesor automático
  return false;
}

/**
 * Calcula el MDS del partido.
 *
 * Estrategia:
 * - Si el doc de partido ya tiene campo numérico `mds`, se usa.
 * - Si no, se intenta obtener los teams local/visitante y se calcula:
 *     MDS = computeMatchMdsFromTeams({ homeTier, awayTier })
 * - Si no se puede, devuelve null.
 *
 * NOTA: Este helper NO persiste el MDS en el partido (es puro cálculo).
 */
async function computeMdsForMatch(options: {
  leagueId: string;
  groupId: string;
  matchData: any;
}): Promise<number | null> {
  const { leagueId, groupId, matchData } = options;

  const mdsRaw = matchData?.mds;
  if (typeof mdsRaw === "number" && Number.isFinite(mdsRaw)) {
    return mdsRaw;
  }

  const homeTeamId: string | undefined = matchData?.homeTeamId;
  const awayTeamId: string | undefined = matchData?.awayTeamId;

  if (!homeTeamId && !awayTeamId) {
    return null;
  }

  const db = getFirestore();
  const groupRef = db.collection("leagues").doc(leagueId).collection("groups").doc(groupId);
  const teamsRef = groupRef.collection("teams");

  let homeTier: TeamDifficultyTier | null = null;
  let awayTier: TeamDifficultyTier | null = null;

  if (homeTeamId) {
    const homeSnap = await teamsRef.doc(homeTeamId).get();
    const tData = (homeSnap.exists ? homeSnap.data() : null) as any;
    const rawTier = (tData?.difficultyTier ?? null) as string | null;
    if (rawTier && typeof rawTier === "string") {
      homeTier = rawTier as TeamDifficultyTier;
    }
  }

  if (awayTeamId) {
    const awaySnap = await teamsRef.doc(awayTeamId).get();
    const tData = (awaySnap.exists ? awaySnap.data() : null) as any;
    const rawTier = (tData?.difficultyTier ?? null) as string | null;
    if (rawTier && typeof rawTier === "string") {
      awayTier = rawTier as TeamDifficultyTier;
    }
  }

  return computeMatchMdsFromTeams({ homeTier, awayTier });
}

/**
 * Carga todos los árbitros y los convierte en CandidateRef.
 *
 * - Solo usa status / rolesAllowed / tier.
 * - El RCS se deriva de tier (refereeTierToRcsCentral).
 */
async function loadRefereeCandidates(): Promise<CandidateRef[]> {
  const db = getFirestore();
  const snap = await db.collection("referees").get();

  const candidates: CandidateRef[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as any;

    const status = (data?.status ?? "").toString().toUpperCase();
    const rawName = (data?.name as string | undefined) ?? `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim();
    const name = rawName && rawName.trim().length > 0 ? rawName.trim() : "Sin nombre";

    const rolesAllowed: string[] = Array.isArray(data?.rolesAllowed) ? (data.rolesAllowed as string[]) : [];

    const tierRaw = (data?.tier ?? null) as string | null;
    const tier = tierRaw && typeof tierRaw === "string" ? tierRaw : null;

    const rcsCentral = refereeTierToRcsCentral(tier as any);

    const canAssess = Boolean(data?.canAssess);
    const category = (data?.category ?? null) as string | null; // 👈 aquí leemos category del árbitro

    candidates.push({
      id: doc.id,
      name,
      status,
      rolesAllowed,
      tier,
      rcsCentral,
      canAssess,
      category,
    });
  }

  return candidates;
}

/**
 * Filtra candidatos por:
 * - status "DISPONIBLE"
 * - que no sean NO_ELEGIBLE (rcsCentral !== null)
 */
function filterBasePool(refs: CandidateRef[]): CandidateRef[] {
  return refs.filter((r) => r.status === "DISPONIBLE" && r.rcsCentral !== null);
}

/**
 * Devuelve un subconjunto de candidatos aptos para cada rol:
 * - CENTRAL: debe tener rol "CENTRAL" en rolesAllowed.
 * - ASISTENTES: con rol "AA1" o "AA2".
 */
function splitCandidatesByRole(refs: CandidateRef[]): {
  centralCandidates: CandidateRef[];
  assistantCandidates: CandidateRef[];
} {
  const centralCandidates: CandidateRef[] = [];
  const assistantCandidates: CandidateRef[] = [];

  for (const r of refs) {
    const roles = r.rolesAllowed ?? [];

    if (roles.includes("CENTRAL")) {
      centralCandidates.push(r);
    }

    if (roles.includes("AA1") || roles.includes("AA2")) {
      assistantCandidates.push(r);
    }
  }

  return { centralCandidates, assistantCandidates };
}

/**
 * Pool de posibles asesores:
 * - rol "ASESOR" en rolesAllowed
 * - o flag canAssess = true
 */
function getAssessorCandidates(refs: CandidateRef[]): CandidateRef[] {
  return refs.filter((r) => {
    const roles = r.rolesAllowed ?? [];
    return roles.includes("ASESOR") || r.canAssess === true;
  });
}

/**
 * Aplica el filtro de MDS vs RCS para el central.
 */
function filterCentralByMds(candidates: CandidateRef[], mds: number | null, tolerance: number): CandidateRef[] {
  if (mds == null) return candidates;

  const threshold = mds - tolerance;
  const filtered = candidates.filter((c) => {
    if (c.rcsCentral == null) return false;
    return c.rcsCentral >= threshold;
  });

  return filtered.length > 0 ? filtered : candidates;
}

/**
 * Lo mismo que filterCentralByMds pero para asistentes.
 */
function filterAssistantsByMds(candidates: CandidateRef[], mds: number | null, tolerance: number): CandidateRef[] {
  if (mds == null) return candidates;

  const threshold = mds - tolerance;
  const filtered = candidates.filter((c) => {
    if (c.rcsCentral == null) return false;
    return c.rcsCentral >= threshold;
  });

  return filtered.length > 0 ? filtered : candidates;
}

/**
 * Orden base por:
 * - mayor RCS
 * - luego nombre alfabético (para tener determinismo)
 */
function sortByRcsAndName(candidates: CandidateRef[]): CandidateRef[] {
  return [...candidates].sort((a, b) => {
    const ra = a.rcsCentral ?? 0;
    const rb = b.rcsCentral ?? 0;
    if (ra !== rb) return rb - ra; // DESC
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
}

/**
 * Ordena aplicando prioridad TDP cuando la liga es TDP:
 * - Si es liga TDP:
 *    1) category incluye "TDP" primero
 *    2) luego RCS
 *    3) luego nombre
 * - Si no es liga TDP → usa sortByRcsAndName normal.
 */
function sortWithLeaguePriority(candidates: CandidateRef[], leagueData: any): CandidateRef[] {
  if (!isTdpLeague(leagueData)) {
    return sortByRcsAndName(candidates);
  }

  return [...candidates].sort((a, b) => {
    const aCat = (a.category ?? "").toString().toUpperCase();
    const bCat = (b.category ?? "").toString().toUpperCase();

    const aIsTdp = aCat.includes("TDP") ? 1 : 0;
    const bIsTdp = bCat.includes("TDP") ? 1 : 0;

    if (aIsTdp !== bIsTdp) return bIsTdp - aIsTdp;

    const ra = a.rcsCentral ?? 0;
    const rb = b.rcsCentral ?? 0;
    if (ra !== rb) return rb - ra;

    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
}

/**
 * Devuelve el primer candidato de la lista que no esté en el set de usados.
 */
function pickFirstNotUsed(candidates: CandidateRef[], used: Set<string>): CandidateRef | null {
  for (const c of candidates) {
    if (!used.has(c.id)) return c;
  }
  return null;
}

/**
 * Elige un asistente intentando:
 * - que no esté usado en el batch
 * - que no repita pareja con central (y opcionalmente con otro asistente)
 */
function pickAssistantAvoidingPairs(
  candidates: CandidateRef[],
  used: Set<string>,
  centralId: string,
  pairUsed: Set<string>,
  otherAssistantId?: string,
): CandidateRef | null {
  for (const c of candidates) {
    if (used.has(c.id)) continue;
    const pairWithCentral = `${centralId}#${c.id}`;
    if (pairUsed.has(pairWithCentral)) continue;

    if (otherAssistantId) {
      const pairWithOther = `${otherAssistantId}#${c.id}`;
      if (pairUsed.has(pairWithOther)) continue;
    }

    return c;
  }

  // fallback relajando restricción de parejas, pero manteniendo "no usado"
  return pickFirstNotUsed(candidates, used);
}

/* ------------------------------------------------------------------ */
/* Motor principal: sugerir terna para un partido (unitario)          */
/* ------------------------------------------------------------------ */

export async function suggestTernaForMatch(params: SuggestTernaForMatchParams): Promise<SuggestedTerna> {
  const { leagueId, groupId, matchdayId, matchId } = params;

  const db = getFirestore();

  // 1) Liga (para tolerancias)
  const leagueSnap = await db.collection("leagues").doc(leagueId).get();
  if (!leagueSnap.exists) {
    return {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "LEAGUE_NOT_FOUND",
      mds: null,
      rcsCentral: null,
      centralTolerance: 0,
      assistantsTolerance: 0,
    };
  }

  const leagueData = leagueSnap.data() as any;
  const assignmentsCfg = leagueData?.assignments ?? {};

  const centralTolRaw = assignmentsCfg?.centralTolerance;
  const assistantsTolRaw = assignmentsCfg?.assistantsTolerance;

  const centralTolerance = typeof centralTolRaw === "number" && Number.isFinite(centralTolRaw) ? centralTolRaw : 1;
  const assistantsTolerance =
    typeof assistantsTolRaw === "number" && Number.isFinite(assistantsTolRaw) ? assistantsTolRaw : 1;

  // 2) Partido
  const matchRef = db
    .collection("leagues")
    .doc(leagueId)
    .collection("groups")
    .doc(groupId)
    .collection("matchdays")
    .doc(matchdayId)
    .collection("matches")
    .doc(matchId);

  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    return {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "MATCH_NOT_FOUND",
      mds: null,
      rcsCentral: null,
      centralTolerance,
      assistantsTolerance,
    };
  }

  const matchData = matchSnap.data() as any;

  const homeTeamId: string | undefined = matchData?.homeTeamId;
  const awayTeamId: string | undefined = matchData?.awayTeamId;

  // matchdayNumber para findRecentTeamConflicts
  const matchdaySnap = await matchRef.parent.parent!.get(); // parent: matchdays/{matchdayId}
  const matchdayData = (matchdaySnap.exists ? matchdaySnap.data() : null) as any;
  const matchdayNumber: number | null = typeof matchdayData?.number === "number" ? matchdayData.number : null;

  const kickoffDate = toDateSafe(matchData?.kickoff ?? matchData?.date);
  const mds = await computeMdsForMatch({ leagueId, groupId, matchData });

  // 3) Pool de árbitros
  const allRefs = await loadRefereeCandidates();
  const basePool = filterBasePool(allRefs);

  if (basePool.length === 0) {
    return {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "NO_AVAILABLE_REFEREES",
      mds,
      rcsCentral: null,
      centralTolerance,
      assistantsTolerance,
    };
  }

  const { centralCandidates, assistantCandidates } = splitCandidatesByRole(basePool);
  const assessorCandidates = getAssessorCandidates(basePool);

  if (centralCandidates.length === 0 || assistantCandidates.length === 0) {
    return {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "NO_ROLE_CANDIDATES",
      mds,
      rcsCentral: null,
      centralTolerance,
      assistantsTolerance,
    };
  }

  // 4) Filtro por MDS ↔ RCS + prioridad TDP si aplica
  const eligibleCentralsRaw = filterCentralByMds(centralCandidates, mds, centralTolerance);
  const eligibleAssistantsRaw = filterAssistantsByMds(assistantCandidates, mds, assistantsTolerance);

  const eligibleCentrals = sortWithLeaguePriority(eligibleCentralsRaw, leagueData);
  const eligibleAssistants = sortWithLeaguePriority(eligibleAssistantsRaw, leagueData);

  const chosenCentral = eligibleCentrals[0] ?? null;
  if (!chosenCentral) {
    return {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "NO_CENTRAL_AFTER_MDS_FILTER",
      mds,
      rcsCentral: null,
      centralTolerance,
      assistantsTolerance,
    };
  }

  // Asistentes: no repetir central
  const assistantPoolFiltered = eligibleAssistants.filter((a) => a.id !== chosenCentral.id);

  if (assistantPoolFiltered.length < 2) {
    return {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "NOT_ENOUGH_ASSISTANTS",
      mds,
      rcsCentral: chosenCentral.rcsCentral,
      centralTolerance,
      assistantsTolerance,
    };
  }

  const chosenAa1 = assistantPoolFiltered[0];
  const assistantPoolForAa2 = assistantPoolFiltered.filter((a) => a.id !== chosenAa1.id);
  const chosenAa2 = assistantPoolForAa2[0] ?? null;

  if (!chosenAa1 || !chosenAa2) {
    return {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "NOT_ENOUGH_ASSISTANTS_IN_UNIT",
      mds,
      rcsCentral: chosenCentral.rcsCentral,
      centralTolerance,
      assistantsTolerance,
    };
  }

  // 5) Validaciones finales: choques y equipos en 4 jornadas
  let scheduleConflicts: ScheduleConflict[] | undefined;
  let recentTeamConflicts: Conflict[] | undefined;

  if (kickoffDate) {
    scheduleConflicts = await findScheduleConflicts({
      leagueId,
      matchId,
      kickoff: kickoffDate,
      centralRefereeId: chosenCentral.id,
      aa1RefereeId: chosenAa1.id,
      aa2RefereeId: chosenAa2.id,
    });
  }

  if (matchdayNumber != null && homeTeamId && awayTeamId) {
    recentTeamConflicts = await findRecentTeamConflicts({
      leagueId,
      groupId,
      currentMatchdayNumber: matchdayNumber,
      homeTeamId,
      awayTeamId,
      centralRefereeId: chosenCentral.id,
      aa1RefereeId: chosenAa1.id,
      aa2RefereeId: chosenAa2.id,
      currentMatchId: matchId,
    });
  }

  const hasScheduleConflicts = (scheduleConflicts?.length ?? 0) > 0;
  const hasRecentTeamConflicts = (recentTeamConflicts?.length ?? 0) > 0;

  if (hasScheduleConflicts || hasRecentTeamConflicts) {
    return {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: hasScheduleConflicts ? "BLOCKED_BY_SCHEDULE_CONFLICT" : "BLOCKED_BY_RECENT_TEAM_CONFLICT",
      mds,
      rcsCentral: chosenCentral.rcsCentral,
      centralTolerance,
      assistantsTolerance,
      scheduleConflicts,
      recentTeamConflicts,
    };
  }

  // 6) Asesor (unitario): opcional
  let chosenAssessor: CandidateRef | null = null;

  if (assessorCandidates.length > 0 && shouldAssignAssessor({ leagueData, matchData })) {
    const pool = sortWithLeaguePriority(
      assessorCandidates.filter((a) => a.id !== chosenCentral.id && a.id !== chosenAa1.id && a.id !== chosenAa2.id),
      leagueData,
    );
    if (pool.length > 0) {
      chosenAssessor = pool[0];
    }
  }

  // 7) Sugerencia OK
  return {
    leagueId,
    groupId,
    matchdayId,
    matchId,
    centralRefereeId: chosenCentral.id,
    aa1RefereeId: chosenAa1.id,
    aa2RefereeId: chosenAa2.id,
    assessorRefereeId: chosenAssessor ? chosenAssessor.id : null,

    hasSuggestion: true,
    reason: "OK",
    mds,
    rcsCentral: chosenCentral.rcsCentral,
    centralTolerance,
    assistantsTolerance,
  };
}

/* ------------------------------------------------------------------ */
/* Motor batch balanceado: varios partidos                            */
/* ------------------------------------------------------------------ */

/**
 * Sugiere ternas para una lista de partidos, intentando:
 * - Repartir a los árbitros en el lote (no repetirlos hasta que sea necesario).
 * - Respetar MDS/RCS, rolesAllowed, status "DISPONIBLE".
 * - No proponer terna si el partido ya tiene terna en Firestore.
 * - Asignar asesor automáticamente en Liga TDP (no en TDP femenil).
 * - Evitar repetir parejas de compañeros en la misma jornada.
 */
export async function suggestTernasForMatchesBalanced(
  matches: SuggestTernaForMatchParams[],
): Promise<SuggestedTerna[]> {
  const db = getFirestore();

  if (matches.length === 0) return [];

  // 1) Pool global de árbitros (una sola vez)
  const allRefs = await loadRefereeCandidates();
  const basePool = filterBasePool(allRefs);

  if (basePool.length === 0) {
    return matches.map((m) => ({
      leagueId: m.leagueId,
      groupId: m.groupId,
      matchdayId: m.matchdayId,
      matchId: m.matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "NO_AVAILABLE_REFEREES",
      mds: null,
      rcsCentral: null,
      centralTolerance: 0,
      assistantsTolerance: 0,
    }));
  }

  const { centralCandidates, assistantCandidates } = splitCandidatesByRole(basePool);
  const assessorCandidates = getAssessorCandidates(basePool);

  if (centralCandidates.length === 0 || assistantCandidates.length === 0) {
    return matches.map((m) => ({
      leagueId: m.leagueId,
      groupId: m.groupId,
      matchdayId: m.matchdayId,
      matchId: m.matchId,
      centralRefereeId: null,
      aa1RefereeId: null,
      aa2RefereeId: null,
      assessorRefereeId: null,

      hasSuggestion: false,
      reason: "NO_ROLE_CANDIDATES",
      mds: null,
      rcsCentral: null,
      centralTolerance: 0,
      assistantsTolerance: 0,
    }));
  }

  // 2) Cache de tolerancias + leagueData por liga
  const leagueCfgCache = new Map<string, { centralTolerance: number; assistantsTolerance: number; leagueData: any }>();

  // 3) Estado de uso dentro del batch (para repartir)
  const usedInBatch = new Set<string>();

  // 4) Estado de parejas usadas dentro del batch (para variar compañeros)
  const pairUsedInBatch = new Set<string>(); // e.g. "ref1#ref2"

  const results: SuggestedTerna[] = [];

  for (const { leagueId, groupId, matchdayId, matchId } of matches) {
    // 2.a) Liga (tolerancias) con cache
    let leagueCfg = leagueCfgCache.get(leagueId);

    if (!leagueCfg) {
      const leagueSnap = await db.collection("leagues").doc(leagueId).get();
      if (!leagueSnap.exists) {
        results.push({
          leagueId,
          groupId,
          matchdayId,
          matchId,
          centralRefereeId: null,
          aa1RefereeId: null,
          aa2RefereeId: null,
          assessorRefereeId: null,

          hasSuggestion: false,
          reason: "LEAGUE_NOT_FOUND",
          mds: null,
          rcsCentral: null,
          centralTolerance: 0,
          assistantsTolerance: 0,
        });
        continue;
      }

      const leagueData = leagueSnap.data() as any;
      const assignmentsCfg = leagueData?.assignments ?? {};

      const centralTolRaw = assignmentsCfg?.centralTolerance;
      const assistantsTolRaw = assignmentsCfg?.assistantsTolerance;

      const centralTolerance = typeof centralTolRaw === "number" && Number.isFinite(centralTolRaw) ? centralTolRaw : 1;
      const assistantsTolerance =
        typeof assistantsTolRaw === "number" && Number.isFinite(assistantsTolRaw) ? assistantsTolRaw : 1;

      leagueCfg = { centralTolerance, assistantsTolerance, leagueData };
      leagueCfgCache.set(leagueId, leagueCfg);
    }

    const { centralTolerance, assistantsTolerance, leagueData } = leagueCfg;

    // 2.b) Partido
    const matchRef = db
      .collection("leagues")
      .doc(leagueId)
      .collection("groups")
      .doc(groupId)
      .collection("matchdays")
      .doc(matchdayId)
      .collection("matches")
      .doc(matchId);

    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: null,
        aa1RefereeId: null,
        aa2RefereeId: null,
        assessorRefereeId: null,

        hasSuggestion: false,
        reason: "MATCH_NOT_FOUND",
        mds: null,
        rcsCentral: null,
        centralTolerance,
        assistantsTolerance,
      });
      continue;
    }

    const matchData = matchSnap.data() as any;

    // Si el partido ya tiene terna, no proponemos otra
    if (matchData.centralRefereeId || matchData.aa1RefereeId || matchData.aa2RefereeId) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: null,
        aa1RefereeId: null,
        aa2RefereeId: null,
        assessorRefereeId: null,

        hasSuggestion: false,
        reason: "ALREADY_HAS_ASSIGNMENT",
        mds: null,
        rcsCentral: null,
        centralTolerance,
        assistantsTolerance,
      });
      continue;
    }

    const homeTeamId: string | undefined = matchData?.homeTeamId;
    const awayTeamId: string | undefined = matchData?.awayTeamId;

    // matchdayNumber para findRecentTeamConflicts
    const matchdaySnap = await matchRef.parent.parent!.get(); // parent: matchdays/{matchdayId}
    const matchdayData = (matchdaySnap.exists ? matchdaySnap.data() : null) as any;
    const matchdayNumber: number | null = typeof matchdayData?.number === "number" ? matchdayData.number : null;

    const kickoffDate = toDateSafe(matchData?.kickoff ?? matchData?.date);
    const mds = await computeMdsForMatch({ leagueId, groupId, matchData });

    // 3) Filtro por MDS ↔ RCS usando el pool global + prioridad TDP
    const eligibleCentralsRaw = filterCentralByMds(centralCandidates, mds, centralTolerance);
    const eligibleAssistantsRaw = filterAssistantsByMds(assistantCandidates, mds, assistantsTolerance);

    const eligibleCentrals = sortWithLeaguePriority(eligibleCentralsRaw, leagueData);
    const eligibleAssistants = sortWithLeaguePriority(eligibleAssistantsRaw, leagueData);

    if (eligibleCentrals.length === 0 || eligibleAssistants.length === 0) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: null,
        aa1RefereeId: null,
        aa2RefereeId: null,
        assessorRefereeId: null,

        hasSuggestion: false,
        reason: "NO_ROLE_CANDIDATES",
        mds,
        rcsCentral: null,
        centralTolerance,
        assistantsTolerance,
      });
      continue;
    }

    // 4) Elegir central intentando no repetir en el batch
    let chosenCentral = pickFirstNotUsed(eligibleCentrals, usedInBatch);
    chosenCentral ??= eligibleCentrals[0] ?? null;

    if (!chosenCentral) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: null,
        aa1RefereeId: null,
        aa2RefereeId: null,
        assessorRefereeId: null,

        hasSuggestion: false,
        reason: "NO_CENTRAL_AFTER_MDS_FILTER",
        mds,
        rcsCentral: null,
        centralTolerance,
        assistantsTolerance,
      });
      continue;
    }

    // 5) Asistentes: no repetir central y preferir no repetidos / no mismas parejas
    const assistantPoolFiltered = eligibleAssistants.filter((a) => a.id !== chosenCentral.id);

    if (assistantPoolFiltered.length < 2) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: null,
        aa1RefereeId: null,
        aa2RefereeId: null,
        assessorRefereeId: null,

        hasSuggestion: false,
        reason: "NOT_ENOUGH_ASSISTANTS",
        mds,
        rcsCentral: chosenCentral.rcsCentral,
        centralTolerance,
        assistantsTolerance,
      });
      continue;
    }

    let chosenAa1 = pickAssistantAvoidingPairs(assistantPoolFiltered, usedInBatch, chosenCentral.id, pairUsedInBatch);
    chosenAa1 ??= assistantPoolFiltered[0];

    const assistantPoolForAa2 = assistantPoolFiltered.filter((a) => a.id !== chosenAa1.id);
    let chosenAa2 = pickAssistantAvoidingPairs(
      assistantPoolForAa2,
      usedInBatch,
      chosenCentral.id,
      pairUsedInBatch,
      chosenAa1.id,
    );
    chosenAa2 ??= assistantPoolForAa2[0] ?? null;

    if (!chosenAa1 || !chosenAa2) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: null,
        aa1RefereeId: null,
        aa2RefereeId: null,
        assessorRefereeId: null,

        hasSuggestion: false,
        reason: "NOT_ENOUGH_ASSISTANTS_IN_BATCH",
        mds,
        rcsCentral: chosenCentral.rcsCentral,
        centralTolerance,
        assistantsTolerance,
      });
      continue;
    }

    // 6) Validaciones finales: choques y equipos en 4 jornadas
    let scheduleConflicts: ScheduleConflict[] | undefined;
    let recentTeamConflicts: Conflict[] | undefined;

    if (kickoffDate) {
      scheduleConflicts = await findScheduleConflicts({
        leagueId,
        matchId,
        kickoff: kickoffDate,
        centralRefereeId: chosenCentral.id,
        aa1RefereeId: chosenAa1.id,
        aa2RefereeId: chosenAa2.id,
      });
    }

    if (matchdayNumber != null && homeTeamId && awayTeamId) {
      recentTeamConflicts = await findRecentTeamConflicts({
        leagueId,
        groupId,
        currentMatchdayNumber: matchdayNumber,
        homeTeamId,
        awayTeamId,
        centralRefereeId: chosenCentral.id,
        aa1RefereeId: chosenAa1.id,
        aa2RefereeId: chosenAa2.id,
        currentMatchId: matchId,
      });
    }

    const hasScheduleConflicts = (scheduleConflicts?.length ?? 0) > 0;
    const hasRecentTeamConflicts = (recentTeamConflicts?.length ?? 0) > 0;

    if (hasScheduleConflicts || hasRecentTeamConflicts) {
      // No marcamos como usados porque realmente no se podría usar esta terna
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: null,
        aa1RefereeId: null,
        aa2RefereeId: null,
        assessorRefereeId: null,

        hasSuggestion: false,
        reason: hasScheduleConflicts ? "BLOCKED_BY_SCHEDULE_CONFLICT" : "BLOCKED_BY_RECENT_TEAM_CONFLICT",
        mds,
        rcsCentral: chosenCentral.rcsCentral,
        centralTolerance,
        assistantsTolerance,
        scheduleConflicts,
        recentTeamConflicts,
      });
      continue;
    }

    // 7) Asesor balanceado en batch (solo si aplica la regla de Liga TDP)
    let chosenAssessor: CandidateRef | null = null;

    if (assessorCandidates.length > 0 && shouldAssignAssessor({ leagueData, matchData })) {
      const assessorPoolFiltered = assessorCandidates.filter(
        (a) => a.id !== chosenCentral.id && a.id !== chosenAa1.id && a.id !== chosenAa2.id,
      );

      const assessorPoolSorted = sortWithLeaguePriority(assessorPoolFiltered, leagueData);

      if (assessorPoolSorted.length > 0) {
        let pick = pickFirstNotUsed(assessorPoolSorted, usedInBatch);
        pick ??= assessorPoolSorted[0];
        chosenAssessor = pick;
      }
    }

    // 8) Sugerencia OK → marcamos usados en el batch + parejas para variar compañeros
    usedInBatch.add(chosenCentral.id);
    usedInBatch.add(chosenAa1.id);
    usedInBatch.add(chosenAa2.id);
    if (chosenAssessor) {
      usedInBatch.add(chosenAssessor.id);
    }

    // parejas central–asistentes y entre asistentes
    pairUsedInBatch.add(`${chosenCentral.id}#${chosenAa1.id}`);
    pairUsedInBatch.add(`${chosenCentral.id}#${chosenAa2.id}`);
    pairUsedInBatch.add(`${chosenAa1.id}#${chosenAa2.id}`);

    results.push({
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId: chosenCentral.id,
      aa1RefereeId: chosenAa1.id,
      aa2RefereeId: chosenAa2.id,
      assessorRefereeId: chosenAssessor ? chosenAssessor.id : null,

      hasSuggestion: true,
      reason: "OK_BATCH",
      mds,
      rcsCentral: chosenCentral.rcsCentral,
      centralTolerance,
      assistantsTolerance,
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/* Versión batch por jornada (usa motor balanceado)                   */
/* ------------------------------------------------------------------ */

export type SuggestTernasForMatchdayParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
};

/**
 * Sugiere ternas para TODOS los partidos de una jornada.
 *
 * Útil para el botón “Generar ternas sugeridas” a nivel jornada.
 *
 * Usa el motor balanceado para repartir árbitros en esa jornada.
 */
export async function suggestTernasForMatchday(params: SuggestTernasForMatchdayParams): Promise<SuggestedTerna[]> {
  const { leagueId, groupId, matchdayId } = params;

  const db = getFirestore();
  const matchesSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("groups")
    .doc(groupId)
    .collection("matchdays")
    .doc(matchdayId)
    .collection("matches")
    .get();

  const matchParams: SuggestTernaForMatchParams[] = matchesSnap.docs.map((m) => ({
    leagueId,
    groupId,
    matchdayId,
    matchId: m.id,
  }));

  return suggestTernasForMatchesBalanced(matchParams);
}
