// src/server/services/assignments/terna-batch.ts
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";

import type { InternalRule } from "@/domain/referees/internal-rule.zod";

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
import {
  loadInternalRulesForReferees,
  buildMatchRuleContext,
  applyInternalRulesToScore,
  type MatchRuleContext,
} from "./terna-internal-rules";
import type {
  CandidateRef,
  SuggestedTerna,
  SuggestTernaForMatchParams,
  SuggestTernasForMatchdayParams,
} from "./terna-types";

/* ------------------------------------------------------------------ */
/* Config especial TDP femenil                                        */
/* ------------------------------------------------------------------ */

const TDP_FEMENIL_MAX_RCS = 3;

function isTdpFemenilLeague(leagueData: any): boolean {
  const slug = (leagueData?.slug ?? "").toString().toLowerCase();
  const name = (leagueData?.name ?? "").toString().toLowerCase();

  const isTdpSlug = slug.includes("tdp") && slug.includes("femenil");
  const isTdpName = name.includes("tdp") && name.includes("femenil");
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return isTdpSlug || isTdpName;
}

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

function hashStringToInt(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
}

function filterLpForTdp(candidates: CandidateRef[], leagueData: any): CandidateRef[] {
  if (!isTdpLeague(leagueData)) return candidates;

  return candidates.filter((c) => {
    const cat = (c.category ?? "").toUpperCase();
    if (cat.includes("LIGA PREMIER")) return false;
    if (cat === "LP") return false;
    if (cat.includes("PREMIER")) return false;
    return true;
  });
}

function rotateArrayByKey<T>(items: T[], key: string): T[] {
  const len = items.length;
  if (len === 0) return items;

  const hash = Math.abs(hashStringToInt(key));
  const offset = hash % len;

  if (offset === 0) return items;

  return [...items.slice(offset), ...items.slice(0, offset)];
}

type InternalRulesMap = Map<string, InternalRule[]>;

