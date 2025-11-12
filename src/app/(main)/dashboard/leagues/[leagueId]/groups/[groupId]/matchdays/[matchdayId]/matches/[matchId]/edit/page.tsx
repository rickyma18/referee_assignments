// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/[matchId]/edit/page.tsx
import { notFound } from "next/navigation";

import { getFirestore, FieldPath } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import EditMatchForm from "./_client-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- helpers ----------
function toDateSafe(i: any) {
  if (!i) return null;
  if (i instanceof Date) return i;
  if (typeof i?.toDate === "function") {
    try {
      return i.toDate();
    } catch {
      // ignore conversion error
    }
  }
  if (typeof i === "string") {
    const d = new Date(i);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// ---------- fetchers ----------
async function getLeagueGroup(db: FirebaseFirestore.Firestore, leagueId: string, groupId: string) {
  const leagueSnap = await db.collection("leagues").doc(leagueId).get();
  if (!leagueSnap.exists) return { league: null, group: null };
  const league = leagueSnap.data() as any;

  const groupSnap = await db.collection("leagues").doc(leagueId).collection("groups").doc(groupId).get();
  const group = groupSnap.exists ? (groupSnap.data() as any) : null;

  return {
    league: {
      id: leagueSnap.id,
      name: league?.name ?? "Liga",
      season: league?.season ?? null,
      logoUrl: league?.logoUrl ?? null,
      color: league?.color ?? null, // ajusta si tu campo se llama distinto
    },
    group: group ? { id: groupSnap.id, name: group?.name ?? group?.code ?? "Grupo" } : null,
  };
}

async function getMatchday(db: FirebaseFirestore.Firestore, leagueId: string, groupId: string, matchdayId: string) {
  const md = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("groups")
    .doc(groupId)
    .collection("matchdays")
    .doc(matchdayId)
    .get();

  if (!md.exists) return null;
  const d = md.data() as any;
  return { number: d?.number ?? null, startDate: toDateSafe(d?.startDate), endDate: toDateSafe(d?.endDate) };
}

async function getMatch(
  db: FirebaseFirestore.Firestore,
  leagueId: string,
  groupId: string,
  matchdayId: string,
  matchId: string,
) {
  const ref = db
    .collection("leagues")
    .doc(leagueId)
    .collection("groups")
    .doc(groupId)
    .collection("matchdays")
    .doc(matchdayId)
    .collection("matches")
    .doc(matchId);

  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as any) };
}

async function getTeamNames(
  db: FirebaseFirestore.Firestore,
  leagueId: string,
  homeTeamId?: string,
  awayTeamId?: string,
) {
  const names: { home?: string; away?: string } = {};
  const ids = [homeTeamId, awayTeamId].filter(Boolean) as string[];
  if (!ids.length) return names;

  const chunk = (arr: string[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

  const teamsCol = db.collection("leagues").doc(leagueId).collection("teams");
  for (const part of chunk(ids, 10)) {
    const q = await teamsCol.where(FieldPath.documentId(), "in", part).get();
    q.forEach((doc) => {
      const d = doc.data() as any;
      if (doc.id === homeTeamId) names.home = d?.name ?? undefined;
      if (doc.id === awayTeamId) names.away = d?.name ?? undefined;
    });
  }
  return names;
}

// ---------- page ----------
export default async function Page({
  params,
}: {
  params: Promise<{ leagueId: string; groupId: string; matchdayId: string; matchId: string }>;
}) {
  // ⬇️ Desenrollamos el Promise que entrega Next (evita el error)
  const { leagueId, groupId, matchdayId, matchId } = await params;

  const db = getFirestore();

  // Header: liga, grupo, jornada
  const { league, group } = await getLeagueGroup(db, leagueId, groupId);
  const matchday = await getMatchday(db, leagueId, groupId, matchdayId);
  if (!league) notFound();

  // Partido: initial
  const match = await getMatch(db, leagueId, groupId, matchdayId, matchId);
  if (!match) notFound();

  const kickoff: Date | null = toDateSafe(match.kickoff ?? match.date);
  const fecha = kickoff ? `${kickoff.getFullYear()}-${pad2(kickoff.getMonth() + 1)}-${pad2(kickoff.getDate())}` : "";
  const hora = kickoff ? `${pad2(kickoff.getHours())}:${pad2(kickoff.getMinutes())}` : "";

  // Nombres de equipos (fallback si no vienen guardados en el match)
  const names = await getTeamNames(db, leagueId, match.homeTeamId, match.awayTeamId);

  const initial = {
    id: match.id,
    leagueId,
    groupId,
    matchdayId,
    matchId,
    venueName: match.venueName ?? match.venue ?? match.stadium ?? "",
    status: match.status ?? "SCHEDULED",
    homeGoals: typeof match.homeGoals === "number" ? match.homeGoals : "",
    awayGoals: typeof match.awayGoals === "number" ? match.awayGoals : "",
    fecha,
    hora,
    homeTeamName: match.homeTeamName ?? names.home ?? "Local",
    awayTeamName: match.awayTeamName ?? names.away ?? "Visitante",
  };

  return (
    <EditMatchForm
      initial={initial}
      header={{
        leagueName: league.name,
        season: league.season,
        groupName: group?.name ?? null,
        matchdayNumber: matchday?.number ?? null,
        leagueLogoUrl: league.logoUrl,
        leagueColorHex: league.color, // ajusta si tu campo real se llama distinto
      }}
    />
  );
}
