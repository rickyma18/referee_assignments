"use client";

// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/teams/tiers/_components/team-tiers-board.tsx

import * as React from "react";
import { useCallback, useMemo, useTransition } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TeamTierValues, type TeamTier } from "@/domain/teams/team-tier";
import { cn } from "@/lib/utils";
import { setTeamTierAction } from "@/server/actions/teams.actions";

type TeamForBoard = {
  id: string;
  name: string;
  logoUrl?: string | null;
  tier?: TeamTier | null;
};

type Props = {
  leagueId: string;
  groupId: string;
  teams: TeamForBoard[];
};

type ColumnConfig = {
  id: TeamTier;
  label: string;
  description: string;
  badgeClassName: string;
};

const COLUMNS: ColumnConfig[] = [
  {
    id: "TRANQUILO",
    label: "Tranquilos",
    description: "Partidos normalmente sin problema.",
    badgeClassName: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  {
    id: "REGULARES",
    label: "Regulares",
    description: "Comportamiento estándar de liga amateur.",
    badgeClassName: "bg-sky-100 text-sky-800 border-sky-200",
  },
  {
    id: "COMPLICADO",
    label: "Complicados",
    description: "Más protestones o ambiente tenso.",
    badgeClassName: "bg-amber-100 text-amber-800 border-amber-200",
  },
  {
    id: "MUY_COMPLICADO",
    label: "Muy complicados",
    description: "Alta conflictividad. Ideal llevar terna fuerte.",
    badgeClassName: "bg-red-100 text-red-800 border-red-200",
  },
];

export function TeamTiersBoard({ teams, leagueId, groupId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = React.useState<TeamForBoard[]>(() =>
    teams.map((t) => ({
      ...t,
      tier: t.tier ?? "REGULARES",
    })),
  );

  // ────────────────────────────────
  // Helpers de drag & drop
  // ────────────────────────────────

  const handleDragStart = useCallback((ev: React.DragEvent<HTMLDivElement>, teamId: string) => {
    ev.dataTransfer.setData("text/plain", teamId);
    // Opcional: limitar efecto
    ev.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOverColumn = useCallback((ev: React.DragEvent<HTMLDivElement>) => {
    // Necesario para permitir drop
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
  }, []);

  const moveTeamOptimistic = useCallback((teamId: string, newTier: TeamTier) => {
    setItems((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        return { ...t, tier: newTier };
      }),
    );
  }, []);

  const handleDropOnColumn = useCallback(
    (ev: React.DragEvent<HTMLDivElement>, columnTier: TeamTier) => {
      ev.preventDefault();
      const teamId = ev.dataTransfer.getData("text/plain");
      if (!teamId) return;

      // Si ya está en ese tier, no hacemos nada
      const team = items.find((t) => t.id === teamId);
      if (!team || team.tier === columnTier) return;

      // Optimista
      moveTeamOptimistic(teamId, columnTier);

      startTransition(async () => {
        const res = await setTeamTierAction({
          teamId,
          tier: columnTier, // 👈 aquí estaba el error, antes era targetTier
          leagueId,
          groupId,
        });

        if (!res.ok) {
          toast.error(res.message ?? "No se pudo actualizar el tier del equipo.");
          // revertir si falla
          setItems((prev) =>
            prev.map((t) => {
              if (t.id !== teamId) return t;
              return { ...t, tier: team.tier ?? "REGULARES" };
            }),
          );
          return;
        }
        toast.success(`Tier actualizado a "${formatTierLabel(columnTier)}"`);
      });
    },
    [items, moveTeamOptimistic, leagueId, groupId], // 👈 añade leagueId/groupId
  );

  // ────────────────────────────────
  // Derivados por columna
  // ────────────────────────────────

  const itemsByColumn = useMemo(() => {
    const map: Record<TeamTier, TeamForBoard[]> = {
      TRANQUILO: [],
      REGULARES: [],
      COMPLICADO: [],
      MUY_COMPLICADO: [],
    };

    for (const t of items) {
      const tier: TeamTier = (t.tier as TeamTier) || "REGULARES";
      if (TeamTierValues.includes(tier)) {
        map[tier].push(t);
      } else {
        map.REGULARES.push(t);
      }
    }

    // Orden alfabético dentro de cada columna
    (Object.keys(map) as TeamTier[]).forEach((tier) => {
      map[tier] = map[tier].slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    });

    return map;
  }, [items]);

  const totalTeams = items.length;

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground flex flex-col gap-2 text-sm">
        <div>
          Arrastra los equipos entre columnas para indicar qué tan{" "}
          <span className="text-foreground font-medium">complicados</span> son.
        </div>
        <div>
          El motor de <span className="text-foreground font-medium">sugerencia automática de ternas</span> usará estos
          tiers junto con MDS / RCS y las reglas internas.
        </div>
        <div className="text-xs">
          Total de equipos en el grupo: <span className="text-foreground font-semibold">{totalTeams}</span>
        </div>
      </div>

      <div className={cn("grid gap-3", "md:grid-cols-2 lg:grid-cols-4")}>
        {COLUMNS.map((col) => {
          const colItems = itemsByColumn[col.id] ?? [];
          return (
            <Card
              key={col.id}
              className={cn(
                "flex h-[420px] flex-col overflow-hidden border-dashed transition-colors",
                "bg-muted/40",
                isPending && "opacity-90",
              )}
            >
              <CardHeader className="space-y-1 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">{col.label}</CardTitle>
                  <Badge
                    variant="outline"
                    className={cn("border px-1.5 py-0.5 text-[10px] font-medium", col.badgeClassName)}
                  >
                    {colItems.length}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">{col.description}</p>
              </CardHeader>

              <CardContent className="flex-1 overflow-hidden">
                <div
                  className={cn(
                    "flex h-full flex-col gap-1.5 rounded-md border border-dashed border-transparent p-1.5",
                    "bg-background/60",
                    // área de drop
                    "transition-colors",
                  )}
                  onDragOver={handleDragOverColumn}
                  onDrop={(ev) => handleDropOnColumn(ev, col.id)}
                >
                  {colItems.length === 0 ? (
                    <div className="text-muted-foreground flex h-full items-center justify-center text-center text-xs">
                      Arrastra equipos aquí
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
                      {colItems.map((team) => (
                        <div
                          key={team.id}
                          draggable
                          onDragStart={(ev) => handleDragStart(ev, team.id)}
                          className={cn(
                            "bg-card flex cursor-move items-center gap-2 rounded-md border px-2 py-1.5 text-xs shadow-sm",
                            "hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          {team.logoUrl ? (
                            // si ya tienes <Avatar> podrías usarlo aquí; dejo un fallback simple
                            <div className="bg-muted h-6 w-6 flex-shrink-0 overflow-hidden rounded-full border">
                              <img src={team.logoUrl} alt={team.name} className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="bg-muted flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                              {team.name
                                .split(" ")
                                .slice(0, 2)
                                .map((p) => p.charAt(0).toUpperCase())
                                .join("")}
                            </div>
                          )}

                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="truncate text-[11px] font-medium">{team.name}</div>
                            {team.logoUrl && (
                              <div className="text-muted-foreground text-[10px]">ID: {team.id.slice(0, 6)}…</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isPending && (
        <div className="text-muted-foreground text-xs">
          Guardando cambios de tier… (puede tardar un momento en reflejarse en otras vistas)
        </div>
      )}
    </div>
  );
}

function formatTierLabel(tier: TeamTier): string {
  switch (tier) {
    case "TRANQUILO":
      return "Tranquilo";
    case "REGULARES":
      return "REGULARES";
    case "COMPLICADO":
      return "Complicado";
    case "MUY_COMPLICADO":
      return "Muy complicado";
    default:
      return tier;
  }
}
