// src/server/services/assignments/terna-batch.ts
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";

import {
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
  isTdpLeague,
} from "./terna-helpers";
import type {
  CandidateRef,
  SuggestedTerna,
  SuggestTernaForMatchParams,
  SuggestTernasForMatchdayParams,
} from "./terna-types";

/* ------------------------------------------------------------------ */
/* Config especial TDP femenil                                        */
/* ------------------------------------------------------------------ */

// RCS "máximo" para considerarlo regular / bajito en TDP Femenil
// (con tus datos: 2 = EN_DESARROLLO, 3 = EXPERIMENTADO, 4 = MUY_EXPERIMENTADO)
// Aquí incluimos 2 y 3 como prioridad.
const TDP_FEMENIL_MAX_RCS = 3;

function isTdpFemenilLeague(leagueData: any): boolean {
  const slug = (leagueData?.slug ?? "").toString().toLowerCase();
  const name = (leagueData?.name ?? "").toString().toLowerCase();

  // Con lo que me mandaste: slug = "liga-tdp-femenil-2025-2026"
  // Esto es robusto si cambias ligeramente el nombre.
  return (slug.includes("tdp") && slug.includes("femenil")) ?? (name.includes("tdp") && name.includes("femenil"));
}

/**
 * Reordena la lista para que primero vayan los árbitros con RCS bajo.
 * NO filtra en duro, solo reordena (low → high).
 */
function preferLowRcsFirst(candidates: CandidateRef[], threshold: number): CandidateRef[] {
  if (candidates.length === 0) return candidates;

  const lowRcs = candidates.filter((c) => (c.rcsCentral ?? Infinity) <= threshold);
  if (lowRcs.length === 0) return candidates;

  const highRcs = candidates.filter((c) => (c.rcsCentral ?? Infinity) > threshold);

  return [...lowRcs, ...highRcs];
}

/* ------------------------------------------------------------------ */
/* Prioridad extra: category "TDP" en TDP Femenil                      */
/* ------------------------------------------------------------------ */

/**
 * Asigna un "ranking" para TDP femenil considerando:
 *  0 = category "TDP" + RCS <= threshold (más prioridad)
 *  1 = category "TDP" + RCS > threshold
 *  2 = NO "TDP" + RCS <= threshold
 *  3 = resto
 */
function tdpFemRank(c: CandidateRef): number {
  const cat = (c.category ?? "").toUpperCase();
  const isTdpCat = cat.includes("TDP");
  const rcs = c.rcsCentral ?? Infinity;
  const lowRcs = rcs <= TDP_FEMENIL_MAX_RCS;

  if (isTdpCat && lowRcs) return 0;
  if (isTdpCat && !lowRcs) return 1;
  if (!isTdpCat && lowRcs) return 2;
  return 3;
}

/**
 * Ordena candidatos para TDP femenil:
 *  1º category "TDP" con RCS bajito,
 *  2º category "TDP" con RCS alto,
 *  3º resto con RCS bajito,
 *  4º el resto.
 * Dentro de cada bucket, RCS más bajo primero.
 */
function sortForTdpFemenil(candidates: CandidateRef[]): CandidateRef[] {
  if (candidates.length === 0) return candidates;

  return [...candidates].sort((a, b) => {
    const ra = tdpFemRank(a);
    const rb = tdpFemRank(b);
    if (ra !== rb) return ra - rb;

    const rcsA = a.rcsCentral ?? Infinity;
    const rcsB = b.rcsCentral ?? Infinity;
    return rcsA - rcsB;
  });
}

/* ------------------------------------------------------------------ */
/* Helper para quitar sesgo por orden alfabético                      */
/* ------------------------------------------------------------------ */

/**
 * Hash sencillo de string a entero (determinista).
 * No es criptográfico, solo para rotar el array de forma estable por partido.
 */
function hashStringToInt(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // fuerza a int32
  }
  return hash;
}

/**
 * Rota el array según una llave (por ejemplo, el id del partido).
 * Mantiene el orden relativo, solo cambia el "punto de arranque".
 */
