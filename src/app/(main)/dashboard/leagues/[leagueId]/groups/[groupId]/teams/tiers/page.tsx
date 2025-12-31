// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/teams/tiers/page.tsx

import { Suspense } from "react";

import { notFound } from "next/navigation";

import { getFirestore } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { EntityHeader } from "@/components/entity-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamTier } from "@/domain/teams/team-tier";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { getByGroup } from "@/server/repositories/teams.repo";

import { TeamTiersBoard } from "./_components/team-tiers-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;
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
  delegateId?: string | null;
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

async function getLeagueAndGroupScoped(
  leagueId: string,
  groupId: string,
): Promise<{
  league: LeagueDoc | null;
  group: GroupDoc | null;
}> {
  const ctx = await getDelegateContext();

  // Si no es super y no hay delegateId efectivo => no debería entrar
  if (!ctx.isSuper && !ctx.effectiveDelegateId) {
    return { league: null, group: null };
  }

  const db = getFirestore();
  const leagueSnap = await db.collection("leagues").doc(leagueId).get();

  if (!leagueSnap.exists) return { league: null, group: null };

  const leagueData = leagueSnap.data() as any;

  // Scoping: si hay filtro por delegate, la liga debe pertenecer
  if (ctx.effectiveDelegateId) {
    if ((leagueData?.delegateId ?? null) !== ctx.effectiveDelegateId) {
      return { league: null, group: null };
    }
  } else {
    // modo global: solo super
    if (!ctx.isSuper) return { league: null, group: null };
  }

  const league: LeagueDoc = {
    id: leagueSnap.id,
    name: leagueData?.name ?? "Liga",
    season: leagueData?.season ?? null,
    colorHex: leagueData?.color ?? null,
    delegateId: leagueData?.delegateId ?? null,
  };

  const groupSnap = await leagueSnap.ref.collection("groups").doc(groupId).get();
  if (!groupSnap.exists) return { league, group: null };

  const groupData = groupSnap.data() as any;

  const group: GroupDoc = {
    id: groupSnap.id,
    name: groupData?.name ?? groupData?.code ?? "Grupo",
  };

  return { league, group };
}

async function getTeamsForBoard(groupId: string): Promise<TeamForBoard[]> {
  const { items } = await getByGroup({ groupId, pageSize: 500 });
  return (items ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    logoUrl: t.logoUrl ?? null,
    tier: t.tier ?? null,
  }));
}

export default async function Page({ params }: PageProps) {
  const { leagueId, groupId } = params;

  const [{ league, group }, teams] = await Promise.all([
    getLeagueAndGroupScoped(leagueId, groupId),
    getTeamsForBoard(groupId),
  ]);

  // Si no pasa scoping/ownership => 404
  if (!league || !group) {
    notFound();
  }

  const headerTitle = group ? `${league.name} · ${group.name}` : league.name;
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
