// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/teams/tiers/page.tsx

import { Suspense } from "react";

import { getFirestore } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { EntityHeader } from "@/components/entity-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamTier } from "@/domain/teams/team-tier";
import type { Team } from "@/domain/teams/team.types";
import { getByGroup } from "@/server/repositories/teams.repo";

import { TeamTiersBoard } from "./_components/team-tiers-board";

export const dynamic = "force-static"; // o simplemente borrar la línea
export const revalidate = 60; // o 0 si usarás revalidatePath en las actions
export const runtime = "nodejs";

type PageProps = {
  params: {
    leagueId: string;
    groupId: string;
  };
};

type LeagueDoc = {
  id: string;
  name: string;
  season?: string | null;
  colorHex?: string | null;
};

type GroupDoc = {
  id: string;
  name: string;
};

type TeamForBoard = {
  id: string;
  name: string;
  logoUrl?: string | null;
  tier?: TeamTier | null;
};

async function getLeagueAndGroup(
  leagueId: string,
  groupId: string,
): Promise<{
  league: LeagueDoc | null;
  group: GroupDoc | null;
}> {
  const db = getFirestore();

  const leagueSnap = await db.collection("leagues").doc(leagueId).get();
  const leagueData = leagueSnap.data() as any | undefined;

  const league: LeagueDoc | null = leagueSnap.exists
    ? {
        id: leagueSnap.id,
        name: leagueData?.name ?? "Liga",
        season: leagueData?.season ?? null,
        colorHex: leagueData?.color ?? null,
      }
    : null;

  let group: GroupDoc | null = null;
  if (leagueSnap.exists) {
    const groupSnap = await leagueSnap.ref.collection("groups").doc(groupId).get();
    const groupData = groupSnap.data() as any | undefined;
    group = groupSnap.exists
      ? {
          id: groupSnap.id,
          name: groupData?.name ?? groupData?.code ?? "Grupo",
        }
      : null;
  }

  return { league, group };
}

async function getTeamsForBoard(groupId: string): Promise<TeamForBoard[]> {
  const { items } = await getByGroup({ groupId, pageSize: 100 });
  // items ya vienen como plain<Team>
  return items.map((t) => ({
    id: t.id,
    name: t.name,
    logoUrl: (t as any).logoUrl ?? null,
    tier: (t as any).tier ?? null,
  }));
}

export default async function Page({ params }: PageProps) {
  const { leagueId, groupId } = params;

  const [{ league, group }, teams] = await Promise.all([
    getLeagueAndGroup(leagueId, groupId),
    getTeamsForBoard(groupId),
  ]);

  const headerTitle = league ? (group ? `${league.name} · ${group.name}` : league.name) : "Tiers de equipos";

  const subtitle = "Organiza los equipos por nivel de complejidad (Tranquilos, Regulares, Complicados…).";

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden">
      <EntityHeader
        loading={false}
        logoUrl={league?.colorHex ? undefined : "/media/FMF_Logo.png"}
        title={headerTitle}
        subtitle={subtitle}
        colorHex={league?.colorHex ?? null}
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
        <TeamTiersBoard leagueId={leagueId} groupId={groupId} teams={teams} />
      </Suspense>
    </div>
  );
}
