// src/app/(main)/dashboard/teams/tiers/page.tsx

import { getFirestore } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { EntityHeader } from "@/components/entity-header";
import type { TeamTier } from "@/domain/teams/team-tier";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { getByGroup } from "@/server/repositories/teams.repo";

import { TeamTiersBoard } from "./_components/team-tiers-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  leagueId: string;
};

export type TeamForBoard = {
  id: string;
  name: string;
  logoUrl?: string | null;
  tier?: TeamTier | null;
};

async function getLeaguesAndGroups(): Promise<{
  leagues: LeagueDoc[];
  groups: GroupDoc[];
}> {
  const ctx = await getDelegateContext();

  // DELEGADO sin delegateId => vacío
  if (ctx.role === "DELEGADO" && !ctx.effectiveDelegateId) {
    return { leagues: [], groups: [] };
  }

  const db = getFirestore();

  let leaguesQuery: FirebaseFirestore.Query = db.collection("leagues");

  // Si hay filtro activo (delegado o super con delegado seleccionado)
  if (ctx.effectiveDelegateId) {
    leaguesQuery = leaguesQuery.where("delegateId", "==", ctx.effectiveDelegateId);
  } else {
    // Modo global: solo super debe ver todo
    if (!ctx.isSuper) {
      return { leagues: [], groups: [] };
    }
  }

  const leaguesSnap = await leaguesQuery.get();

  const leagues: LeagueDoc[] = leaguesSnap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      name: data?.name ?? "Liga",
      season: data?.season ?? null,
      colorHex: data?.color ?? null,
    };
  });

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

  return { leagues, groups };
}

async function getTeamsForBoard(groupId: string | undefined): Promise<TeamForBoard[]> {
  if (!groupId) return [];

  // Nota: este repo usa Admin SDK; aquí estamos “scoping” por groupId
  // que proviene SOLO de grupos ya filtrados por league->delegateId (arriba),
  // así evitamos leaks por query param.
  const { items } = await getByGroup({ groupId, pageSize: 500 });

  return (items ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    logoUrl: t.logoUrl ?? null,
    tier: t.tier ?? null,
  }));
}

export default async function Page({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : undefined;
  const spLeagueId = typeof sp?.leagueId === "string" ? sp.leagueId : undefined;
  const spGroupId = typeof sp?.groupId === "string" ? sp.groupId : undefined;

  const { leagues, groups } = await getLeaguesAndGroups();

  // League inicial
  const initialLeagueId =
    spLeagueId && leagues.some((l) => l.id === spLeagueId)
      ? spLeagueId
      : leagues.length > 0
        ? leagues[0].id
        : undefined;

  // Groups del league inicial
  const groupsForInitialLeague = initialLeagueId ? groups.filter((g) => g.leagueId === initialLeagueId) : [];

  // Group inicial
  const initialGroupId =
    spGroupId && groupsForInitialLeague.some((g) => g.id === spGroupId)
      ? spGroupId
      : groupsForInitialLeague.length > 0
        ? groupsForInitialLeague[0].id
        : undefined;

  const teams = await getTeamsForBoard(initialGroupId);

  const league = initialLeagueId ? (leagues.find((l) => l.id === initialLeagueId) ?? null) : null;
  const group = initialGroupId ? (groups.find((g) => g.id === initialGroupId) ?? null) : null;

  const headerTitle = "Tier List de equipos";
  const subtitle =
    "Organiza los equipos por nivel de complejidad (Estandar, Regulares, Complicados…) para la sugerencia automática de ternas.";

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden">
      <EntityHeader
        loading={false}
        logoUrl={league?.colorHex ? undefined : "/media/FMF_Logo.png"}
        title={headerTitle}
        canDelete={false}
      />

      <TeamTiersBoard
        leagues={leagues}
        groups={groups}
        initialLeagueId={initialLeagueId}
        initialGroupId={initialGroupId}
        initialTeams={teams}
      />
    </div>
  );
}