/* ------------------------------------------------------------------ */
/* Motor batch balanceado: varios partidos                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line complexity
export async function suggestTernasForMatchesBalanced(
  matches: SuggestTernaForMatchParams[],
  options?: { delegateId?: string },
): Promise<SuggestedTerna[]> {
  const db = getFirestore();

  if (matches.length === 0) return [];

  // ✅ Multi-tenant: filtrar árbitros por delegateId si se proporciona
  const allRefs = await loadRefereeCandidates(options?.delegateId);

  // 🔍 DEBUG: Log para diagnóstico

  if (allRefs.length > 0 && allRefs.length <= 5) {
    console.log(
      "[terna-batch] sample refs:",
      allRefs.map((r) => ({ id: r.id, tier: r.tier, rcsCentral: r.rcsCentral, rolesAllowed: r.rolesAllowed })),
    );
  }

  const basePool = filterBasePool(allRefs);

  // 🔍 DEBUG: Ver cuántos pasan filterBasePool

  if (allRefs.length > 0 && basePool.length === 0) {
    // Diagnóstico: ¿por qué se excluyeron todos?
    const withNullRcs = allRefs.filter((r) => r.rcsCentral === null);
    const withWrongStatus = allRefs.filter((r) => r.status !== "DISPONIBLE");
    console.log("[terna-batch] ⚠️ Excluded - rcsCentral null:", withNullRcs.length, "tiers:", [
      ...new Set(withNullRcs.map((r) => r.tier)),
    ]);
  }

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

  const internalRulesByReferee = await loadInternalRulesForReferees(basePool.map((r) => r.id));

  const { centralCandidates, assistantCandidates } = splitCandidatesByRole(basePool);
  const assessorCandidates = getAssessorCandidates(basePool);

  // 🔍 DEBUG: Ver candidatos por rol

  if (basePool.length > 0 && (centralCandidates.length === 0 || assistantCandidates.length === 0)) {
    // Diagnóstico: ¿qué roles tienen?
    const allRoles = basePool.flatMap((r) => r.rolesAllowed);
  }

  // ✅ Fallar explícitamente si no hay candidatos suficientes
  if (centralCandidates.length === 0) {
    throw new Error("No hay árbitros con rol CENTRAL disponibles para este delegado.");
  }

  if (assistantCandidates.length < 2) {
    throw new Error("No hay suficientes asistentes disponibles (AA1/AA2). Se requieren al menos 2.");
  }

  const leagueCfgCache = new Map<string, { centralTolerance: number; assistantsTolerance: number; leagueData: any }>();

  const usedInBatch = new Set<string>();
  const pairUsedInBatch = new Set<string>();

  const results: SuggestedTerna[] = [];

  for (const matchParams of matches) {
    const {
      leagueId,
      groupId,
      matchdayId,
      matchId,
      ignoreExistingAssignment,
      variantSeed,
      matchData: preloadedMatchData,
    } = matchParams;

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
    const isTdp = isTdpLeague(leagueData);

    const centralBaseForLeague = filterLpForTdp(centralCandidates, leagueData);
    const assistantsBaseForLeague = filterLpForTdp(assistantCandidates, leagueData);

    // 👇 Aquí usamos matchData precargado si viene, o leemos solo si hace falta
    let matchData: any;

    if (preloadedMatchData) {
      matchData = preloadedMatchData;
    } else {
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

      matchData = matchSnap.data() as any;
    }
    const alreadyHasAssignment = !!matchData.centralRefereeId || !!matchData.aa1RefereeId || !!matchData.aa2RefereeId;

    if (!ignoreExistingAssignment && alreadyHasAssignment) {
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

    const mds = await computeMdsForMatch({ leagueId, groupId, matchData });

    let eligibleCentralsRaw: CandidateRef[];
    let eligibleAssistantsRaw: CandidateRef[];

    if (isTdpFem) {
      eligibleCentralsRaw = centralBaseForLeague;
      eligibleAssistantsRaw = assistantsBaseForLeague;
    } else {
      eligibleCentralsRaw = filterCentralByMds(centralBaseForLeague, mds, centralTolerance);
      eligibleAssistantsRaw = filterAssistantsByMds(assistantsBaseForLeague, mds, assistantsTolerance);
    }

    let eligibleCentrals = sortWithLeaguePriority(eligibleCentralsRaw, leagueData);
    let eligibleAssistants = sortWithLeaguePriority(eligibleAssistantsRaw, leagueData);

    if (isTdpFem) {
      eligibleCentrals = sortForTdpFemenil(eligibleCentrals);
      eligibleAssistants = sortForTdpFemenil(eligibleAssistants);
    }

    const baseKey = `${leagueId}#${groupId}#${matchdayId}#${matchId}`;
    const variantKey = variantSeed ? `${baseKey}#${variantSeed}` : baseKey;

    const shouldRotate = !isTdp || !!variantSeed;

    if (shouldRotate) {
      eligibleCentrals = rotateArrayByKey(eligibleCentrals, `${variantKey}#CENTRAL`);
      eligibleAssistants = rotateArrayByKey(eligibleAssistants, `${variantKey}#ASSISTANT`);
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

    const matchRuleContext = buildMatchRuleContext({ leagueId, matchData });

    const chosenCentral = pickWithInternalRulesForSingleRole(
      eligibleCentrals,
      usedInBatch,
      internalRulesByReferee,
      matchRuleContext,
    );

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
        reason: "NO_CENTRAL_AFTER_RA_RULES",
        mds,
        rcsCentral: null,
        centralTolerance,
        assistantsTolerance,
      });
      continue;
    }

    const assistantPoolFiltered = eligibleAssistants.filter((a) => a.id !== chosenCentral.id);

    if (assistantPoolFiltered.length < 2) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: chosenCentral.id,
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

    const chosenAa1 = pickAssistantWithInternalRules(
      assistantPoolFiltered,
      usedInBatch,
      chosenCentral.id,
      pairUsedInBatch,
      internalRulesByReferee,
      matchRuleContext,
    );

    if (!chosenAa1) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: chosenCentral.id,
        aa1RefereeId: null,
        aa2RefereeId: null,
        assessorRefereeId: null,

        hasSuggestion: false,
        reason: "NOT_ENOUGH_ASSISTANTS_AFTER_RA_RULES",
        mds,
        rcsCentral: chosenCentral.rcsCentral,
        centralTolerance,
        assistantsTolerance,
      });
      continue;
    }

    const assistantPoolForAa2 = assistantPoolFiltered.filter((a) => a.id !== chosenAa1.id);

    const chosenAa2 = pickAssistantWithInternalRules(
      assistantPoolForAa2,
      usedInBatch,
      chosenCentral.id,
      pairUsedInBatch,
      internalRulesByReferee,
      matchRuleContext,
      chosenAa1.id,
    );

    if (!chosenAa1 || !chosenAa2) {
      results.push({
        leagueId,
        groupId,
        matchdayId,
        matchId,
        centralRefereeId: chosenCentral.id,
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

    let chosenAssessor: CandidateRef | null = null;

    if (assessorCandidates.length > 0 && shouldAssignAssessor({ leagueData, matchData })) {
      const assessorPoolFiltered = assessorCandidates.filter(
        (a) => a.id !== chosenCentral.id && a.id !== chosenAa1.id && a.id !== chosenAa2.id,
      );

      let assessorPoolSorted = sortWithLeaguePriority(assessorPoolFiltered, leagueData);
      assessorPoolSorted = rotateArrayByKey(assessorPoolSorted, `${variantKey}#ASSESSOR`);

      if (assessorPoolSorted.length > 0) {
        const pick = pickWithInternalRulesForSingleRole(
          assessorPoolSorted,
          usedInBatch,
          internalRulesByReferee,
          matchRuleContext,
        );
        if (pick) {
          chosenAssessor = pick;
        }
      }
    }

    usedInBatch.add(chosenCentral.id);
    usedInBatch.add(chosenAa1.id);
    usedInBatch.add(chosenAa2.id);
    if (chosenAssessor) {
      usedInBatch.add(chosenAssessor.id);
    }

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
/* Helpers internos: selección con RA-XX                              */
/* ------------------------------------------------------------------ */

