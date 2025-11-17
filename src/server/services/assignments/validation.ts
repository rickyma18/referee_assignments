// src/server/services/assignments/validation.ts
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";

/**
 * Conflicto por equipo pitado en < 4 jornadas
 */
export type ConflictRole = "CENTRAL" | "AA1" | "AA2";

export type Conflict = {
  refereeId: string;
  refereeRole: ConflictRole;
  teamId: string;
  teamName: string;
  matchId: string;
  matchdayNumber: number;
  matchKickoffIso: string | null;
};

/**
 * Conflicto de horario (Choque) para un árbitro
 */
export type ScheduleConflict = {
  refereeId: string;
  refereeRole: ConflictRole;
  otherMatchId: string;
  otherMatchPath: string;
  otherMatchKickoffIso: string | null;
  leagueId: string;
  groupId: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
};

/**
 * Política para cuando el RCS del central queda por debajo de MDS - tolerancia
 */
export type RcsEvaluationPolicy = "NONE" | "WARN" | "BLOCK";

export type RcsEvaluation = {
  mds: number | null;
  rcsCentral: number | null;
  tolerance: number; // tolerancia de la temporada
  policy: RcsEvaluationPolicy;
  belowThreshold: boolean;
};

type FindRecentTeamConflictsParams = {
  leagueId: string;
  groupId: string;
  currentMatchdayNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  centralRefereeId: string;
  aa1RefereeId: string;
  aa2RefereeId: string;
  windowSize?: number; // por defecto 4 jornadas hacia atrás
  currentMatchId?: string; // opcional por si reasignas terna
};

type FindScheduleConflictsParams = {
  leagueId: string;
  matchId: string;
  kickoff: Date;
  centralRefereeId: string;
  aa1RefereeId: string;
  aa2RefereeId: string;
};

/** Normaliza un campo kickoff / Timestamp / Date a ISO string o null */
function normalizeKickoffToIso(raw: unknown): string | null {
  if (!raw) return null;

  try {
    const dateValue =
      raw instanceof Date ? raw : typeof (raw as any).toDate === "function" ? (raw as any).toDate() : null;

    return dateValue ? dateValue.toISOString() : null;
  } catch {
    return null;
  }
}

/** Helper para no pasar el límite de max-depth en findRecentTeamConflicts */
function collectTeamConflictsFromMatch(options: {
  matchDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;
  mdNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  currentMatchId?: string;
  ternaRefIds: Set<string>;
  conflicts: Conflict[];
}): void {
  const { matchDoc, mdNumber, homeTeamId, awayTeamId, currentMatchId, ternaRefIds, conflicts } = options;

  if (currentMatchId && matchDoc.id === currentMatchId) return;

  const data = matchDoc.data() as any;

  const matchHomeTeamId: string | undefined = data.homeTeamId;
  const matchAwayTeamId: string | undefined = data.awayTeamId;

  const matchTeams = [
    { teamId: matchHomeTeamId, teamName: data.homeTeamName ?? null },
    { teamId: matchAwayTeamId, teamName: data.awayTeamName ?? null },
  ];

  // Equipos que coinciden con el local/visitante actual
  const relevantTeams = matchTeams.filter((team) => {
    if (!team.teamId) return false;
    return team.teamId === homeTeamId || team.teamId === awayTeamId;
  });

  if (relevantTeams.length === 0) return;

  const centralId: string | undefined = data.centralRefereeId ?? undefined;
  const aa1Id: string | undefined = data.aa1RefereeId ?? undefined;
  const aa2Id: string | undefined = data.aa2RefereeId ?? undefined;

  const refSlots: Array<{ refereeId?: string; role: ConflictRole }> = [
    { refereeId: centralId, role: "CENTRAL" },
    { refereeId: aa1Id, role: "AA1" },
    { refereeId: aa2Id, role: "AA2" },
  ];

  const kickoffIso = normalizeKickoffToIso(data.kickoff ?? data.date);

  for (const slot of refSlots) {
    if (!slot.refereeId || !ternaRefIds.has(slot.refereeId)) continue;

    for (const team of relevantTeams) {
      conflicts.push({
        refereeId: slot.refereeId,
        refereeRole: slot.role,
        teamId: team.teamId!,
        teamName: team.teamName ?? "",
        matchId: matchDoc.id,
        matchdayNumber: mdNumber,
        matchKickoffIso: kickoffIso,
      });
    }
  }
}

