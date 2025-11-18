// src/server/services/assignments/terna-batch.ts
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
  pickFirstNotUsed,
  pickAssistantAvoidingPairs,
  shouldAssignAssessor,
} from "./terna-helpers";
import type {
  CandidateRef,
  SuggestedTerna,
  SuggestTernaForMatchParams,
  SuggestTernasForMatchdayParams,
} from "./terna-types";

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
// src/server/services/assignments/terna-batch.ts

// ...imports igual, PERO ya no necesitas importar findRecentTeamConflicts ni findScheduleConflicts aquí
// quita estas líneas en este archivo:
// import { findRecentTeamConflicts, findScheduleConflicts } from "./validation";
// import type { Conflict, ScheduleConflict } from "./validation";

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

  const leagueCfgCache = new Map<string, { centralTolerance: number; assistantsTolerance: number; leagueData: any }>();

  const usedInBatch = new Set<string>();
  const pairUsedInBatch = new Set<string>();

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

    // Ya tiene terna → no sugerimos
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

    // MDS (aquí sí hay 0–2 lecturas extra, pero es aceptable)
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

    // 4) Central balanceado
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

    // 5) Asistentes balanceados
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
    chosenAa1 ??= assistantPoolFiltered[0] ?? null;

    const assistantPoolForAa2 = assistantPoolFiltered.filter((a) => a.id !== chosenAa1?.id);
    let chosenAa2 = pickAssistantAvoidingPairs(
      assistantPoolForAa2,
      usedInBatch,
      chosenCentral.id,
      pairUsedInBatch,
      chosenAa1?.id,
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

    // 6) Asesor (sin lecturas extra)
    let chosenAssessor: CandidateRef | null = null;

    if (assessorCandidates.length > 0 && shouldAssignAssessor({ leagueData, matchData })) {
      const assessorPoolFiltered = assessorCandidates.filter(
        (a) => a.id !== chosenCentral.id && a.id !== chosenAa1.id && a.id !== chosenAa2.id,
      );
      const assessorPoolSorted = sortWithLeaguePriority(assessorPoolFiltered, leagueData);

      if (assessorPoolSorted.length > 0) {
        let pick = pickFirstNotUsed(assessorPoolSorted, usedInBatch);
        pick ??= assessorPoolSorted[0] ?? null;
        chosenAssessor = pick;
      }
    }

    // 7) Marcamos usados (solo dentro del batch)
    usedInBatch.add(chosenCentral.id);
    usedInBatch.add(chosenAa1.id);
    usedInBatch.add(chosenAa2.id);
    if (chosenAssessor) usedInBatch.add(chosenAssessor.id);

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