function rotateArrayByKey<T>(items: T[], key: string): T[] {
  const len = items.length;
  if (len === 0) return items;

  const hash = Math.abs(hashStringToInt(key));
  const offset = hash % len;

  if (offset === 0) return items;

  return [...items.slice(offset), ...items.slice(0, offset)];
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

  // Cache de tolerancias + leagueData por liga
  const leagueCfgCache = new Map<string, { centralTolerance: number; assistantsTolerance: number; leagueData: any }>();

  // Estado de uso dentro del batch (para repartir)
  const usedInBatch = new Set<string>();

  // Estado de parejas usadas dentro del batch (para variar compañeros)
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
    const isTdpFem = isTdpFemenilLeague(leagueData);
    const isTdp = isTdpLeague(leagueData); // 👈 nuevo

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

    const kickoffDate = matchData?.kickoff ?? matchData?.date; // solo para MDS helper (por si luego lo usas)
    const mds = await computeMdsForMatch({ leagueId, groupId, matchData });

    // 3) Filtro por MDS ↔ RCS usando el pool global + prioridad liga
    let eligibleCentralsRaw: CandidateRef[];
    let eligibleAssistantsRaw: CandidateRef[];

    if (isTdpFem) {
      // 🔥 En TDP Femenil NO filtramos por MDS, dejamos entrar todo el pool
      eligibleCentralsRaw = centralCandidates;
      eligibleAssistantsRaw = assistantCandidates;
    } else {
      // Resto de ligas → lógica normal MDS/RCS (RCS alto para partidos duros)
      eligibleCentralsRaw = filterCentralByMds(centralCandidates, mds, centralTolerance);
      eligibleAssistantsRaw = filterAssistantsByMds(assistantCandidates, mds, assistantsTolerance);
    }

    let eligibleCentrals = sortWithLeaguePriority(eligibleCentralsRaw, leagueData);
    let eligibleAssistants = sortWithLeaguePriority(eligibleAssistantsRaw, leagueData);

    // 👉 Para TDP femenil: priorizar category "TDP" + RCS bajito
    // 👉 Para TDP femenil: priorizar category "TDP" + RCS bajito
    if (isTdpFem) {
      eligibleCentrals = sortForTdpFemenil(eligibleCentrals);
      eligibleAssistants = sortForTdpFemenil(eligibleAssistants);
    }

    // Quitar sesgo de orden alfabético: rotamos la lista según la llave del partido
    const rotationKeyBase = `${leagueId}#${groupId}#${matchdayId}#${matchId}`;

    if (!isTdp) {
      eligibleCentrals = rotateArrayByKey(eligibleCentrals, rotationKeyBase + "#CENTRAL");
      eligibleAssistants = rotateArrayByKey(eligibleAssistants, rotationKeyBase + "#ASSISTANT");
    }

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

    // 6) Asesor balanceado en batch (solo si aplica la regla de Liga TDP varonil)
    let chosenAssessor: CandidateRef | null = null;

    if (assessorCandidates.length > 0 && shouldAssignAssessor({ leagueData, matchData })) {
      const assessorPoolFiltered = assessorCandidates.filter(
        (a) => a.id !== chosenCentral.id && a.id !== chosenAa1.id && a.id !== chosenAa2.id,
      );

      let assessorPoolSorted = sortWithLeaguePriority(assessorPoolFiltered, leagueData);
      assessorPoolSorted = rotateArrayByKey(assessorPoolSorted, rotationKeyBase + "#ASSESSOR");

      if (assessorPoolSorted.length > 0) {
        let pick = pickFirstNotUsed(assessorPoolSorted, usedInBatch);
        pick ??= assessorPoolSorted[0];
        chosenAssessor = pick;
      }
    }

    // 7) Sugerencia OK → marcamos usados en el batch + parejas para variar compañeros
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
/* Versión batch por jornada                                          */
/* ------------------------------------------------------------------ */

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