function pickWithInternalRulesForSingleRole(
  candidates: CandidateRef[],
  used: Set<string>,
  internalRulesByReferee: InternalRulesMap,
  matchCtx: MatchRuleContext,
): CandidateRef | null {
  if (candidates.length === 0) return null;

  let anyRuleApplied = false;
  const disallowed = new Set<string>();
  let best: CandidateRef | null = null;
  let bestScore = -Infinity;

  // 1) Candidatos con reglas RA-XX, evitando doblete de entrada
  for (const c of candidates) {
    if (used.has(c.id)) continue;

    const rules = internalRulesByReferee.get(c.id);
    if (!rules || rules.length === 0) continue;

    anyRuleApplied = true;

    const baseScore = c.rcsCentral ?? 0;
    const res = applyInternalRulesToScore({
      match: matchCtx,
      referee: c,
      baseScore,
      rules,
    });

    if (!res.allowed) {
      disallowed.add(c.id);
      continue;
    }

    if (res.score > bestScore) {
      bestScore = res.score;
      best = c;
    }
  }

  if (anyRuleApplied) {
    if (best) return best;

    // 2) Alguien SIN reglas, no usado y no prohibido
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      if (disallowed.has(c.id)) continue;

      const rules = internalRulesByReferee.get(c.id) ?? [];
      if (rules.length === 0) {
        return c;
      }
    }

    // 3) Cualquiera no prohibido, no usado
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      if (disallowed.has(c.id)) continue;
      return c;
    }

    // 4) Doblettes permitidos, pero respetando RA-XX
    const relaxed = [...candidates].sort((a, b) => (b.rcsCentral ?? 0) - (a.rcsCentral ?? 0));

    for (const c of relaxed) {
      if (disallowed.has(c.id)) continue;

      const rules = internalRulesByReferee.get(c.id);
      if (rules && rules.length > 0 && used.has(c.id)) {
        const baseScore = c.rcsCentral ?? 0;
        const res = applyInternalRulesToScore({
          match: matchCtx,
          referee: c,
          baseScore,
          rules,
        });

        if (!res.allowed) {
          disallowed.add(c.id);
          continue;
        }
      }

      return c;
    }

    // 5) Todos prohibidos por RA-XX → no se asigna
    return null;
  }

  // Sin RA-XX aplicables
  const firstNotUsed = pickFirstNotUsed(candidates, used);
  if (firstNotUsed) return firstNotUsed;

  const relaxed = [...candidates].sort((a, b) => (b.rcsCentral ?? 0) - (a.rcsCentral ?? 0));
  return relaxed[0] ?? null;
}

