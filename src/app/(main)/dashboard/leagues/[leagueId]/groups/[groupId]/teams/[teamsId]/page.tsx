// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/teams/[teamId]/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";

import { useParams, usePathname } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getGroupAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";
import { getTeamAction } from "@/server/actions/teams.actions";

type LeagueUI = {
  id: string;
  name: string;
  season: string;
  status?: "ACTIVE" | "ARCHIVED";
  color?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
};

type GroupUI = { id: string; name: string; season?: string | null };

export default function TeamDetailPage() {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const params = useParams();
  const pathname = usePathname();

  // ids resilientes
  const fromParams = useMemo(() => {
    const p = params as any;
    return (p?.teamId ?? p?.id ?? p?.TeamId ?? p?.teamid ?? p?.Id) as string | undefined;
  }, [params]);

  const fromPath = useMemo(() => {
    if (!pathname) return undefined;
    const i = pathname.indexOf("/teams/");
    if (i === -1) return undefined;
    const after = pathname.slice(i + "/teams/".length);
    const seg = after.split("/")[0];
    return seg && seg.length > 0 ? seg : undefined;
  }, [pathname]);

  const teamId = fromParams ?? fromPath;
  const leagueId = (params as any)?.leagueId ?? pathname?.split("/leagues/")[1]?.split("/")[0];
  const groupId = (params as any)?.groupId ?? pathname?.split("/groups/")[1]?.split("/")[0];

  const [league, setLeague] = useState<LeagueUI | null>(null);
  const [group, setGroup] = useState<GroupUI | null>(null);
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLeague, setLoadingLeague] = useState(true);
  const [loadingGroup, setLoadingGroup] = useState(true);

  // liga
  useEffect(() => {
    (async () => {
      if (!leagueId) return;
      try {
        setLoadingLeague(true);
        const lg = await getLeagueAction(String(leagueId));
        setLeague(
          lg
            ? {
                id: String(lg.id),
                name: String(lg.name ?? ""),
                season: String(lg.season ?? ""),
                status: (lg.status ?? "ACTIVE") as any,
                color: lg.color ?? null,
                slug: lg.slug ?? null,
                logoUrl: lg.logoUrl ?? null,
              }
            : null,
        );
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar la liga");
        setLeague(null);
      } finally {
        setLoadingLeague(false);
      }
    })();
  }, [leagueId]);

  // grupo
  useEffect(() => {
    (async () => {
      if (!leagueId || !groupId) return;
      try {
        setLoadingGroup(true);
        const g = await getGroupAction(String(leagueId), String(groupId));
        setGroup(
          g
            ? {
                id: String(g.id),
                name: String(g.name ?? ""),
                season: (g.season ?? null) as string | null,
              }
            : null,
        );
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar el grupo");
        setGroup(null);
      } finally {
        setLoadingGroup(false);
      }
    })();
  }, [leagueId, groupId]);

  // equipo (firma jerárquica y fallback)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        if (!teamId || typeof teamId !== "string" || !teamId.trim()) {
          toast.error("Identificador de equipo inválido.");
          return setTeam(null);
        }

        let data: any = null;
        if (leagueId && groupId) {
          try {
            // @ts-expect-error — por si tu getTeamAction tiene sobrecarga (l, g, t)
            data = await getTeamAction(String(leagueId), String(groupId), String(teamId));
          } catch {
            /* Intencionalmente vacío para permitir el fallback */
          }
        }
        if (!data) {
          try {
            data = await getTeamAction(String(teamId));
          } catch {
            /* Intencionalmente vacío, el 'if (!data)' lo manejará */
          }
        }

        if (!data) {
          toast.error("Equipo no encontrado (verifica leagueId / groupId / teamId y la firma de getTeamAction).");
          return setTeam(null);
        }
        setTeam(data);
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar equipo");
        setTeam(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId, groupId, teamId]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <div className="bg-muted size-16 animate-pulse rounded-md border" />
          <div className="space-y-2">
            <div className="bg-muted h-6 w-56 animate-pulse rounded" />
            <div className="bg-muted h-4 w-72 animate-pulse rounded" />
          </div>
        </div>
        <Separator />
        <div className="bg-muted h-4 w-64 animate-pulse rounded" />
        <div className="bg-muted h-4 w-64 animate-pulse rounded" />
        <div className="bg-muted h-4 w-64 animate-pulse rounded" />
      </div>
    );
  }

  if (!team) {
    return <div className="text-muted-foreground p-6 text-sm">No se encontró el equipo.</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-md border">
            {team.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logoUrl}
                alt={`${team.name} logo`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs opacity-50">Sin logo</div>
            )}
          </div>

          <div>
            <h1 className="text-xl font-semibold">{team.name}</h1>
            <p className="text-muted-foreground text-sm">
              <span className="font-medium">{league?.name ?? leagueId}</span> ({league?.season ?? "—"}) ·{" "}
              <span className="font-medium">{group?.name ?? groupId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Volver
          </Button>
          {canEdit && (
            <Button
              type="button"
              onClick={() => location.assign(`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/${teamId}/edit`)}
            >
              Editar
            </Button>
          )}
        </div>
      </div>

      {/* Color liga */}
      {league?.color ? (
        <div className="flex items-center gap-3 text-sm">
          <span
            className="inline-block size-5 rounded-md border"
            style={{ backgroundColor: league.color ?? undefined }}
            title={league.color ?? ""}
          />
          <span className="text-muted-foreground">Color de la liga:</span>
          <span className="font-mono">{league.color}</span>
        </div>
      ) : null}

      <Separator />

      {/* Datos */}
      <div className="grid gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Municipio:</span>{" "}
          <span className="font-medium">{team.municipality ?? "No especificado"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Estadio:</span>{" "}
          <span className="font-medium">{team.stadium ?? "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Sede:</span> <span className="font-medium">{team.venue ?? "—"}</span>
        </div>
        {team.slug ? (
          <div>
            <span className="text-muted-foreground">Slug:</span> <span className="font-mono">{team.slug}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