/** Helper para no pasar max-depth en findScheduleConflicts */
function collectScheduleConflictsFromMatch(options: {
  matchDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;
  leagueId: string;
  groupId: string;
  matchIdToSkip: string;
  ternaRefIds: Set<string>;
  conflicts: ScheduleConflict[];
}): void {
  const { matchDoc, leagueId, groupId, matchIdToSkip, ternaRefIds, conflicts } = options;

  if (matchDoc.id === matchIdToSkip) return;

  const data = matchDoc.data() as any;

  const centralId: string | undefined = data.centralRefereeId ?? undefined;
  const aa1Id: string | undefined = data.aa1RefereeId ?? undefined;
  const aa2Id: string | undefined = data.aa2RefereeId ?? undefined;

  const refSlots: Array<{ refereeId?: string; role: ConflictRole }> = [
    { refereeId: centralId, role: "CENTRAL" },
    { refereeId: aa1Id, role: "AA1" },
    { refereeId: aa2Id, role: "AA2" },
  ];

  const kickoffIso = normalizeKickoffToIso(data.kickoff ?? null);
  const homeTeamName: string | null = data.homeTeamName ?? null;
  const awayTeamName: string | null = data.awayTeamName ?? null;

  for (const slot of refSlots) {
    if (!slot.refereeId || !ternaRefIds.has(slot.refereeId)) continue;

    conflicts.push({
      refereeId: slot.refereeId,
      refereeRole: slot.role,
      otherMatchId: matchDoc.id,
      otherMatchPath: matchDoc.ref.path,
      otherMatchKickoffIso: kickoffIso,
      leagueId,
      groupId,
      homeTeamName,
      awayTeamName,
    });
  }
}

export async function findRecentTeamConflicts(params: FindRecentTeamConflictsParams): Promise<Conflict[]> {
  const {
    leagueId,
    groupId,
    currentMatchdayNumber,
    homeTeamId,
    awayTeamId,
    centralRefereeId,
    aa1RefereeId,
    aa2RefereeId,
    windowSize = 4,
    currentMatchId,
  } = params;

  const minMatchday = currentMatchdayNumber - (windowSize - 1);
  // 👇 Ahora incluimos la jornada actual en el rango
  const maxMatchday = currentMatchdayNumber;

  if (!Number.isFinite(currentMatchdayNumber) || currentMatchdayNumber <= 0) {
    return [];
  }

  const db = getFirestore();
  const groupRef = db.collection("leagues").doc(leagueId).collection("groups").doc(groupId);

  const matchdaysSnap = await groupRef.collection("matchdays").get();

  const conflicts: Conflict[] = [];
  const ternaRefIds = new Set([centralRefereeId, aa1RefereeId, aa2RefereeId].filter(Boolean));

  for (const md of matchdaysSnap.docs) {
    const mdData = md.data() as any;
    const mdNumber = typeof mdData.number === "number" ? mdData.number : null;
    if (mdNumber == null) continue;

    // Solo jornadas dentro de la ventana (incluyendo la actual)
    if (mdNumber < minMatchday || mdNumber > maxMatchday) continue;

    const matchesSnap = await md.ref.collection("matches").get();

    for (const m of matchesSnap.docs) {
      collectTeamConflictsFromMatch({
        matchDoc: m,
        mdNumber,
        homeTeamId,
        awayTeamId,
        currentMatchId,
        ternaRefIds,
        conflicts,
      });
    }
  }

  return conflicts;
}

