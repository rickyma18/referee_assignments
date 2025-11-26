// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/page.tsx
import { Suspense } from "react";

import Link from "next/link";
import { notFound } from "next/navigation";

import { getFirestore, Timestamp, FieldPath } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { EntityHeader } from "@/components/entity-header";
import { Button } from "@/components/ui/button";

import { MatchCard } from "./_components/match-card";
import { MatchdayToolbar, MatchCardSkeleton } from "./_components/matchday-toolbar";

export const dynamicParams = true;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
};

type MatchDoc = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff?: Timestamp | Date | string | null;
  date?: Timestamp | Date | string | null;
  stadium?: string | null;
  venue?: string | null;
  venueName?: string | null;
  status?: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | string;
  matchNumber?: number;
  homeGoals?: number | null;
  awayGoals?: number | null;
  notes?: string | null;

  // añadidos
  docPath?: string;
  leagueId?: string;
  groupId?: string;
  matchdayId?: string;
};

type TeamDoc = {
  id: string;
  name: string;
  logoUrl?: string | null;
  municipality?: string | null;
  stadium?: string | null;
};

type MatchVM = {
  id: string;
  dateObj: Date | null;
  status?: string;
  stadium?: string | null;
  venue?: string | null;
  venueName?: string | null;
  matchNumber?: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  homeGoals?: number | null;
  awayGoals?: number | null;
  homeTeam: TeamDoc | null;
  awayTeam: TeamDoc | null;

  // añadidos
  docPath?: string;
  leagueId?: string;
  groupId?: string;
  matchdayId?: string;
};

