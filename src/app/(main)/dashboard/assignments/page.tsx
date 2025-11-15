// src/app/(main)/dashboard/assignments/page.tsx
import { Suspense } from "react";

import { getFirestore, Timestamp } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { EntityHeader } from "@/components/entity-header";
import { Skeleton } from "@/components/ui/skeleton";

import { AssignmentsTable } from "./_components/assignments-table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LeagueDoc = {
  id: string;
  name: string;
  season?: string | null;
  colorHex?: string | null;
};

type GroupDoc = {
  id: string;
  name: string;
  leagueId: string;
};

type AssignmentMatchRow = {
  id: string;
  leagueId: string;
  leagueName: string;
  groupId: string;
  groupName: string;
  matchdayId: string;
  matchdayNumber: number | null;
  kickoff: string | null; // ISO string para mandarlo al cliente
  category?: string | null;
  jornadaLabel?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string | null;
  centralRefereeId?: string | null;
  aa1RefereeId?: string | null;
  aa2RefereeId?: string | null;
  leagueColorHex?: string | null;
};

type RefereeOption = {
  id: string;
  name: string;
  status: string;
  canAssess: boolean;
};

function toDateSafe(input: any): Date | null {
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
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

async function getAssignmentsData(): Promise<{
  leagues: LeagueDoc[];
  groups: GroupDoc[];
  matches: AssignmentMatchRow[];
  referees: RefereeOption[];
}> {
  const db = getFirestore();

  // 1) Ligas
  const leaguesSnap = await db.collection("leagues").get();
  const leagues: LeagueDoc[] = leaguesSnap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      name: data?.name ?? "Liga",
      season: data?.season ?? null,
      colorHex: data?.color ?? null,
    };
  });

  // 2) Grupos (por liga)
  const groups: GroupDoc[] = [];
  for (const lg of leaguesSnap.docs) {
    const grpSnap = await lg.ref.collection("groups").get();
    grpSnap.forEach((g) => {
      const data = g.data() as any;
      groups.push({
        id: g.id,
        name: data?.name ?? data?.code ?? "Grupo",
        leagueId: lg.id,
      });
    });
  }

  // 3) Partidos próximos
  const now = new Date();
  const matches: AssignmentMatchRow[] = [];

  for (const lg of leaguesSnap.docs) {
    const leagueId = lg.id;
    const leagueData = lg.data() as any;
    const leagueName = leagueData?.name ?? "Liga";

    const groupsSnap = await lg.ref.collection("groups").get();
    for (const g of groupsSnap.docs) {
      const groupId = g.id;
      const groupData = g.data() as any;
      const groupName = groupData?.name ?? groupData?.code ?? "Grupo";

      const matchdaysSnap = await g.ref.collection("matchdays").get();
      for (const md of matchdaysSnap.docs) {
        const mdData = md.data() as any;
        const matchdayId = md.id;
        const matchdayNumber: number | null = typeof mdData?.number === "number" ? mdData.number : null;

        const matchesSnap = await md.ref
          .collection("matches")
          .where("kickoff", ">=", now)
          .orderBy("kickoff", "asc")
          .get();

        matchesSnap.forEach((m) => {
          const data = m.data() as any;

          const kickoffDate = toDateSafe(data.kickoff ?? data.date);
          const kickoffIso = kickoffDate ? kickoffDate.toISOString() : null;

          matches.push({
            id: m.id,
            leagueId,
            leagueName,
            groupId,
            groupName,
            matchdayId,
            matchdayNumber,
            kickoff: kickoffIso,
            category: data?.category ?? null,
            jornadaLabel: mdData?.label ?? null,
            homeTeamName: data?.homeTeamName ?? "Local",
            awayTeamName: data?.awayTeamName ?? "Visitante",
            venueName: data?.venueName ?? data?.stadium ?? null,
            centralRefereeId: data?.centralRefereeId ?? null,
            aa1RefereeId: data?.aa1RefereeId ?? null,
            aa2RefereeId: data?.aa2RefereeId ?? null,
            leagueColorHex: leagueData?.color ?? null,
          });
        });
      }
    }
  }

  // 4) Árbitros disponibles (solo DISPONIBLE)
  const refereesSnap = await db.collection("referees").get();
  const referees: RefereeOption[] = refereesSnap.docs
    .map((d) => {
      const data = d.data() as any;
      const status = (data?.status ?? "").toString().toUpperCase();

      const rawName = (data?.name as string | undefined) ?? `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim();
      const name = rawName && rawName.trim().length > 0 ? rawName : "Sin nombre";

      return {
        id: d.id,
        name,
        status,
        canAssess: Boolean(data?.canAssess), // 👈 NUEVO: viene del doc de referee
      };
    })
    .filter((r) => r.status === "DISPONIBLE");

  return { leagues, groups, matches, referees };
}

export default async function Page() {
  const { leagues, groups, matches, referees } = await getAssignmentsData();

  return (
    <div className="space-y-6">
      <EntityHeader
        loading={false}
        logoUrl="/media/FMF_Logo.png"
        title="Designaciones"
        subtitle="Asigna ternas a los partidos próximos"
        colorHex={null}
        backHref="/dashboard"
        canDelete={false}
      />

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        }
      >
        <AssignmentsTable leagues={leagues} groups={groups} matches={matches} referees={referees} />
      </Suspense>
    </div>
  );
}
