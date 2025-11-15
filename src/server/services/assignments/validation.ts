// src/server/services/assignments/validation.ts
"use server";
import "server-only";

import { adminDb } from "@/server/admin/firebase-admin";

export type ConflictRole = "CENTRAL" | "AA1" | "AA2";

export type Conflict = {
  role: ConflictRole;
  refereeId: string;
  teamId: string;
  matchdayNumber: number;
  matchId: string;
};

type FindRecentConflictsParams = {
  leagueId: string;
  groupId: string;
  currentMatchdayNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  centralRefereeId: string;
  aa1RefereeId: string;
  aa2RefereeId: string;
};

/**
 * Busca si alguno de los árbitros seleccionados ya pitó/asistió
 * a alguno de los equipos (local/visitante) en las últimas 4 jornadas
 * ANTES de la actual.
 *
 * No aplica RA-XX. Esto es solo la regla de "no repetir equipo".
 */
export async function findRecentTeamConflicts(params: FindRecentConflictsParams): Promise<Conflict[]> {
  const {
    leagueId,
    groupId,
    currentMatchdayNumber,
    homeTeamId,
    awayTeamId,
    centralRefereeId,
    aa1RefereeId,
    aa2RefereeId,
  } = params;

  const conflicts: Conflict[] = [];

  if (!currentMatchdayNumber || currentMatchdayNumber <= 1) {
    // Si es jornada 1, no hay 4 jornadas previas que revisar
    return conflicts;
  }

  const from = Math.max(1, currentMatchdayNumber - 4);
  const to = currentMatchdayNumber - 1;

  if (to < from) return conflicts;

  const matchdaysCol = adminDb
    .collection("leagues")
    .doc(leagueId)
    .collection("groups")
    .doc(groupId)
    .collection("matchdays");

  const matchdaysSnap = await matchdaysCol.where("number", ">=", from).where("number", "<=", to).get();
  if (matchdaysSnap.empty) return conflicts;

  // Para evitar duplicados, usamos un set con clave compuesta
  const seen = new Set<string>();

  for (const mdDoc of matchdaysSnap.docs) {
    const mdData = mdDoc.data() as any;
    const mdNumber: number = typeof mdData?.number === "number" ? mdData.number : 0;

    const matchesSnap = await mdDoc.ref.collection("matches").get();
    matchesSnap.forEach((mDoc) => {
      const data = mDoc.data() as any;
      const matchId = mDoc.id;

      const mHomeTeamId: string | undefined = data.homeTeamId;
      const mAwayTeamId: string | undefined = data.awayTeamId;

      if (!mHomeTeamId && !mAwayTeamId) return;

      const teamsToCheck: Array<{ id: string; label: "home" | "away" }> = [];
      if (mHomeTeamId) teamsToCheck.push({ id: mHomeTeamId, label: "home" });
      if (mAwayTeamId) teamsToCheck.push({ id: mAwayTeamId, label: "away" });

      for (const t of teamsToCheck) {
        const teamId = t.id;

        // Solo nos interesan partidos en los que el equipo sea el mismo
        const isSameTeamAsCurrent = teamId === homeTeamId || teamId === awayTeamId;

        if (!isSameTeamAsCurrent) continue;

        // Revisamos cada rol
        const centralId: string | undefined = data.centralRefereeId;
        const aa1Id: string | undefined = data.aa1RefereeId;
        const aa2Id: string | undefined = data.aa2RefereeId;

        if (centralId && centralId === centralRefereeId) {
          const key = `CENTRAL|${centralId}|${teamId}|${mdNumber}|${matchId}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              role: "CENTRAL",
              refereeId: centralId,
              teamId,
              matchdayNumber: mdNumber,
              matchId,
            });
          }
        }

        if (aa1Id && aa1Id === aa1RefereeId) {
          const key = `AA1|${aa1Id}|${teamId}|${mdNumber}|${matchId}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              role: "AA1",
              refereeId: aa1Id,
              teamId,
              matchdayNumber: mdNumber,
              matchId,
            });
          }
        }

        if (aa2Id && aa2Id === aa2RefereeId) {
          const key = `AA2|${aa2Id}|${teamId}|${mdNumber}|${matchId}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              role: "AA2",
              refereeId: aa2Id,
              teamId,
              matchdayNumber: mdNumber,
              matchId,
            });
          }
        }
      }
    });
  }

  return conflicts;
}
