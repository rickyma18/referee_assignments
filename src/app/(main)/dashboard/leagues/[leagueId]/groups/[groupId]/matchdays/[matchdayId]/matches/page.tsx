// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/page.tsx
import { Suspense } from "react";

import { unstable_cache } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getFirestore, Timestamp } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { EntityHeader } from "@/components/entity-header";
import { Button } from "@/components/ui/button";
import { getDelegateContext } from "@/server/auth/get-delegate-context";

import { MatchCardClient } from "./_components/match-card-client";
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
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  homeTeamLogoUrl?: string | null;
  awayTeamLogoUrl?: string | null;
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

  // designaciones
  centralRefereeId?: string | null;
  centralExternalLabel?: string | null;
  centralRefereeName?: string | null;
  aa1RefereeId?: string | null;
  aa1ExternalLabel?: string | null;
  aa1RefereeName?: string | null;
  aa2RefereeId?: string | null;
  aa2ExternalLabel?: string | null;
  aa2RefereeName?: string | null;
  fourthRefereeId?: string | null;
  fourthExternalLabel?: string | null;
  fourthRefereeName?: string | null;
  assessorRefereeId?: string | null;
  assessorExternalLabel?: string | null;
  assessorRefereeName?: string | null;

  // añadidos
  docPath?: string;
  leagueId?: string;
  groupId?: string;
  matchdayId?: string;
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
  homeTeamLogoUrl?: string | null;
  awayTeamLogoUrl?: string | null;
  homeGoals?: number | null;
  awayGoals?: number | null;

  // designaciones
  centralRefereeId?: string | null;
  centralExternalLabel?: string | null;
  centralRefereeName?: string | null;
  aa1RefereeId?: string | null;
  aa1ExternalLabel?: string | null;
  aa1RefereeName?: string | null;
  aa2RefereeId?: string | null;
  aa2ExternalLabel?: string | null;
  aa2RefereeName?: string | null;
  fourthRefereeId?: string | null;
  fourthExternalLabel?: string | null;
  fourthRefereeName?: string | null;
  assessorRefereeId?: string | null;
  assessorExternalLabel?: string | null;
  assessorRefereeName?: string | null;

  // añadidos
  docPath?: string;
  leagueId?: string;
  groupId?: string;
  matchdayId?: string;
};

type RefereeOption = {
  id: string;
  name: string;
  status: string;
  canAssess: boolean;
};

