// src/server/actions/assignments.actions.ts
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";

import { secureWrite } from "@/server/auth/secure-action";
import {
  findRecentTeamConflicts,
  findScheduleConflicts,
  evaluateCentralRcs,
  type Conflict,
  type ScheduleConflict,
  type RcsEvaluation,
} from "@/server/services/assignments/validation";

// Este es el "payload" que va dentro de `res.data` del ActionResult
export type AssignManualTernaData =
  | {
      code: "OK";
      rcsEvaluation?: RcsEvaluation;
    }
  | {
      code:
        | "MISSING_PARAMS"
        | "MATCH_NOT_FOUND"
        | "REFEREE_NOT_AVAILABLE"
        | "RECENT_TEAM_CONFLICT"
        | "SCHEDULE_CONFLICT"
        | "RCS_BELOW_THRESHOLD_BLOCK"
        | "RCS_BELOW_THRESHOLD_WARNING"
        | "DUPLICATE_REFEREES"; // 👈 NUEVO
      error: string;
      conflicts?: Conflict[];
      unavailableRefs?: string[];
      scheduleConflicts?: ScheduleConflict[];
      rcsEvaluation?: RcsEvaluation;
    };

/**
 * Acción para asignar terna MANUALMENTE a un partido.
 *
 * - La autorización fina (DELEGADO / SUPERUSUARIO) la dejas a Firestore Rules
 *   o la puedes agregar luego leyendo el usuario dentro del callback.
 * - Aplica:
 *    - Regla de "no repetir equipo en últimas 4 jornadas" (bloqueo duro).
 *    - Regla de "Choque de horario" (bloqueo duro).
 *    - Evaluación MDS vs RCS_central (bloqueo o advertencia según temporada).
 * - NO aplica las reglas internas RA-XX (municipios, equipos, etc.).
 *
 * Devuelve un ActionResult<AssignManualTernaData>, es decir:
 * - res.ok        -> éxito de la acción (no explotó, pasó secureWrite)
 * - res.message   -> mensaje genérico si secureWrite falla
 * - res.data      -> { code: "...", error?, ... }
 */
