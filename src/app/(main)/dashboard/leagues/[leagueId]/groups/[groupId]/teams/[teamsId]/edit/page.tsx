// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/teams/[teamId]/edit/page.tsx
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

// 👇 desde [teamId]/edit/page.tsx, _components está DOS niveles arriba
import { TeamForm } from "../../_components/team-form";

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

export default function EditTeamPage() {
  const { userDoc } = useCurrentUser();

  // loading state del user: undefined => cargando
  const userLoading = userDoc === undefined;
  const role = (userDoc?.role ?? (userLoading ? undefined : "DESCONOCIDO")) as string | undefined;
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
  const [loadingLeague, setLoadingLeague] = useState(true);
  const [group, setGroup] = useState<GroupUI | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [initial, setInitial] = useState<{
    id?: string;
    name?: string;
    groupId?: string;
    municipality?: string;
    stadium?: string;
    venue?: string;
    logoUrl?: string | null;
  } | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);

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
        setLoadingTeam(true);

        if (!teamId || typeof teamId !== "string" || !teamId.trim()) {
          toast.error("Identificador de equipo inválido.");
          return setInitial(null);
        }

        let data: any = null;
        if (leagueId && groupId) {
          try {
            // @ts-expect-error: getTeamAction también admite firma (leagueId, groupId, teamId)
            data = await getTeamAction(String(leagueId), String(groupId), String(teamId));
          } catch (e) {
            // En algunos proyectos esta firma no existe; silenciamos el error y caemos al fallback
            if (process.env.NODE_ENV !== "production") console.debug("getTeamAction(l,g,t) falló:", e);
          }
        }
        if (!data) {
          try {
            data = await getTeamAction(String(teamId));
          } catch (e) {
            // Fallback simple por teamId también puede no existir según la implementación
            if (process.env.NODE_ENV !== "production") console.debug("getTeamAction(t) falló:", e);
          }
        }

        if (!data) {
          toast.error("Equipo no encontrado (verifica leagueId / groupId / teamId y la firma de getTeamAction).");
          return setInitial(null);
        }

        setInitial({
          id: data.id,
          name: data.name,
          groupId: data.groupId,
          municipality: data.municipality ?? "",
          stadium: data.stadium ?? "",
          venue: data.venue ?? "",
          logoUrl: data.logoUrl ?? "",
        });
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar equipo");
        setInitial(null);
      } finally {
        setLoadingTeam(false);
      }
    })();
  }, [leagueId, groupId, teamId]);

  // permisos: no bloquees mientras carga el user
  if (userLoading) {
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

  if (!canEdit) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Permisos insuficientes</h1>
        <p className="text-muted-foreground text-sm">No tienes permisos para editar equipos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-md border">
            {initial?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={initial.logoUrl}
                alt={`${initial?.name ?? "Equipo"} logo`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs opacity-50">
                {loadingTeam ? "Cargando…" : "Sin logo"}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-xl leading-tight font-semibold">Editar equipo</h1>
            <p className="text-muted-foreground text-sm">
              Liga:{" "}
              <span className="font-medium">
                {league?.name ?? (loadingLeague ? "Cargando…" : String(leagueId ?? "(?)"))}
              </span>{" "}
              ({league?.season ?? ""}) · Grupo:{" "}
              <span className="font-medium">
                {loadingGroup ? "Cargando…" : (group?.name ?? String(groupId ?? "(?)"))}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Volver
          </Button>
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
          <span className="text-muted-foreground">Color:</span>
          <span className="font-mono">{league.color}</span>
        </div>
      ) : null}

      <Separator />

      {/* Form */}
      {loadingTeam ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : initial ? (
        <TeamForm initial={initial} />
      ) : (
        <p className="text-muted-foreground text-sm">No se encontró el equipo.</p>
      )}
    </div>
  );
}
