// src/app/(main)/dashboard/assignments/page.tsx
import { Suspense } from "react";

import { unstable_cache } from "next/cache";

import { getFirestore } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { EntityHeader } from "@/components/entity-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getDelegateContext } from "@/server/auth/get-delegate-context";

import { AssignmentsTable } from "./_components/assignments-table";
import type { AssignmentMatchRow } from "./_components/assignments-types";

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

type RefereeOption = {
  id: string;
  name: string;
  status: string;
  canAssess: boolean;
};

type MatchesDataResult = {
  leagues: LeagueDoc[];
  groups: GroupDoc[];
  matches: AssignmentMatchRow[];
};

type AssignmentsDataResult = MatchesDataResult & {
  referees: RefereeOption[];
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

// ─── Queries puras (sin cache) ───────────────────────────────────────────────

async function fetchRefereesFromFirestore(
  shouldScope: boolean,
  effectiveDelegateId: string | null,
): Promise<RefereeOption[]> {
  const db = getFirestore();
  const base = db.collection("referees").where("status", "==", "DISPONIBLE");
  const query = shouldScope ? base.where("delegateId", "==", effectiveDelegateId) : base;
  const snap = await query.get();

  return snap.docs.map((d) => {
    const data = d.data() as any;
    const status = (data?.status ?? "").toString().toUpperCase();
    const rawName = (data?.name as string | undefined) ?? `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim();
    const name = rawName && rawName.trim().length > 0 ? rawName : "Sin nombre";
    return { id: d.id, name, status, canAssess: Boolean(data?.canAssess) };
  });
}

/**
 * Queries paralelas de leagues → groups → matchdays → matches.
 * 4 rondas secuenciales de awaits paralelos (vs ~92 secuenciales antes).
 */
async function fetchMatchesDataFromFirestore(
  shouldScope: boolean,
  effectiveDelegateId: string | null,
): Promise<MatchesDataResult> {
  const db = getFirestore();

  // ── Ronda 1: leagues ───────────────────────────────────────────────────
  const leaguesQuery = shouldScope
    ? db.collection("leagues").where("delegateId", "==", effectiveDelegateId)
    : db.collection("leagues");

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

  // ── Ronda 2: groups (todas las ligas en paralelo) ──────────────────────
  const groupResults = await Promise.all(
    leaguesSnap.docs.map(async (lg) => {
      const grpSnap = await lg.ref.collection("groups").get();
      return { leagueId: lg.id, docs: grpSnap.docs };
    }),
  );

  const groups: GroupDoc[] = [];

  type GroupMeta = {
    leagueId: string;
    leagueName: string;
    leagueColor: string | null;
    groupDoc: FirebaseFirestore.QueryDocumentSnapshot;
  };
  const allGroupMetas: GroupMeta[] = [];

  for (const { leagueId, docs } of groupResults) {
    const lgData = leaguesSnap.docs.find((d) => d.id === leagueId)?.data() as any;
    const leagueName = lgData?.name ?? "Liga";
    const leagueColor = lgData?.color ?? null;

    for (const g of docs) {
      const data = g.data() as any;
      groups.push({
        id: g.id,
        name: data?.name ?? data?.code ?? "Grupo",
        leagueId,
      });
      allGroupMetas.push({ leagueId, leagueName, leagueColor, groupDoc: g });
    }
  }

  // ── Ronda 3: matchdays (todos los grupos en paralelo) ──────────────────
  const matchdayResults = await Promise.all(
    allGroupMetas.map(async (gm) => {
      const mdSnap = await gm.groupDoc.ref.collection("matchdays").get();
      return { gm, docs: mdSnap.docs };
    }),
  );

  type MatchdayMeta = {
    leagueId: string;
    leagueName: string;
    leagueColor: string | null;
    groupId: string;
    groupName: string;
    matchdayDoc: FirebaseFirestore.QueryDocumentSnapshot;
  };
  const allMatchdayMetas: MatchdayMeta[] = [];

  for (const { gm, docs } of matchdayResults) {
    const groupData = gm.groupDoc.data() as any;
    const groupName = groupData?.name ?? groupData?.code ?? "Grupo";

    for (const md of docs) {
      allMatchdayMetas.push({
        leagueId: gm.leagueId,
        leagueName: gm.leagueName,
        leagueColor: gm.leagueColor,
        groupId: gm.groupDoc.id,
        groupName,
        matchdayDoc: md,
      });
    }
  }

  // ── Ronda 4: matches (todos los matchdays en paralelo) ─────────────────
  const matchResults = await Promise.all(
    allMatchdayMetas.map(async (mm) => {
      const matchesSnap = await mm.matchdayDoc.ref.collection("matches").orderBy("kickoff", "asc").get();
      return { mm, docs: matchesSnap.docs };
    }),
  );

  const matches: AssignmentMatchRow[] = [];

  for (const { mm, docs } of matchResults) {
    const mdData = mm.matchdayDoc.data() as any;
    const matchdayNumber: number | null = typeof mdData?.number === "number" ? mdData.number : null;

    for (const m of docs) {
      const data = m.data() as any;
      const kickoffDate = toDateSafe(data.kickoff ?? data.date);
      const kickoffIso = kickoffDate ? kickoffDate.toISOString() : null;

      matches.push({
        id: m.id,
        leagueId: mm.leagueId,
        leagueName: mm.leagueName,
        groupId: mm.groupId,
        groupName: mm.groupName,
        matchdayId: mm.matchdayDoc.id,
        matchdayNumber,
        kickoff: kickoffIso,
        category: data?.category ?? null,
        jornadaLabel: mdData?.label ?? null,
        homeTeamName: data?.homeTeamName ?? "Local",
        awayTeamName: data?.awayTeamName ?? "Visitante",
        venueName: data?.venueName ?? data?.stadium ?? null,
        centralRefereeId: data?.centralRefereeId ?? null,
        centralExternalLabel: data?.centralExternalLabel ?? null,
        aa1RefereeId: data?.aa1RefereeId ?? null,
        aa1ExternalLabel: data?.aa1ExternalLabel ?? null,
        aa2RefereeId: data?.aa2RefereeId ?? null,
        aa2ExternalLabel: data?.aa2ExternalLabel ?? null,
        fourthRefereeId: data?.fourthRefereeId ?? null,
        fourthExternalLabel: data?.fourthExternalLabel ?? null,
        assessorRefereeId: data?.assessorRefereeId ?? null,
        assessorExternalLabel: data?.assessorExternalLabel ?? null,
        leagueColorHex: mm.leagueColor,
      });
    }
  }

  return { leagues, groups, matches };
}

// ─── Loader principal con cache ──────────────────────────────────────────────

async function getAssignmentsData(): Promise<AssignmentsDataResult> {
  // Auth siempre fresco (lee cookies/session)
  const ctx = await getDelegateContext();

  const shouldScope = !(ctx.isSuper && !ctx.effectiveDelegateId);
  const effectiveDelegateId = ctx.effectiveDelegateId;

  if (shouldScope && !effectiveDelegateId) {
    return { leagues: [], groups: [], matches: [], referees: [] };
  }

  const delegateKey = shouldScope ? (effectiveDelegateId ?? "global") : "global";

  // Referees: TTL largo (10 min) — cambian con poca frecuencia
  const getCachedReferees = unstable_cache(
    () => fetchRefereesFromFirestore(shouldScope, effectiveDelegateId),
    ["referees", delegateKey],
    { revalidate: 600, tags: [`referees:${delegateKey}`] },
  );

  // Assignments (leagues + groups + matchdays + matches): TTL corto (2 min)
  const getCachedMatchesData = unstable_cache(
    () => fetchMatchesDataFromFirestore(shouldScope, effectiveDelegateId),
    ["assignments", delegateKey],
    { revalidate: 120, tags: [`assignments:${delegateKey}`] },
  );

  const [referees, matchesData] = await Promise.all([getCachedReferees(), getCachedMatchesData()]);

  return { ...matchesData, referees };
}

export default async function Page() {
  const { leagues, groups, matches, referees } = await getAssignmentsData();

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden">
      <EntityHeader
        loading={false}
        logoUrl="/media/FMF_Logo.png"
        title="Designaciones"
        subtitle="Asigna ternas a los partidos próximos"
        colorHex={null}
        canDelete={false}
      />

      <div className="w-full overflow-x-auto">
        <Suspense
          fallback={
            <div className="min-w-[800px] space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[400px] w-full" />
            </div>
          }
        >
          <div className="min-w-[900px]">
            <AssignmentsTable leagues={leagues} groups={groups} matches={matches} referees={referees} />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