function toDateSafe(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input?.toDate === "function") {
    try {
      return input.toDate();
    } catch {
      /* noop */
    }
  }
  if (typeof input === "string") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const assertParam = (name: string, value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing route param: ${name}`);
  }
  return value;
};

// 🔁 helper para filtrar por estado (según query param `estado`)
function filterMatchesByEstado(matches: MatchVM[], estado: string): MatchVM[] {
  const normalized = (estado ?? "").toLowerCase();

  if (!normalized || normalized === "todos") return matches;

  return matches.filter((m) => {
    const s = (m.status ?? "SCHEDULED").toUpperCase();

    switch (normalized) {
      case "programados":
        // Programados = SCHEDULED + POSTPONED (ya no mostramos "Pospuestos", pero los tratamos como programados)
        return s === "SCHEDULED" || s === "POSTPONED";
      case "en-juego":
        return s === "LIVE";
      case "finalizados":
        return s === "FINISHED";
      default:
        return true;
    }
  });
}

// 🔁 helper para mostrar el estado en español en la tarjeta
function mapStatusToDisplay(status?: string): string {
  const s = (status ?? "SCHEDULED").toUpperCase();
  switch (s) {
    case "LIVE":
      return "EN JUEGO";
    case "FINISHED":
      return "FINALIZADO";
    // case "POSTPONED": // ya no queremos mostrar "Pospuesto" como estado
    //   return "PROGRAMADO";
    case "SCHEDULED":
    default:
      return "PROGRAMADO";
  }
}

async function getMatchdayHeader(db: FirebaseFirestore.Firestore, rawParams: Params) {
  const leagueId = assertParam("leagueId", rawParams.leagueId);
  const groupId = assertParam("groupId", rawParams.groupId);
  const matchdayId = assertParam("matchdayId", rawParams.matchdayId);

  const mdRef = db
    .collection("leagues")
    .doc(leagueId)
    .collection("groups")
    .doc(groupId)
    .collection("matchdays")
    .doc(matchdayId);

  const snap = await mdRef.get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  return {
    number: data?.number ?? null,
    startDate: toDateSafe(data?.startDate),
    endDate: toDateSafe(data?.endDate),
    status: data?.status ?? "ACTIVE",
  };
}

async function getLeagueAndGroupHeader(db: FirebaseFirestore.Firestore, rawParams: Params) {
  const leagueId = assertParam("leagueId", rawParams.leagueId);
  const groupId = assertParam("groupId", rawParams.groupId);

  const leagueSnap = await db.collection("leagues").doc(leagueId).get();
  if (!leagueSnap.exists) return { league: null, group: null };

  const leagueData = leagueSnap.data() as any;
  const groupSnap = await db.collection("leagues").doc(leagueId).collection("groups").doc(groupId).get();
  const groupData = groupSnap.exists ? (groupSnap.data() as any) : null;

  return {
    league: {
      id: leagueSnap.id,
      name: leagueData?.name ?? "Liga",
      season: leagueData?.season ?? null,
      logoUrl: leagueData?.logoUrl ?? null,
      color: leagueData?.color ?? null, // hex tipo "#1F8B4C"
    },
    group: groupData
      ? {
          id: groupSnap.id,
          name: groupData?.name ?? groupData?.code ?? "Grupo",
        }
      : null,
  };
}

async function getMatchesWithTeams(rawParams: Params): Promise<MatchVM[]> {
  const leagueId = assertParam("leagueId", rawParams.leagueId);
  const groupId = assertParam("groupId", rawParams.groupId);
  const matchdayId = assertParam("matchdayId", rawParams.matchdayId);

  const db = getFirestore();

  const matchesRef = db
    .collection("leagues")
    .doc(leagueId)
    .collection("groups")
    .doc(groupId)
    .collection("matchdays")
    .doc(matchdayId)
    .collection("matches");

  const matchesSnap = await matchesRef.orderBy("kickoff", "asc").get();
  const matches: MatchDoc[] = matchesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
    docPath: d.ref.path,
    leagueId: (d.data() as any)?.leagueId ?? leagueId,
    groupId: (d.data() as any)?.groupId ?? groupId,
    matchdayId: (d.data() as any)?.matchdayId ?? matchdayId,
  }));

  const teamIds = Array.from(new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean)));

  const teamsMap = new Map<string, TeamDoc>();
  if (teamIds.length) {
    const chunk = (arr: string[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

    const leagueTeamsCol = db.collection("leagues").doc(leagueId).collection("teams");
    for (const ids of chunk(teamIds, 10)) {
      const snap = await leagueTeamsCol.where(FieldPath.documentId(), "in", ids).get();
      snap.forEach((doc) => {
        const t = doc.data() as any;
        teamsMap.set(doc.id, {
          id: doc.id,
          name: t?.name ?? "—",
          logoUrl: t?.logoUrl ?? null,
          municipality: t?.municipality ?? null,
          stadium: t?.stadium ?? null,
        });
      });
    }

    const missing = teamIds.filter((id) => !teamsMap.has(id));
    if (missing.length) {
      const rootTeamsCol = db.collection("teams");
      for (const ids of chunk(missing, 10)) {
        const snap = await rootTeamsCol.where(FieldPath.documentId(), "in", ids).get();
        snap.forEach((doc) => {
          const t = doc.data() as any;
          teamsMap.set(doc.id, {
            id: doc.id,
            name: t?.name ?? "—",
            logoUrl: t?.logoUrl ?? null,
            municipality: t?.municipality ?? null,
            stadium: t?.stadium ?? null,
          });
        });
      }
    }
  }

  return matches.map((m) => {
    const dateObj = toDateSafe((m as any).kickoff ?? (m as any).date);
    return {
      id: m.id,
      dateObj,
      status: m.status,
      stadium: m.stadium ?? null,
      venue: m.venue ?? null,
      venueName: (m as any).venueName ?? null,
      matchNumber: m.matchNumber,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeTeamName: (m as any).homeTeamName ?? null,
      awayTeamName: (m as any).awayTeamName ?? null,
      homeGoals: m.homeGoals ?? null,
      awayGoals: m.awayGoals ?? null,
      homeTeam: teamsMap.get(m.homeTeamId) ?? null,
      awayTeam: teamsMap.get(m.awayTeamId) ?? null,

      docPath: m.docPath,
      leagueId: m.leagueId,
      groupId: m.groupId,
      matchdayId: m.matchdayId,
    };
  });
}

// 👇 ahora aceptamos searchParams para leer el filtro `estado`
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const p = await params;
  const sp = await searchParams;

  if (!p.leagueId || !p.groupId || !p.matchdayId) {
    notFound();
  }

  const estadoFilter = sp?.estado ?? "todos";

  const db = getFirestore();
  const header = await getMatchdayHeader(db, p);
  if (!header) notFound();

  const { league, group } = await getLeagueAndGroupHeader(db, p);
  const matches = await getMatchesWithTeams(p);

  const filteredMatches = filterMatchesByEstado(matches, estadoFilter);

  const backHref = `/dashboard/leagues/${p.leagueId}/groups/${p.groupId}/matchdays`;
  const createHref = `/dashboard/leagues/${p.leagueId}/groups/${p.groupId}/matchdays/${p.matchdayId}/matches/upload`;

  return (
    <div className="space-y-6">
      <EntityHeader
        logoUrl={league?.logoUrl ?? null}
        title={<span>Jornada {header.number ?? "—"}</span>}
        subtitle={
          <span className="truncate">
            {league?.name ?? "Liga"}
            {league?.season ? ` • ${league.season}` : ""}
            {group?.name ? ` • ${group.name}` : ""}
          </span>
        }
        colorHex={league?.color ?? null}
        backHref={backHref}
        backText="Volver a jornadas"
        canDelete={false}
        rightExtra={
          <Button asChild>
            <Link href={createHref}>Añadir partido</Link>
          </Button>
        }
      />

      <MatchdayToolbar
        number={header.number}
        startDate={header.startDate}
        endDate={header.endDate}
        total={matches.length}
        estadoActual={estadoFilter}
      />

      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <MatchCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        {filteredMatches.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-4 rounded-xl border p-10">
            <p>No hay partidos con ese filtro en esta jornada.</p>
            <Button asChild>
              <Link href={createHref}>Añadir partido</Link>
            </Button>
          </div>
        ) : (
          <MatchesGrid matches={filteredMatches} />
        )}
      </Suspense>
    </div>
  );
}

function MatchesGrid({ matches }: { matches: MatchVM[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {matches.map((m) => (
        <MatchCard
          key={m.id}
          id={m.id}
          date={m.dateObj ?? null}
          // 👇 ahora el estado se muestra en español
          status={mapStatusToDisplay(m.status)}
          stadium={m.stadium ?? m.venueName ?? m.venue ?? m.homeTeam?.stadium ?? null}
          matchNumber={m.matchNumber ?? undefined}
          home={{
            id: m.homeTeamId,
            name: m.homeTeam?.name ?? m.homeTeamName ?? "Por definir",
            logoUrl: m.homeTeam?.logoUrl ?? undefined,
            goals: m.homeGoals ?? undefined,
          }}
          away={{
            id: m.awayTeamId,
            name: m.awayTeam?.name ?? m.awayTeamName ?? "Por definir",
            logoUrl: m.awayTeam?.logoUrl ?? undefined,
            goals: m.awayGoals ?? undefined,
          }}
          // añadidos
          docPath={m.docPath}
          realIds={{
            leagueId: m.leagueId,
            groupId: m.groupId,
            matchdayId: m.matchdayId,
          }}
        />
      ))}
    </div>
  );
}
