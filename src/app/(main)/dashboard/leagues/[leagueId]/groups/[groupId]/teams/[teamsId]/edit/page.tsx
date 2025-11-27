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
  const { userDoc, loading: loadingUser } = useCurrentUser();

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

  // 🔹 Atajo Ctrl+S / Cmd+S para guardar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+S o Cmd+S
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();

        // Disparamos evento global para que lo escuche el TeamForm
        window.dispatchEvent(new CustomEvent("team-form-save"));

        // (Opcional) pequeño aviso
        toast.info("Guardando equipo…");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // liga
  useEffect(() => {
    (async () => {
      if (!leagueId) {
        setLeague(null);
        setLoadingLeague(false);
        return;
      }
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
      if (!leagueId || !groupId) {
        setGroup(null);
        setLoadingGroup(false);
        return;
      }
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

  // 🔄 Loader global mientras:
  // - no tenemos usuario/rol
  // - o seguimos cargando liga / grupo / equipo
  if (loadingUser || loadingLeague || loadingGroup || loadingTeam) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/FMF_Logo.png" alt="FMF Logo" className="h-20 w-20 animate-pulse object-contain opacity-90" />
        <div className="border-muted-foreground size-10 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Verificando permisos…</p>
      </div>
    );
  }

  // Ya con user cargado, ahora sí calculamos rol/permisos
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  // 🔒 Gate de permisos
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
              <div className="flex h-full w-full items-center justify-center text-xs opacity-50">{"Sin logo"}</div>
            )}
          </div>

          <div>
            <h1 className="text-xl leading-tight font-semibold">Editar equipo</h1>
            <p className="text-muted-foreground text-sm">
              <span className="font-medium">{league?.name ?? String(leagueId ?? "(?)")}</span>{" "}
              {league?.season ? `(${league.season})` : ""} ·{" "}
              <span className="font-medium">{group?.name ?? String(groupId ?? "(?)")}</span>
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
      {initial ? (
        <TeamForm initial={initial} />
      ) : (
        <p className="text-muted-foreground text-sm">No se encontró el equipo.</p>
      )}
    </div>
  );
}
