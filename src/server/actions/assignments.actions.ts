// src/server/actions/assignments.actions.ts
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";

import { secureWrite } from "@/server/auth/secure-action";
import { findRecentTeamConflicts, type Conflict } from "@/server/services/assignments/validation";

// Este es el "payload" que va dentro de `res.data` del ActionResult
export type AssignManualTernaData =
  | {
      code: "OK";
    }
  | {
      code: "MISSING_PARAMS" | "MATCH_NOT_FOUND" | "REFEREE_NOT_AVAILABLE" | "RECENT_TEAM_CONFLICT";
      error: string;
      conflicts?: Conflict[];
      unavailableRefs?: string[];
    };

/**
 * Acción para asignar terna MANUALMENTE a un partido.
 *
 * - La autorización fina (DELEGADO / SUPERUSUARIO) la dejas a Firestore Rules
 *   o la puedes agregar luego leyendo el usuario dentro del callback.
 * - Aplica la regla de "no repetir equipo en últimas 4 jornadas".
 * - NO aplica las reglas internas RA-XX.
 *
 * Devuelve un ActionResult<AssignManualTernaData>, es decir:
 * - res.ok        -> éxito de la acción (no explotó, pasó secureWrite)
 * - res.message   -> mensaje genérico si secureWrite falla
 * - res.data      -> { code: "...", error?, conflicts?, unavailableRefs? }
 */
export async function assignManualTernaAction(formData: FormData) {
  // secureWrite envuelve el resultado en un ActionResult
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
    });

    if (conflicts.length > 0) {
      return {
        code: "RECENT_TEAM_CONFLICT",
        error: "Hay conflictos con equipos pitados en las últimas 4 jornadas.",
        conflicts,
      };
    }

    // 4) Si todo bien, actualizamos el partido con la terna
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

    // 🔚 Éxito lógico de la asignación
    return {
      code: "OK",
    };
  });
}
