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

import { TeamForm } from "../_components/team-form";

type LeagueUI = {
  id: string;
  name: string;
  season: string;
  status?: "ACTIVE" | "ARCHIVED";
  color?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
};

type GroupUI = {
  id: string;
  name: string;
  season?: string | null;
};

export default function EditTeamPage() {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const params = useParams();
  const pathname = usePathname();

  // ---- Params robustos (como en tu versión previa)
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

  // ---- Estados UI (igual que en crear)
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

  // ---- Carga liga (mismo patrón que en “Nuevo equipo”)
  useEffect(() => {
    (async () => {
      if (!leagueId) return;
      try {
        setLoadingLeague(true);
        const lg = await getLeagueAction(String(leagueId));
        if (!lg) {
          setLeague(null);
        } else {
          setLeague({
            id: String(lg.id),
            name: String(lg.name ?? ""),
            season: String(lg.season ?? ""),
            status: (lg.status ?? "ACTIVE") as any,
            color: lg.color ?? null,
            slug: lg.slug ?? null,
            logoUrl: lg.logoUrl ?? null,
          });
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar la liga");
        setLeague(null);
      } finally {
        setLoadingLeague(false);
      }
    })();
  }, [leagueId]);

  // ---- Carga grupo (leagueId + groupId)
  useEffect(() => {
    (async () => {
      if (!leagueId || !groupId) return;
      try {
        setLoadingGroup(true);
        const g = await getGroupAction(String(leagueId), String(groupId));
        if (!g) {
          setGroup(null);
        } else {
          setGroup({
            id: String(g.id),
            name: String(g.name ?? ""),
            season: (g.season ?? null) as string | null,
          });
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar el grupo");
        setGroup(null);
      } finally {
        setLoadingGroup(false);
      }
    })();
  }, [leagueId, groupId]);

  // ---- Carga equipo (initial para el form)
  useEffect(() => {
    (async () => {
      try {
        setLoadingTeam(true);

        if (!teamId || typeof teamId !== "string" || !teamId.trim()) {
          toast.error("Identificador de equipo inválido.");
          setInitial(null);
          return;
        }

        const data = await getTeamAction(teamId);
        if (!data) {
          toast.error("Equipo no encontrado");
          setInitial(null);
          return;
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
  }, [teamId]);

  if (!canEdit) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Permisos insuficientes</h1>
        <p className="text-muted-foreground text-sm">No tienes permisos para editar equipos.</p>
      </div>
    );
  }

  // Header con mismo diseño que “Nuevo equipo”
  return (
    <div className="space-y-6 p-6">
      {/* Header compacto con logo de liga */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-md border">
            {league?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={league.logoUrl}
                alt={`${league.name} logo`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs opacity-50">
                {loadingLeague ? "Cargando…" : "Sin logo"}
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

      {/* Color de la liga (si existe) */}
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

      {/* Formulario (igual que en crear, pero con initial) */}
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
