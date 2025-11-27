// =============================
// src/app/(main)/dashboard/leagues/[leagueId]/groups/new/page.tsx
// =============================
"use client";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getLeagueAction } from "@/server/actions/leagues.actions";

import { GroupForm } from "../_components/group-form";

type LeagueUI = {
  id: string;
  name: string;
  season: string;
  status?: "ACTIVE" | "ARCHIVED";
  color?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
};

export default function NewGroupPage() {
  const router = useRouter();
  const { leagueId } = useParams<{ leagueId: string }>();
  const { userDoc, loading } = useCurrentUser();

  const [league, setLeague] = React.useState<LeagueUI | null>(null);
  const [loadingLeague, setLoadingLeague] = React.useState(true);

  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  // Carga liga
  React.useEffect(() => {
    (async () => {
      try {
        setLoadingLeague(true);
        const lg = await getLeagueAction(String(leagueId));
        if (!lg) {
          setLeague(null);
          return;
        }
        setLeague({
          id: String(lg.id),
          name: String(lg.name ?? ""),
          season: String(lg.season ?? ""),
          status: (lg.status ?? "ACTIVE") as any,
          color: lg.color ?? null,
          slug: lg.slug ?? null,
          logoUrl: lg.logoUrl ?? null,
        });
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar la liga");
        setLeague(null);
      } finally {
        setLoadingLeague(false);
      }
    })();
  }, [leagueId]);

  // ⬇️ A partir de aquí, ya NO hay hooks, sólo returns condicionales

  // 1) Verificando usuario / permisos
  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/FMF_Logo.png" alt="FMF Logo" className="h-20 w-20 animate-pulse object-contain opacity-90" />
        <div className="border-muted-foreground size-10 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Verificando permisos…</p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Permisos insuficientes</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          No tienes permisos para crear grupos en esta liga. Si crees que se trata de un error, contacta al
          administrador.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  // 2) Skeleton mientras la liga carga
  if (loadingLeague && !league) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0 rounded-md border" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
        <Separator />
        <div className="space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  // 3) Liga no encontrada
  if (!league && !loadingLeague) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Liga no encontrada</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          No pudimos cargar la información de la liga asociada a este grupo.
          <br />
          Verifica la URL o regresa al listado de ligas.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  const leagueStatus = league?.status ?? "ACTIVE";

  // 4) Vista normal
  return (
    <div className="space-y-6 p-6">
      {/* Header con logo de la LIGA */}
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

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px] tracking-wide uppercase">
                Nuevo grupo
              </Badge>

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

            <h1 className="text-xl leading-tight font-semibold">Crear grupo en {league?.name}</h1>
            <p className="text-muted-foreground text-sm">
              Temporada {league?.season ?? "—"} · ID liga:{" "}
              <span className="font-mono text-xs">{league?.id ?? String(leagueId ?? "(?)")}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Volver
          </Button>
        </div>
      </div>

      {/* Franja de color de la liga si existe */}
      {league?.color ? (
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span
            className="inline-block h-1 w-24 rounded-full"
            style={{ backgroundColor: league.color ?? undefined }}
            title={league.color ?? ""}
          />
          <span>Color de la liga:</span>
          <span className="font-mono text-[11px]">{league.color}</span>
        </div>
      ) : null}

      <Separator />

      {/* Copy corta antes del formulario */}
      <div className="text-muted-foreground text-xs">
        Define el nombre y la temporada del grupo. Suele usarse un número o letra (por ejemplo: &quot;Grupo 1&quot;,
        &quot;Grupo A&quot; o &quot;Occidente&quot;).
      </div>

      {/* Formulario */}
      <GroupForm leagueId={String(leagueId)} />
    </div>
  );
}