async function fetchReferees(shouldScope: boolean, effectiveDelegateId: string | null): Promise<RefereeOption[]> {
  if (shouldScope && !effectiveDelegateId) return [];
  const db = getFirestore();
  const base = db.collection("referees").where("status", "==", "DISPONIBLE");
  const query = shouldScope ? base.where("delegateId", "==", effectiveDelegateId) : base;
  const snap = await query.get();
  return snap.docs.map((d) => {
    const data = d.data() as any;
    const rawName = (data?.name as string | undefined) ?? `${data?.firstName ?? ""} ${data?.lastName ?? ""}`.trim();
    return {
      id: d.id,
      name: rawName.trim() || "Sin nombre",
      status: String(data?.status ?? ""),
      canAssess: Boolean(data?.canAssess),
    };
  });
}

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

  // Debug: log first 2 matches to verify Firestore data (server-side only)
  if (process.env.NEXT_PUBLIC_DEBUG_LOGOS === "1" && matches.length > 0) {
    for (const sample of matches.slice(0, 2)) {
      console.debug(
        "[MatchesPage] matchId=%s home=%s homeLogoUrl=%s away=%s awayLogoUrl=%s",
        sample.id,
        (sample as any).homeTeamName ?? "?",
        (sample as any).homeTeamLogoUrl ?? "MISSING",
        (sample as any).awayTeamName ?? "?",
        (sample as any).awayTeamLogoUrl ?? "MISSING",
      );
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
      venueName: m.venueName ?? null,
      matchNumber: m.matchNumber,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeTeamName: m.homeTeamName ?? null,
      awayTeamName: m.awayTeamName ?? null,
      homeTeamLogoUrl: m.homeTeamLogoUrl ?? null,
      awayTeamLogoUrl: m.awayTeamLogoUrl ?? null,
      homeGoals: m.homeGoals ?? null,
      awayGoals: m.awayGoals ?? null,

      // designaciones — read directly from the match doc (no extra queries)
      centralRefereeId: m.centralRefereeId ?? null,
      centralExternalLabel: m.centralExternalLabel ?? null,
      centralRefereeName: m.centralRefereeName ?? null,
      aa1RefereeId: m.aa1RefereeId ?? null,
      aa1ExternalLabel: m.aa1ExternalLabel ?? null,
      aa1RefereeName: m.aa1RefereeName ?? null,
      aa2RefereeId: m.aa2RefereeId ?? null,
      aa2ExternalLabel: m.aa2ExternalLabel ?? null,
      aa2RefereeName: m.aa2RefereeName ?? null,
      fourthRefereeId: m.fourthRefereeId ?? null,
      fourthExternalLabel: m.fourthExternalLabel ?? null,
      fourthRefereeName: m.fourthRefereeName ?? null,
      assessorRefereeId: m.assessorRefereeId ?? null,
      assessorExternalLabel: m.assessorExternalLabel ?? null,
      assessorRefereeName: m.assessorRefereeName ?? null,

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

  // ── Auth: role + referees (only needed for canEdit roles) ──────────────
  const ctx = await getDelegateContext();
  const role = ctx.role ?? "DESCONOCIDO";
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO" || role === "ASISTENTE";

  const shouldScope = !(ctx.isSuper && !ctx.effectiveDelegateId);
  const effectiveDelegateId = ctx.effectiveDelegateId ?? null;
  const delegateKey = shouldScope ? (effectiveDelegateId ?? "global") : "global";

  // Cache referees for 10 min — they change rarely
  const getCachedReferees = unstable_cache(
    () => fetchReferees(shouldScope, effectiveDelegateId),
    ["referees", delegateKey],
    { revalidate: 600, tags: [`referees:${delegateKey}`] },
  );

  const [header, { league, group }, matches, referees] = await Promise.all([
    getMatchdayHeader(db, p),
    getLeagueAndGroupHeader(db, p),
    getMatchesWithTeams(p),
    canEdit ? getCachedReferees() : Promise.resolve<RefereeOption[]>([]),
  ]);

  if (!header) notFound();

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
          <MatchesGrid matches={filteredMatches} referees={referees} canEdit={canEdit} />
        )}
      </Suspense>
    </div>
  );
}

function MatchesGrid({
  matches,
  referees,
  canEdit,
}: {
  matches: MatchVM[];
  referees: RefereeOption[];
  canEdit: boolean;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {matches.map((m) => (
        <MatchCardClient
          key={m.id}
          id={m.id}
          date={m.dateObj ?? null}
          // 👇 ahora el estado se muestra en español
          status={mapStatusToDisplay(m.status)}
          stadium={m.stadium ?? m.venueName ?? m.venue ?? null}
          matchNumber={m.matchNumber ?? undefined}
          home={{
            id: m.homeTeamId,
            name: m.homeTeamName ?? "Por definir",
            logoUrl: m.homeTeamLogoUrl ?? undefined,
            goals: m.homeGoals ?? undefined,
          }}
          away={{
            id: m.awayTeamId,
            name: m.awayTeamName ?? "Por definir",
            logoUrl: m.awayTeamLogoUrl ?? undefined,
            goals: m.awayGoals ?? undefined,
          }}
          // añadidos
          docPath={m.docPath}
          realIds={{
            leagueId: m.leagueId,
            groupId: m.groupId,
            matchdayId: m.matchdayId,
          }}
          assignments={{
            centralRefereeId: m.centralRefereeId,
            centralExternalLabel: m.centralExternalLabel,
            centralRefereeName: m.centralRefereeName,
            aa1RefereeId: m.aa1RefereeId,
            aa1ExternalLabel: m.aa1ExternalLabel,
            aa1RefereeName: m.aa1RefereeName,
            aa2RefereeId: m.aa2RefereeId,
            aa2ExternalLabel: m.aa2ExternalLabel,
            aa2RefereeName: m.aa2RefereeName,
            fourthRefereeId: m.fourthRefereeId,
            fourthExternalLabel: m.fourthExternalLabel,
            fourthRefereeName: m.fourthRefereeName,
            assessorRefereeId: m.assessorRefereeId,
            assessorExternalLabel: m.assessorExternalLabel,
            assessorRefereeName: m.assessorRefereeName,
          }}
          matchIds={{
            leagueId: m.leagueId ?? "",
            groupId: m.groupId ?? "",
            matchdayId: m.matchdayId ?? "",
            matchId: m.id,
          }}
          referees={referees}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
