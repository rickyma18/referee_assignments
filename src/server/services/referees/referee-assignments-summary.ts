// src/server/services/referees/referee-assignments-summary.ts
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";
import "@/server/admin/firebase-admin";

export type RefereeMatchSummary = {
  matchId: string;
  leagueId: string;
  groupId: string;
  matchdayId: string;
  date: unknown;
  role: "CENTRAL" | "AA1" | "AA2";
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName: string;
  awayTeamName: string;
};

export type RefereeTeamStats = {
  teamId?: string;
  teamName: string;
  totalMatches: number;
};

export type RefereeAssignmentsSummary = {
  totalMatches: number;
  recentMatches: RefereeMatchSummary[];
  statsPerTeam: RefereeTeamStats[];
};

// ------------------------------
// Helpers
// ------------------------------
function toDateSafe(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;

  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, any>;

    if (typeof obj.toDate === "function") {
      try {
        return obj.toDate();
      } catch {
        // ignore
      }
    }

    // Firestore Timestamp y variantes serializadas
    const seconds = obj.seconds ?? obj["_seconds"];
    const nanos = obj.nanoseconds ?? obj["_nanoseconds"] ?? 0;

    if (typeof seconds === "number") {
      const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
      return new Date(ms);
    }
  }

  if (typeof input === "string") {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

// ------------------------------
// Procesamiento de una matchday
// ------------------------------
async function collectMatchesForMatchday(params: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  refereeId: string;
  matches: RefereeMatchSummary[];
}) {
  const { leagueId, groupId, matchdayId, refereeId, matches } = params;

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

  if (matchesSnap.empty) return;

  for (const doc of matchesSnap.docs) {
    const data = doc.data() as any;

    const centralId: string | undefined = data.centralRefereeId;
    const aa1Id: string | undefined = data.aa1RefereeId;
    const aa2Id: string | undefined = data.aa2RefereeId;

    let role: RefereeMatchSummary["role"] | null = null;
    if (centralId === refereeId) {
      role = "CENTRAL";
    } else if (aa1Id === refereeId) {
      role = "AA1";
    } else if (aa2Id === refereeId) {
      role = "AA2";
    }

    // Si este árbitro no está en la terna, ignoramos el partido
    if (!role) continue;

    const matchId = doc.id;

    const kickoff = data.kickoff ?? data.date ?? null;
    const date = kickoff ? toDateSafe(kickoff) : null;

    const homeTeamId: string | undefined = data.homeTeamId ?? data.localTeamId ?? undefined;
    const awayTeamId: string | undefined = data.awayTeamId ?? data.visitTeamId ?? undefined;

    const homeTeamName: string =
      data.homeTeamName ?? data.localTeamName ?? data.homeShortName ?? data.homeCode ?? "Local";
    const awayTeamName: string =
      data.awayTeamName ?? data.visitTeamName ?? data.awayShortName ?? data.awayCode ?? "Visitante";

    matches.push({
      matchId,
      leagueId,
      groupId,
      matchdayId,
      date: date ?? kickoff ?? null,
      role,
      homeTeamId,
      awayTeamId,
      homeTeamName,
      awayTeamName,
    });
  }
}

/**
 * Resumen de designaciones para un árbitro:
 * - total de partidos pitados
 * - últimos 4 partidos
 * - conteo de partidos por equipo (para controlar la regla de 4 jornadas)
 */
export async function getRefereeAssignmentsSummary(refereeId: string): Promise<RefereeAssignmentsSummary> {
  const db = getFirestore();

  const leaguesSnap = await db.collection("leagues").get();

  if (leaguesSnap.empty) {
    return {
      totalMatches: 0,
      recentMatches: [],
      statsPerTeam: [],
    };
  }

  const matches: RefereeMatchSummary[] = [];

  // Recorremos leagues -> groups -> matchdays -> matches
  for (const leagueDoc of leaguesSnap.docs) {
    const leagueId = leagueDoc.id;
    const groupsSnap = await leagueDoc.ref.collection("groups").get();
    if (groupsSnap.empty) continue;

    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      const matchdaysSnap = await groupDoc.ref.collection("matchdays").get();
      if (matchdaysSnap.empty) continue;

      for (const matchdayDoc of matchdaysSnap.docs) {
        const matchdayId = matchdayDoc.id;

        // Sacamos la lógica pesada a un helper para evitar max-depth
        // y mantener el código más legible.
        // eslint-disable-next-line no-await-in-loop
        await collectMatchesForMatchday({
          leagueId,
          groupId,
          matchdayId,
          refereeId,
          matches,
        });
      }
    }
  }

  if (matches.length === 0) {
    return {
      totalMatches: 0,
      recentMatches: [],
      statsPerTeam: [],
    };
  }

  // Ordenamos por fecha descendente (incluye pasados + próximos)
  matches.sort((a, b) => {
    const timeA = toDateSafe(a.date)?.getTime() ?? 0;
    const timeB = toDateSafe(b.date)?.getTime() ?? 0;
    return timeB - timeA;
  });

  const totalMatches = matches.length;
  const recentMatches = matches.slice(0, 4);

  // Conteo por equipo (local + visitante)
  const teamMap = new Map<string, RefereeTeamStats>();

  for (const m of matches) {
    const teams = [
      { id: m.homeTeamId, name: m.homeTeamName },
      { id: m.awayTeamId, name: m.awayTeamName },
    ];

    for (const t of teams) {
      if (!t.name) continue;

      const key = t.id ?? t.name ?? "unknown-team";
      const existing = teamMap.get(key);

      if (existing) {
        existing.totalMatches += 1;
      } else {
        teamMap.set(key, {
          teamId: t.id,
          teamName: t.name,
          totalMatches: 1,
        });
      }
    }
  }

  const statsPerTeam = Array.from(teamMap.values()).sort((a, b) => b.totalMatches - a.totalMatches);

  return {
    totalMatches,
    recentMatches,
    statsPerTeam,
  };
}
