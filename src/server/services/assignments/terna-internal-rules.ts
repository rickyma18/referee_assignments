// src/server/services/assignments/terna-internal-rules.ts
import "server-only";

import type { InternalRule } from "@/domain/referees/internal-rule.zod";
import { listInternalRulesByReferee } from "@/server/services/internal-rules/internal-rules-repo";

import { toDateSafe } from "./terna-helpers";
import type { CandidateRef } from "./terna-types";

/* ------------------------------------------------------------------ */
/* Tipos para contexto de partido                                     */
/* ------------------------------------------------------------------ */

export type MatchRuleContext = {
  leagueId: string;
  municipality: string | null;
  weekday: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

/* ------------------------------------------------------------------ */
/* Prefetch de reglas RA-XX por árbitro                               */
/* ------------------------------------------------------------------ */

/**
 * Carga las reglas internas activas para un conjunto de árbitros.
 *
 * - Solo se llama UNA vez por ejecución de suggestTernasForMatchesBalanced.
 * - Devuelve un Map refereeId -> reglas activas.
 */
export async function loadInternalRulesForReferees(refereeIds: string[]): Promise<Map<string, InternalRule[]>> {
  const uniqueIds = Array.from(new Set(refereeIds.filter(Boolean)));
  const map = new Map<string, InternalRule[]>();

  await Promise.all(
    uniqueIds.map(async (refereeId) => {
      const rules = await listInternalRulesByReferee(refereeId);
      const active = rules.filter((r) => r.enabled);
      if (active.length > 0) {
        map.set(refereeId, active);
      }
    }),
  );

  return map;
}

/* ------------------------------------------------------------------ */
/* Construcción del contexto del partido                              */
/* ------------------------------------------------------------------ */

/**
 * Extrae del doc de partido la info relevante para RA-XX.
 *
 * Ajusta aquí si tus campos reales de municipio cambian.
 */
export function buildMatchRuleContext(args: { leagueId: string; matchData: any }): MatchRuleContext {
  const { leagueId, matchData } = args;

  const municipalityRaw =
    matchData?.zoneName ?? matchData?.municipio ?? matchData?.municipality ?? matchData?.venueMunicipality ?? null;

  const municipality = typeof municipalityRaw === "string" ? municipalityRaw.trim().toLowerCase() : null;

  const kickoff = toDateSafe(matchData?.kickoff ?? matchData?.date);
  let weekday: MatchRuleContext["weekday"] = null;

  if (kickoff) {
    const dayIdx = kickoff.getDay(); // 0 = domingo
    const map: MatchRuleContext["weekday"][] = ["D", "L", "M", "X", "J", "V", "S"];
    weekday = map[dayIdx] ?? null;
  }

  const homeTeamId = typeof matchData?.homeTeamId === "string" ? matchData.homeTeamId : null;
  const awayTeamId = typeof matchData?.awayTeamId === "string" ? matchData.awayTeamId : null;

  return {
    leagueId,
    municipality,
    weekday,
    homeTeamId,
    awayTeamId,
  };
}

/* ------------------------------------------------------------------ */
/* Motor puro de aplicación de RA-XX                                  */
/* ------------------------------------------------------------------ */

export type InternalRulesScoreResult = {
  allowed: boolean;
  score: number;
  /**
   * Debug interno (NO se devuelve al cliente).
   * Útil si más adelante quieres armar un panel de trazas.
   */
  debug?: string[];
};

/**
 * Aplica las reglas internas RA-XX a un árbitro para un partido.
 *
 * - Si alguna regla "prohibida" coincide => allowed = false.
 * - Si hay reglas "preferidas" que matchean => ajusta el score.
 *
 * NOTA IMPORTANTE:
 * - Si rules está vacío o undefined, devuelve { allowed: true, score: baseScore }.
 * - Esto garantiza que sin RA-XX el comportamiento sea idéntico.
 *
 * companionIds:
 * - IDs de compañeros con los que va en la terna (central, AA1...),
 *   usado para RA_companeros_preferidos.
 */
export function applyInternalRulesToScore(options: {
  match: MatchRuleContext;
  referee: CandidateRef;
  baseScore: number;
  rules: InternalRule[] | undefined;
  companionIds?: string[];
}): InternalRulesScoreResult {
  const { match, referee, baseScore, rules, companionIds } = options;

  // Sin reglas → comportamiento neutro
  if (!rules || rules.length === 0) {
    return { allowed: true, score: baseScore };
  }

  let allowed = true;
  let score = baseScore;
  const debug: string[] = [];

  const leagueId = match.leagueId;
  const municipio = (match.municipality ?? "").toString().trim().toLowerCase();
  const weekday = match.weekday;
  const homeTeamId = match.homeTeamId;
  const awayTeamId = match.awayTeamId;
  const companions = companionIds ?? [];

  for (const rule of rules) {
    const type = rule.type;
    const params: any = rule.params ?? {};

    switch (type) {
      /* ------------------------- MUNICIPIOS ------------------------- */
      case "RA_municipios_prohibidos": {
        const list: string[] = (params.municipios ?? []).map((m: string) => m.trim().toLowerCase());
        if (municipio && list.includes(municipio)) {
          allowed = false;
          debug.push(`RA_municipios_prohibidos: municipio prohibido ${municipio}`);

          // Observabilidad interna solo en server (NO viaja al cliente)
          console.log(
            "[RA-XX] Excluyendo árbitro por municipio prohibido",
            referee.id,
            referee.name,
            municipio,
            rule.id,
          );

          return { allowed, score: 0, debug };
        }
        break;
      }

      case "RA_municipios_preferidos": {
        const list: string[] = (params.municipios ?? []).map((m: string) => m.trim().toLowerCase());
        if (municipio && list.includes(municipio)) {
          const weight = typeof params.pesoExtra === "number" ? params.pesoExtra : 1;
          // 💡 Ajuste multiplicativo (lo puedes cambiar a suma si quieres)
          score = score * weight;
          debug.push(`RA_municipios_preferidos: municipio preferido ${municipio} x${weight}`);
        }
        break;
      }

      /* ----------------------------- DÍAS --------------------------- */
      case "RA_dias_prohibidos": {
        const list: string[] = params.dias ?? [];
        if (weekday && list.includes(weekday)) {
          allowed = false;
          debug.push(`RA_dias_prohibidos: día prohibido ${weekday}`);

          console.log("[RA-XX] Excluyendo árbitro por día prohibido", referee.id, referee.name, weekday, rule.id);

          return { allowed, score: 0, debug };
        }
        break;
      }

      case "RA_dias_preferidos": {
        const list: string[] = params.dias ?? [];
        if (weekday && list.includes(weekday)) {
          // TODO: si quieres hacerlo configurable, mueve este 0.25 a una const o a Firestore
          const bonus = 0.25;
          score = score + bonus;
          debug.push(`RA_dias_preferidos: día preferido ${weekday} +${bonus}`);
        }
        break;
      }

      /* ---------------------------- EQUIPOS ------------------------- */
      case "RA_equipos_prohibidos": {
        const list: string[] = params.teamIds ?? [];
        if ((homeTeamId && list.includes(homeTeamId)) || (awayTeamId && list.includes(awayTeamId))) {
          allowed = false;
          debug.push(
            `RA_equipos_prohibidos: equipo prohibido en partido (${homeTeamId ?? "-"} vs ${awayTeamId ?? "-"})`,
          );

          console.log(
            "[RA-XX] Excluyendo árbitro por equipo prohibido",
            referee.id,
            referee.name,
            { homeTeamId, awayTeamId },
            rule.id,
          );

          return { allowed, score: 0, debug };
        }
        break;
      }

      case "RA_equipos_preferidos": {
        const list: string[] = params.teamIds ?? [];
        if ((homeTeamId && list.includes(homeTeamId)) || (awayTeamId && list.includes(awayTeamId))) {
          const weight = typeof params.pesoExtra === "number" ? params.pesoExtra : 1;

          score = score * weight;
          debug.push(
            `RA_equipos_preferidos: equipo preferido en partido (${homeTeamId ?? "-"} vs ${
              awayTeamId ?? "-"
            }) x${weight}`,
          );
        }
        break;
      }

      /* ----------------------------- LIGAS -------------------------- */
      case "RA_ligas_prohibidas": {
        const list: string[] = params.leagueIds ?? [];
        if (leagueId && list.includes(leagueId)) {
          allowed = false;
          debug.push(`RA_ligas_prohibidas: liga prohibida ${leagueId}`);

          console.log("[RA-XX] Excluyendo árbitro por liga prohibida", referee.id, referee.name, leagueId, rule.id);

          return { allowed, score: 0, debug };
        }
        break;
      }

      /* ------------------------ COMPAÑEROS -------------------------- */
      case "RA_companeros_preferidos": {
        const list: string[] = params.refereeIds ?? [];
        const weight = typeof params.pesoExtra === "number" ? params.pesoExtra : 1;

        // sin compañeros, sin lista o sin peso -> no hacemos nada
        if (!companions.length || weight === 1 || list.length === 0) break;

        const hasPreferredCompanion = companions.some((id) => list.includes(id));

        if (hasPreferredCompanion) {
          // BONUS cuando sí hay compas favoritos
          score = score * weight;
          debug.push(`RA_companeros_preferidos: compañero preferido presente (${companions.join(",")}) x${weight}`);
        } else {
          // PENALIZACIÓN cuando NO hay ninguno de los compas favoritos
          const penalty = 1 / weight;
          score = score * penalty;
          debug.push(
            `RA_companeros_preferidos: sin compañeros preferidos (${companions.join(
              ",",
            )}); penalización x${penalty.toFixed(3)}`,
          );
        }

        break;
      }
      case "RA_companeros_obligatorios": {
        // 👇 IMPORTANTE:
        // Esta regla NO se decide a nivel "árbitro individual",
        // sino a nivel de cómo armamos la TERNA completa.
        //
        // La estamos aplicando en el motor de asistentes
        // (pickAssistantWithInternalRules) usando las reglas del
        // otro asistente (AA1) para forzar que AA2 esté dentro de
        // su lista de compañeros obligatorios.
        //
        // Aquí NO vetamos ni ajustamos score, solo dejamos pasar.
        break;
      }

      default:
        // Tipos futuros de RA-XX se ignoran aquí
        break;
    }
  }

  return { allowed, score, debug: debug.length ? debug : undefined };
}
