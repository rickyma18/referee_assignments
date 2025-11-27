// =============================
// src/app/(main)/dashboard/leagues/[leagueId]/groups/new/page.tsx
// =============================
"use client";

import * as React from "react";

import { useParams } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Permisos insuficientes</h1>
        <p className="text-muted-foreground text-sm">No tienes permisos para crear grupos.</p>
      </div>
    );
  }

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

          <div>
            <h1 className="text-xl leading-tight font-semibold">Nuevo grupo</h1>
            <p className="text-muted-foreground text-sm">
              <span className="font-medium">{league?.name ?? String(leagueId ?? "(?)")}</span>{" "}
              {league?.season ? <span>({league.season})</span> : null}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Volver
          </Button>
        </div>
      </div>

      {/* Color de la liga si existe */}
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

      {/* Formulario */}
      <GroupForm leagueId={String(leagueId)} />
    </div>
  );
}
