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
 * Conflicto por partido el mismo día calendario (soft-block)
 */
export type SameDayConflictRole = "CENTRAL" | "AA1" | "AA2" | "FOURTH" | "ASSESSOR";

export type SameDayConflict = {
  refereeId: string;
  refereeRole: SameDayConflictRole;
  otherMatchId: string;
  otherMatchKickoffIso: string | null;
  otherHomeTeamName: string | null;
  otherAwayTeamName: string | null;
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

  if (!Number.isFinite(currentMatchdayNumber) || currentMatchdayNumber <= 0) {
    return [];
  }

  const minMatchday = currentMatchdayNumber - (windowSize - 1);
  const maxMatchday = currentMatchdayNumber; // incluimos la actual

  const db = getFirestore();
  const groupRef = db.collection("leagues").doc(leagueId).collection("groups").doc(groupId);

  // 🔥 Solo jornadas dentro de la ventana [minMatchday, maxMatchday]
  const matchdaysSnap = await groupRef
    .collection("matchdays")
    .where("number", ">=", minMatchday)
    .where("number", "<=", maxMatchday)
    .get();

  const conflicts: Conflict[] = [];
  const ternaRefIds = new Set([centralRefereeId, aa1RefereeId, aa2RefereeId].filter(Boolean));

  for (const md of matchdaysSnap.docs) {
    const mdData = md.data() as any;
    const mdNumber = typeof mdData.number === "number" ? mdData.number : null;
    if (mdNumber == null) continue;

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

  const conflicts: ScheduleConflict[] = [];
  const ternaRefIds = new Set([centralRefereeId, aa1RefereeId, aa2RefereeId].filter(Boolean));

  // 🔥 Un solo query por toda la liga filtrando por leagueId + kickoff
  const matchesSnap = await db
    .collectionGroup("matches")
    .where("leagueId", "==", leagueId)
    .where("kickoff", "==", kickoff)
    .get();

  for (const m of matchesSnap.docs) {
    // Nos saltamos el mismo partido
    if (m.id === matchId) continue;

    const data = m.data() as any;
    const groupId: string = (data.groupId ?? data.groupID ?? data.group_id ?? "").toString() ?? "unknown-group";

    collectScheduleConflictsFromMatch({
      matchDoc: m,
      leagueId,
      groupId,
      matchIdToSkip: matchId,
      ternaRefIds,
      conflicts,
    });
  }

  return conflicts;
}

type FindSameDayConflictsParams = {
  leagueId: string;
  matchId: string;
  kickoff: Date;
  centralRefereeId: string;
  aa1RefereeId: string;
  aa2RefereeId: string;
  fourthRefereeId?: string | null;
  assessorRefereeId?: string | null;
};

/** Helper para no pasar max-depth en findSameDayConflicts */
function collectSameDayConflictsFromMatch(options: {
  matchDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;
  matchIdToSkip: string;
  refSlots: Array<{ refereeId: string; role: SameDayConflictRole }>;
  refIdSet: Set<string>;
  conflicts: SameDayConflict[];
}): void {
  const { matchDoc, matchIdToSkip, refSlots, refIdSet, conflicts } = options;

  if (matchDoc.id === matchIdToSkip) return;

  const data = matchDoc.data() as any;

  const otherSlots: Array<{ refereeId?: string }> = [
    { refereeId: data.centralRefereeId ?? undefined },
    { refereeId: data.aa1RefereeId ?? undefined },
    { refereeId: data.aa2RefereeId ?? undefined },
    { refereeId: data.fourthRefereeId ?? undefined },
    { refereeId: data.assessorRefereeId ?? undefined },
  ];

  const otherRefIds = new Set(otherSlots.map((s) => s.refereeId).filter(Boolean) as string[]);

  const kickoffIso = normalizeKickoffToIso(data.kickoff ?? null);
  const homeTeamName: string | null = data.homeTeamName ?? null;
  const awayTeamName: string | null = data.awayTeamName ?? null;

  for (const slot of refSlots) {
    if (!refIdSet.has(slot.refereeId)) continue;
    if (!otherRefIds.has(slot.refereeId)) continue;

    conflicts.push({
      refereeId: slot.refereeId,
      refereeRole: slot.role,
      otherMatchId: matchDoc.id,
      otherMatchKickoffIso: kickoffIso,
      otherHomeTeamName: homeTeamName,
      otherAwayTeamName: awayTeamName,
    });
  }
}

/**
 * Regla de "Mismo día calendario" (soft-block):
 * Busca partidos del mismo día (America/Mexico_City) en la liga
 * donde un árbitro de los 5 slots ya esté asignado.
 */
export async function findSameDayConflicts(params: FindSameDayConflictsParams): Promise<SameDayConflict[]> {
  const {
    leagueId,
    matchId,
    kickoff,
    centralRefereeId,
    aa1RefereeId,
    aa2RefereeId,
    fourthRefereeId,
    assessorRefereeId,
  } = params;

  // Convert kickoff to calendar date in America/Mexico_City
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = formatter.format(kickoff); // "YYYY-MM-DD"

  // Build start/end of day in Mexico City timezone
  // Parse the date string and create boundaries using the timezone offset
  const startOfDayLocal = new Date(`${dateStr}T00:00:00`);
  const endOfDayLocal = new Date(`${dateStr}T23:59:59.999`);

  // Get UTC equivalents by computing the offset for America/Mexico_City
  // We use a trick: format a known date in the target TZ, parse it, and diff
  const getMexicoCityOffset = (d: Date): number => {
    const utcStr = d.toISOString();
    const mxParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const get = (type: string) => parseInt(mxParts.find((p) => p.type === type)?.value ?? "0", 10);
    const mxDate = new Date(
      Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")),
    );
    return mxDate.getTime() - d.getTime();
  };

  const offset = getMexicoCityOffset(kickoff);
  const startOfDayUtc = new Date(startOfDayLocal.getTime() - offset);
  const endOfDayUtc = new Date(endOfDayLocal.getTime() - offset);

  const db = getFirestore();

  // Build referee slots to check
  const refSlots: Array<{ refereeId: string; role: SameDayConflictRole }> = [];
  if (centralRefereeId) refSlots.push({ refereeId: centralRefereeId, role: "CENTRAL" });
  if (aa1RefereeId) refSlots.push({ refereeId: aa1RefereeId, role: "AA1" });
  if (aa2RefereeId) refSlots.push({ refereeId: aa2RefereeId, role: "AA2" });
  if (fourthRefereeId) refSlots.push({ refereeId: fourthRefereeId, role: "FOURTH" });
  if (assessorRefereeId) refSlots.push({ refereeId: assessorRefereeId, role: "ASSESSOR" });

  const refIdSet = new Set(refSlots.map((s) => s.refereeId));

  if (refIdSet.size === 0) return [];

  const matchesSnap = await db
    .collectionGroup("matches")
    .where("leagueId", "==", leagueId)
    .where("kickoff", ">=", startOfDayUtc)
    .where("kickoff", "<=", endOfDayUtc)
    .get();

  const conflicts: SameDayConflict[] = [];

  for (const m of matchesSnap.docs) {
    collectSameDayConflictsFromMatch({
      matchDoc: m,
      matchIdToSkip: matchId,
      refSlots,
      refIdSet,
      conflicts,
    });
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