export async function assignManualTernaAction(formData: FormData) {
  return secureWrite<AssignManualTernaData>(async () => {
    const leagueId = String(formData.get("leagueId") ?? "");
    const groupId = String(formData.get("groupId") ?? "");
    const matchdayId = String(formData.get("matchdayId") ?? "");
    const matchId = String(formData.get("matchId") ?? "");

    const centralRefereeId = String(formData.get("centralRefereeId") ?? "");
    const aa1RefereeId = String(formData.get("aa1RefereeId") ?? "");
    const aa2RefereeId = String(formData.get("aa2RefereeId") ?? "");

    const centralRefereeName = formData.get("centralRefereeName");
    const aa1RefereeName = formData.get("aa1RefereeName");
    const aa2RefereeName = formData.get("aa2RefereeName");

    // Si quieres guardar quién asignó, puedes mandar userId en el formData
    const updatedBy = formData.get("userId") ? String(formData.get("userId")) : null;

    if (!leagueId || !groupId || !matchdayId || !matchId || !centralRefereeId || !aa1RefereeId || !aa2RefereeId) {
      return {
        code: "MISSING_PARAMS",
        error: "Faltan parámetros obligatorios para asignar la terna.",
      };
    }

    if (centralRefereeId === aa1RefereeId || centralRefereeId === aa2RefereeId || aa1RefereeId === aa2RefereeId) {
      return {
        code: "DUPLICATE_REFEREES",
        error: "Un árbitro no puede repetirse como central y asistente en la misma terna.",
      };
    }

    const db = getFirestore();

    // 1) Cargar partido
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
        code: "MATCH_NOT_FOUND",
        error: "Partido no encontrado.",
      };
    }

    const match = matchSnap.data() as any;

    const matchdayNumber: number = match.matchdayNumber ?? 0;
    const homeTeamId: string = match.homeTeamId;
    const awayTeamId: string = match.awayTeamId;

    // Kickoff como Date para chequeo de choques
    const kickoffRaw = match.kickoff ?? null;
    let kickoff: Date | null = null;
    if (kickoffRaw instanceof Date) {
      kickoff = kickoffRaw;
    } else if (kickoffRaw?.toDate) {
      try {
        kickoff = kickoffRaw.toDate();
      } catch {
        kickoff = null;
      }
    }

    // 2) Validar que los árbitros existan y estén DISPONIBLES
    const unavailableRefs: string[] = [];
    const refsCol = db.collection("referees");

    async function isAvailable(id: string): Promise<boolean> {
      const snap = await refsCol.doc(id).get();
      if (!snap.exists) return false;
      const data = snap.data() as any;
      const status = (data?.status ?? "").toString().toUpperCase();
      return status === "DISPONIBLE";
    }

    if (!(await isAvailable(centralRefereeId))) unavailableRefs.push(centralRefereeId);
    if (!(await isAvailable(aa1RefereeId))) unavailableRefs.push(aa1RefereeId);
    if (!(await isAvailable(aa2RefereeId))) unavailableRefs.push(aa2RefereeId);

    if (unavailableRefs.length > 0) {
      return {
        code: "REFEREE_NOT_AVAILABLE",
        error: "Uno o más árbitros no están disponibles.",
        unavailableRefs,
      };
    }

    const ignoreRecentTeamConflicts = String(formData.get("ignoreRecentTeamConflicts") ?? "").toLowerCase() === "true";

    // 3) Regla de las últimas 4 jornadas (NO RA-XX)
    const conflicts = await findRecentTeamConflicts({
      leagueId,
      groupId,
      currentMatchdayNumber: matchdayNumber,
      homeTeamId,
      awayTeamId,
      centralRefereeId,
      aa1RefereeId,
      aa2RefereeId,
      currentMatchId: matchId,
    });

    if (conflicts.length > 0 && !ignoreRecentTeamConflicts) {
      return {
        code: "RECENT_TEAM_CONFLICT",
        error: "Conflicto: algún árbitro ya arbitró a este equipo en < 4 jornadas.",
        conflicts,
      };
    }

    // 4) Regla de choque de horario (Choque) – esta sigue siendo bloqueo duro
    if (kickoff) {
      const scheduleConflicts = await findScheduleConflicts({
        leagueId,
        matchId,
        kickoff,
        centralRefereeId,
        aa1RefereeId,
        aa2RefereeId,
      });

      if (scheduleConflicts.length > 0) {
        return {
          code: "SCHEDULE_CONFLICT",
          error: "Choque de horario: algún árbitro ya tiene otro partido en la misma fecha/hora.",
          scheduleConflicts,
        };
      }
    }

    // 5) Evaluar MDS vs RCS_central (bloqueo/advertencia según temporada)
    const rcsEvaluation = await evaluateCentralRcs({
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId,
    });

    if (rcsEvaluation.belowThreshold && rcsEvaluation.policy === "BLOCK") {
      // Bloqueo duro por parámetro de temporada
      return {
        code: "RCS_BELOW_THRESHOLD_BLOCK",
        error:
          "El RCS del central está por debajo del mínimo permitido para este partido (bloqueo por configuración de temporada).",
        rcsEvaluation,
      };
    }

    // 6) Si todo bien (o solo advertencia), actualizamos el partido con la terna
    const now = new Date();

    await matchRef.update({
      centralRefereeId,
      aa1RefereeId,
      aa2RefereeId,
      centralRefereeName: centralRefereeName ? String(centralRefereeName) : (match.centralRefereeName ?? null),
      aa1RefereeName: aa1RefereeName ? String(aa1RefereeName) : (match.aa1RefereeName ?? null),
      aa2RefereeName: aa2RefereeName ? String(aa2RefereeName) : (match.aa2RefereeName ?? null),
      updatedAt: now,
      updatedBy,
    });

    // 7) Respuesta lógica de la asignación
    if (rcsEvaluation.belowThreshold && rcsEvaluation.policy === "WARN") {
      return {
        code: "RCS_BELOW_THRESHOLD_WARNING",
        error: "Advertencia: el RCS del central está por debajo del MDS recomendado para este partido.",
        rcsEvaluation,
      };
    }

    // Sin problemas
    return {
      code: "OK",
      rcsEvaluation,
    };
  });
}