/**
 * Regla de "Choque de horario":
 * Busca en TODOS los partidos de la liga alguno con el mismo kickoff
 * donde un árbitro de la terna ya esté asignado.
 *
 * ⚠️ Bloqueo duro en historia 5.2.
 * ⚠️ Solo revisa dentro de la MISMA liga (no cross-liga).
 */
export async function findScheduleConflicts(params: FindScheduleConflictsParams): Promise<ScheduleConflict[]> {
  const { leagueId, matchId, kickoff, centralRefereeId, aa1RefereeId, aa2RefereeId } = params;

  const db = getFirestore();
  const leagueRef = db.collection("leagues").doc(leagueId);

  const groupsSnap = await leagueRef.collection("groups").get();

  const conflicts: ScheduleConflict[] = [];
  const ternaRefIds = new Set([centralRefereeId, aa1RefereeId, aa2RefereeId].filter(Boolean));

  for (const g of groupsSnap.docs) {
    const groupId = g.id;
    const matchdaysSnap = await g.ref.collection("matchdays").get();

    for (const md of matchdaysSnap.docs) {
      const matchesSnap = await md.ref.collection("matches").where("kickoff", "==", kickoff).get();

      for (const m of matchesSnap.docs) {
        collectScheduleConflictsFromMatch({
          matchDoc: m,
          leagueId,
          groupId,
          matchIdToSkip: matchId,
          ternaRefIds,
          conflicts,
        });
      }
    }
  }

  return conflicts;
}

type EvaluateCentralRcsParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchId: string;
  centralRefereeId: string;
};

/**
 * Evalúa MDS vs RCS_central.
 *
 * Convención propuesta (puedes ajustarla en tus docs):
 * - En el doc de partido: campo numérico `mds`.
 * - En el doc de árbitro: campo numérico `rcsCentral`.
 * - En el doc de liga: objeto `assignments` con:
 *    - `centralTolerance: number` → tolerancia para el central
 *    - `centralPolicy: "NONE" | "WARN" | "BLOCK"`
 *
 * Si no hay MDS o RCS_central, belowThreshold = false (no bloquea).
 */
export async function evaluateCentralRcs(params: EvaluateCentralRcsParams): Promise<RcsEvaluation> {
  const { leagueId, groupId, matchdayId, matchId, centralRefereeId } = params;
  const db = getFirestore();

  // Liga (para tolerancia y política)
  const leagueSnap = await db.collection("leagues").doc(leagueId).get();
  const leagueData = (leagueSnap.exists ? leagueSnap.data() : null) as any;

  const assignmentsCfg = leagueData?.assignments ?? {};

  const toleranceRaw = assignmentsCfg?.centralTolerance;
  const tolerance = typeof toleranceRaw === "number" && Number.isFinite(toleranceRaw) ? toleranceRaw : 0;

  const policyRaw = (assignmentsCfg?.centralPolicy ?? "NONE").toString().toUpperCase();
  const policy: RcsEvaluationPolicy = policyRaw === "WARN" || policyRaw === "BLOCK" ? policyRaw : "NONE";

  // Partido (para MDS)
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
  const matchData = (matchSnap.exists ? matchSnap.data() : null) as any;

  const mdsRaw = matchData?.mds;
  const mds = typeof mdsRaw === "number" && Number.isFinite(mdsRaw) ? mdsRaw : null;

  // Árbitro central (para RCS)
  const refSnap = await db.collection("referees").doc(centralRefereeId).get();
  const refData = (refSnap.exists ? refSnap.data() : null) as any;

  const rcsRaw = refData?.rcsCentral;
  const rcsCentral = typeof rcsRaw === "number" && Number.isFinite(rcsRaw) ? rcsRaw : null;

  if (mds == null || rcsCentral == null) {
    return {
      mds,
      rcsCentral,
      tolerance,
      policy,
      belowThreshold: false,
    };
  }

  const threshold = mds - tolerance;
  const belowThreshold = rcsCentral < threshold;

  return {
    mds,
    rcsCentral,
    tolerance,
    belowThreshold,
    policy,
  };
}