function pickAssistantWithInternalRules(
  candidates: CandidateRef[],
  used: Set<string>,
  centralId: string,
  pairUsed: Set<string>,
  internalRulesByReferee: InternalRulesMap,
  matchCtx: MatchRuleContext,
  otherAssistantId?: string,
): CandidateRef | null {
  if (candidates.length === 0) return null;

  let anyRuleApplied = false;
  const disallowed = new Set<string>();
  let best: CandidateRef | null = null;
  let bestScore = -Infinity;

  // 👀 Reglas del CENTRAL
  const centralRules = internalRulesByReferee.get(centralId) ?? [];
  const centralMandatoryCompanions: string[] = centralRules
    .filter((r) => r.type === "RA_companeros_obligatorios")
    .flatMap((r) => {
      const params: any = r.params ?? {};
      const list: string[] = params.refereeIds ?? [];
      return list;
    });
  const centralHasMandatoryCompanions = centralMandatoryCompanions.length > 0;

  // 👀 Reglas del OTRO asistente (AA1), si existe
  const otherRules = otherAssistantId ? (internalRulesByReferee.get(otherAssistantId) ?? []) : [];
  const otherMandatoryCompanions: string[] = otherAssistantId
    ? otherRules
        .filter((r) => r.type === "RA_companeros_obligatorios")
        .flatMap((r) => {
          const params: any = r.params ?? {};
          const list: string[] = params.refereeIds ?? [];
          return list;
        })
    : [];
  const otherHasMandatoryCompanions = otherAssistantId != null && otherMandatoryCompanions.length > 0;

  type RAInfo = { allowed: boolean; score: number; hasRules: boolean };
  const raInfo = new Map<string, RAInfo>();

  /* ------------------------------------------------------------------ */
  /* 0) Evaluar RA-XX para TODOS los candidatos (usados y no usados)    */
  /* ------------------------------------------------------------------ */
  for (const c of candidates) {
    const rules = internalRulesByReferee.get(c.id);
    const baseScore = c.rcsCentral ?? 0;

    if (!rules || rules.length === 0) {
      raInfo.set(c.id, { allowed: true, score: baseScore, hasRules: false });
      continue;
    }

    anyRuleApplied = true;

    const companionIds = otherAssistantId != null ? [centralId, otherAssistantId] : [centralId];

    const res = applyInternalRulesToScore({
      match: matchCtx,
      referee: c,
      baseScore,
      rules,
      companionIds,
    });

    if (!res.allowed) {
      disallowed.add(c.id);
      raInfo.set(c.id, { allowed: false, score: res.score ?? baseScore, hasRules: true });
      continue;
    }

    raInfo.set(c.id, { allowed: true, score: res.score, hasRules: true });
  }

  /* ------------------------------------------------------------------ */
  /* 1) Pasada principal: respetando TODO (used, parejas, obligatorios) */
  /* ------------------------------------------------------------------ */

  for (const c of candidates) {
    const info = raInfo.get(c.id);
    if (!info || !info.allowed) continue; // municipio prohibido u otra RA dura

    if (used.has(c.id)) continue; // aquí todavía NO queremos dobletes

    // 1) Relación de "obligatoriedad" con central / AA1
    const isCentralMandatoryForThis = centralMandatoryCompanions.includes(c.id);
    const isOtherMandatoryForThis = otherAssistantId ? otherMandatoryCompanions.includes(c.id) : false;
    const hasMandatoryLink = isCentralMandatoryForThis || isOtherMandatoryForThis;

    // 2) Evitar repetir parejas, PERO si hay vínculo obligatorio, lo dejamos pasar
    const pairWithCentral = `${centralId}#${c.id}`;
    if (!hasMandatoryLink && pairUsed.has(pairWithCentral)) continue;

    if (otherAssistantId) {
      const pairWithOther = `${otherAssistantId}#${c.id}`;
      if (!hasMandatoryLink && pairUsed.has(pairWithOther)) continue;
    }

    // 3) Filtros duros por RA_companeros_obligatorios
    if (centralHasMandatoryCompanions && !centralMandatoryCompanions.includes(c.id)) continue;
    if (otherHasMandatoryCompanions && otherAssistantId && !otherMandatoryCompanions.includes(c.id)) continue;

    // 4) Partimos del score ajustado por RA-XX
    let score = info.score;

    // 5) EXTRA: RA_companeros_preferidos del CENTRAL
    for (const r of centralRules) {
      if (r.type !== "RA_companeros_preferidos") continue;
      const params: any = r.params ?? {};
      const list: string[] = params.refereeIds ?? [];
      const weight = typeof params.pesoExtra === "number" ? params.pesoExtra : 1;

      if (weight !== 1 && list.includes(c.id)) {
        score = score * weight;
      }
    }

    // 6) EXTRA: RA_companeros_preferidos del OTRO asistente (AA1)
    if (otherAssistantId) {
      for (const r of otherRules) {
        if (r.type !== "RA_companeros_preferidos") continue;
        const params: any = r.params ?? {};
        const list: string[] = params.refereeIds ?? [];
        const weight = typeof params.pesoExtra === "number" ? params.pesoExtra : 1;

        if (weight !== 1 && list.includes(c.id)) {
          score = score * weight;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  if (anyRuleApplied) {
    if (best) {
      return best;
    }

    /* ------------------------------------------------------------------ */
    /* 2) Fallback 1: sin reglas, no usado, permitido, respetando todo   */
    /* ------------------------------------------------------------------ */

    for (const c of candidates) {
      const info = raInfo.get(c.id);
      if (!info || !info.allowed) continue;
      if (used.has(c.id)) continue;
      if (info.hasRules) continue; // aquí queremos alguien SIN RA-XX

      const isCentralMandatoryForThis = centralMandatoryCompanions.includes(c.id);
      const isOtherMandatoryForThis = otherAssistantId ? otherMandatoryCompanions.includes(c.id) : false;
      const hasMandatoryLink = isCentralMandatoryForThis || isOtherMandatoryForThis;

      const pairWithCentral = `${centralId}#${c.id}`;
      if (!hasMandatoryLink && pairUsed.has(pairWithCentral)) continue;

      if (otherAssistantId) {
        const pairWithOther = `${otherAssistantId}#${c.id}`;
        if (!hasMandatoryLink && pairUsed.has(pairWithOther)) continue;
      }

      if (centralHasMandatoryCompanions && !centralMandatoryCompanions.includes(c.id)) continue;
      if (otherHasMandatoryCompanions && otherAssistantId && !otherMandatoryCompanions.includes(c.id)) continue;

      return c;
    }

    /* ------------------------------------------------------------------ */
    /* 3) Fallback 2: cualquiera permitido, no usado, respetando todo    */
    /* ------------------------------------------------------------------ */

    for (const c of candidates) {
      const info = raInfo.get(c.id);
      if (!info || !info.allowed) continue;
      if (used.has(c.id)) continue;

      const isCentralMandatoryForThis = centralMandatoryCompanions.includes(c.id);
      const isOtherMandatoryForThis = otherAssistantId ? otherMandatoryCompanions.includes(c.id) : false;
      const hasMandatoryLink = isCentralMandatoryForThis || isOtherMandatoryForThis;

      const pairWithCentral = `${centralId}#${c.id}`;
      if (!hasMandatoryLink && pairUsed.has(pairWithCentral)) continue;

      if (otherAssistantId) {
        const pairWithOther = `${otherAssistantId}#${c.id}`;
        if (!hasMandatoryLink && pairUsed.has(pairWithOther)) continue;
      }

      if (centralHasMandatoryCompanions && !centralMandatoryCompanions.includes(c.id)) continue;
      if (otherHasMandatoryCompanions && otherAssistantId && !otherMandatoryCompanions.includes(c.id)) continue;

      return c;
    }

    /* ------------------------------------------------------------------ */
    /* 4) Fallback 3: relajamos parejas y used, pero NO RA-prohibidas     */
    /*                 (seguimos exigiendo obligatorios)                   */
    /* ------------------------------------------------------------------ */

    for (const c of candidates) {
      const info = raInfo.get(c.id);
      if (!info || !info.allowed) continue;

      if (centralHasMandatoryCompanions && !centralMandatoryCompanions.includes(c.id)) continue;
      if (otherHasMandatoryCompanions && otherAssistantId && !otherMandatoryCompanions.includes(c.id)) continue;

      return c;
    }

    /* ------------------------------------------------------------------ */
    /* 5) Fallback 4: obligatorios imposibles → los degradamos            */
    /*    - Seguimos respetando RA-prohibidas (info.allowed).             */
    /*    - Ya NO exigimos RA_companeros_obligatorios.                    */
    /*    - Intentamos no repetir ni parejas si se puede.                 */
    /* ------------------------------------------------------------------ */

    // 5.a) Primero intentamos con no usados y sin repetir parejas
    for (const c of candidates) {
      const info = raInfo.get(c.id);
      if (!info || !info.allowed) continue;
      if (used.has(c.id)) continue;

      const pairWithCentral = `${centralId}#${c.id}`;
      if (pairUsed.has(pairWithCentral)) continue;

      if (otherAssistantId) {
        const pairWithOther = `${otherAssistantId}#${c.id}`;
        if (pairUsed.has(pairWithOther)) continue;
      }

      return c;
    }

    // 5.b) Último recurso: ignoramos used/pairUsed, pero NO RA-prohibidas
    for (const c of candidates) {
      const info = raInfo.get(c.id);
      if (!info || !info.allowed) continue;
      return c;
    }

    // 6) De verdad no hay nadie (todos prohibidos por RA-XX) → sin asistente
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Sin RA-XX aplicables -> helper clásico + pequeño fallback          */
  /* ------------------------------------------------------------------ */

  const normal = pickAssistantAvoidingPairs(candidates, used, centralId, pairUsed, otherAssistantId);
  if (normal) return normal;

  // Fallback: permitir doblete relajando used/pairUsed
  for (const c of candidates) {
    return c;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Versión batch por jornada                                          */
/* ------------------------------------------------------------------ */

export async function suggestTernasForMatchday(
  params: SuggestTernasForMatchdayParams,
  options?: { delegateId?: string },
): Promise<SuggestedTerna[]> {
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
    matchData: m.data(),
  }));

  // ✅ Multi-tenant: pasar delegateId al motor batch
  return suggestTernasForMatchesBalanced(matchParams, options);
}
