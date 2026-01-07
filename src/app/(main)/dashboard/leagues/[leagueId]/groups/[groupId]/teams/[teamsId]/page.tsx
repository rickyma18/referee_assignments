// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/teams/[teamId]/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";

import { useParams, usePathname, useRouter } from "next/navigation";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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

type TierVariant = "COMPLICADO" | "FACIL" | "NEUTRO" | string;

/** Convierte Firestore Timestamp/Date/string a Date usable en cliente */
function toDateClientSafe(input: unknown): Date | null {
  if (!input) return null;

  // Firestore Timestamp (admin / client)
  if (typeof input === "object" && input !== null && "toDate" in input && typeof (input as any).toDate === "function") {
    const d = (input as any).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }

  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }

  try {
    const d = new Date(input as any);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatDateTime(input: unknown): string {
  const d = toDateClientSafe(input);
  if (!d) return "—";
  return d.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function tierLabel(tier?: TierVariant | null): string {
  if (!tier) return "Sin tier";
  return String(tier).toUpperCase();
}

function tierClasses(tier?: TierVariant | null): string {
  const value = String(tier ?? "").toUpperCase();

  if (value === "COMPLICADO") {
    return "border-amber-500/60 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  }
  if (value === "FACIL" || value === "FÁCIL") {
    return "border-emerald-500/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (value === "NEUTRO") {
    return "border-slate-500/50 bg-slate-50 text-slate-800 dark:bg-slate-950/40 dark:text-slate-200";
  }

  if (!value) {
    return "border-slate-500/40 bg-slate-50 text-slate-800 dark:bg-slate-950/40 dark:text-slate-200";
  }

  // fallback genérico
  return "border-sky-500/50 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200";
}

export default function TeamDetailPage() {
  const router = useRouter();

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

  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingLeague, setLoadingLeague] = useState(true);
  const [loadingGroup, setLoadingGroup] = useState(true);

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
          setTeam(null);
          return;
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
          setTeam(null);
          return;
        }
        setTeam(data);
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar equipo");
        setTeam(null);
      } finally {
        setLoadingTeam(false);
      }
    })();
  }, [leagueId, groupId, teamId]);

  const loading = loadingTeam || loadingLeague || loadingGroup;

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-md border" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <Separator />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-muted-foreground space-y-4 p-6 text-sm">
        <p>No se encontró el equipo.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const tier = team.tier as TierVariant | undefined;
  const createdAt = team.createdAt;
  const updatedAt = team.updatedAt;

  const leagueStatus = league?.status ?? "ACTIVE";

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

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px] tracking-wide uppercase">
                Equipo
              </Badge>

              {tier && (
                <Badge variant="outline" className={`text-[11px] font-medium ${tierClasses(tier)}`}>
                  Tier: {tierLabel(tier)}
                </Badge>
              )}

              {leagueStatus && (
                <Badge
                  variant="outline"
                  className={[
                    "text-[11px] font-medium",
                    leagueStatus === "ACTIVE" &&
                      "border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                    leagueStatus === "ARCHIVED" &&
                      "border-slate-500/60 bg-slate-50 text-slate-700 dark:bg-slate-950/40 dark:text-slate-200",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {leagueStatus === "ACTIVE" ? "Liga activa" : "Liga archivada"}
                </Badge>
              )}
            </div>

            <h1 className="text-xl font-semibold">{team.name ?? "Equipo sin nombre"}</h1>

            <p className="text-muted-foreground text-sm">
              <span className="font-medium">{league?.name ?? leagueId ?? "Liga"}</span>
              {league?.season ? ` · ${league.season}` : ""} ·{" "}
              <span className="font-medium">{group?.name ?? groupId ?? "Grupo"}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Volver
          </Button>
          {canEdit && (
            <Button
              type="button"
              onClick={() => router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/${teamId}/edit`)}
            >
              Editar
            </Button>
          )}
        </div>
      </div>

      {/* Franja de color de la liga (si existe) */}
      {league?.color && (
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="inline-block h-1 w-24 rounded-full" style={{ backgroundColor: league.color ?? undefined }} />
          <span>Color de la liga:</span>
          <span className="font-mono text-[11px]">{league.color}</span>
        </div>
      )}

      <Separator />

      {/* Datos principales */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Información del equipo */}
        <div className="bg-card rounded-lg border p-4 text-sm">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
            Información del equipo
          </h2>
          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground">Municipio:</span>{" "}
              <span className="font-medium">{team.municipality ?? "No especificado"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Estadio:</span>{" "}
              <span className="font-medium">{team.stadium ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Dirección:</span>{" "}
              <span className="font-medium">
                {team.venue && String(team.venue).trim().length > 0 ? team.venue : "No especificada"}
              </span>
            </div>

            {team.slug && (
              <div>
                <span className="text-muted-foreground">Slug:</span>{" "}
                <span className="font-mono text-xs">{team.slug}</span>
              </div>
            )}
          </div>
        </div>

        {/* Traslado a Unidad López Mateos */}
        <div className="bg-card rounded-lg border p-4 text-sm">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
            Traslado a Unidad López Mateos
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <span className="text-muted-foreground">Distancia (km):</span>
            </div>
            <div className="font-medium">{team.travelKmToLopezMateos ?? "—"}</div>

            <div>
              <span className="text-muted-foreground">En carro (min):</span>
            </div>
            <div className="font-medium">{team.travelCarMaxMinToLopezMateos ?? "—"}</div>

            <div>
              <span className="text-muted-foreground">En transporte público (min):</span>
            </div>
            <div className="font-medium">{team.travelPublicMaxMinToLopezMateos ?? "—"}</div>
          </div>

          {/* Trazabilidad de travel */}
          <div className="text-muted-foreground mt-4 space-y-1 border-t pt-3 text-xs">
            <div>
              <span>Actualizado:</span> <span className="font-medium">{formatDateTime(team.travelUpdatedAt)}</span>
            </div>
            <div>
              <span>Fuente:</span> <span className="font-medium">{team.travelSource ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
