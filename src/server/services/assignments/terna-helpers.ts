// src/server/services/assignments/terna-helpers.ts
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";

import { refereeTierToRcsCentral } from "@/domain/referees/referee-tier";
import { computeMatchMdsFromTeams, type TeamDifficultyTier } from "@/domain/teams/team-difficulty-tier";

import type { CandidateRef } from "./terna-types";

/* ------------------------------------------------------------------ */
/* Helpers genéricos                                                   */
/* ------------------------------------------------------------------ */

export function toDateSafe(input: any): Date | null {
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
export function isTdpLeague(leagueData: any): boolean {
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
export function shouldAssignAssessor(options: { leagueData: any; matchData: any }): boolean {
  const { leagueData } = options;

  const leagueName = (leagueData?.name ?? "").toString().toUpperCase();
  const leagueCategory = (leagueData?.category ?? "").toString().toUpperCase();

  // ❌ TDP femenil -> NO asesor
  const isFemenil = leagueName.includes("FEM") ?? leagueName.includes("FEMENIL") ?? leagueCategory.includes("FEM");
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

/* ------------------------------------------------------------------ */
/* MDS del partido                                                     */
/* ------------------------------------------------------------------ */

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

export async function computeMdsForMatch(options: {
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

/* ------------------------------------------------------------------ */
/* Pool de árbitros                                                   */
/* ------------------------------------------------------------------ */

/**
 * Carga todos los árbitros y los convierte en CandidateRef.
 *
 * - Solo usa status / rolesAllowed / tier.
 * - El RCS se deriva de tier (refereeTierToRcsCentral).
 */
export async function loadRefereeCandidates(): Promise<CandidateRef[]> {
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
export function filterBasePool(refs: CandidateRef[]): CandidateRef[] {
  return refs.filter((r) => r.status === "DISPONIBLE" && r.rcsCentral !== null);
}

/**
 * Devuelve un subconjunto de candidatos aptos para cada rol:
 * - CENTRAL: debe tener rol "CENTRAL" en rolesAllowed.
 * - ASISTENTES: con rol "AA1" o "AA2".
 */
export function splitCandidatesByRole(refs: CandidateRef[]): {
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
export function getAssessorCandidates(refs: CandidateRef[]): CandidateRef[] {
  return refs.filter((r) => {
    const roles = r.rolesAllowed ?? [];
    return roles.includes("ASESOR") || r.canAssess === true;
  });
}

/**
 * Aplica el filtro de MDS vs RCS para el central.
 */
export function filterCentralByMds(candidates: CandidateRef[], mds: number | null, tolerance: number): CandidateRef[] {
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
export function filterAssistantsByMds(
  candidates: CandidateRef[],
  mds: number | null,
  tolerance: number,
): CandidateRef[] {
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
export function sortByRcsAndName(candidates: CandidateRef[]): CandidateRef[] {
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
export function sortWithLeaguePriority(candidates: CandidateRef[], leagueData: any): CandidateRef[] {
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
export function pickFirstNotUsed(candidates: CandidateRef[], used: Set<string>): CandidateRef | null {
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
export function pickAssistantAvoidingPairs(
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
