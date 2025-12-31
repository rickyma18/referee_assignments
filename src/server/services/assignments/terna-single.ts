// src/server/services/assignments/terna-single.ts
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";

import {
  toDateSafe,
  computeMdsForMatch,
  loadRefereeCandidates,
  filterBasePool,
  splitCandidatesByRole,
  getAssessorCandidates,
  filterCentralByMds,
  filterAssistantsByMds,
  sortWithLeaguePriority,
  shouldAssignAssessor,
} from "./terna-helpers";
import type { SuggestedTerna, SuggestTernaForMatchParams } from "./terna-types";
import { findRecentTeamConflicts, findScheduleConflicts, Conflict, ScheduleConflict } from "./validation";
/* ------------------------------------------------------------------ */
/* Motor principal: sugerir terna para un partido (unitario)          */
/* ------------------------------------------------------------------ */

export async function suggestTernaForMatch(
  params: SuggestTernaForMatchParams,
  options?: { delegateId?: string },
): Promise<SuggestedTerna> {
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

  // 3) Pool de árbitros - ✅ Multi-tenant: filtrar por delegateId
  const allRefs = await loadRefereeCandidates(options?.delegateId);
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
  let scheduleConflicts: ScheduleConflict[] | undefined = undefined;
  let recentTeamConflicts: Conflict[] | undefined = undefined;

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
  let chosenAssessor: (typeof assessorCandidates)[number] | null = null;

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
