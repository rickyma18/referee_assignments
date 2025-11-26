"use client";

// src/app/(main)/dashboard/teams/tiers/_components/team-tiers-board.tsx

import * as React from "react";
import { useCallback, useMemo, useTransition, useEffect, useState } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { TeamTierValues, type TeamTier } from "@/domain/teams/team-tier";
import { cn } from "@/lib/utils";
import { setTeamTierAction, listTeamsByGroupAction } from "@/server/actions/teams.actions";

import type { TeamForBoard } from "../page";

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

type Props = {
  leagues: LeagueDoc[];
  groups: GroupDoc[];
  initialLeagueId?: string;
  initialGroupId?: string;
  initialTeams: TeamForBoard[];
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

export function TeamTiersBoard({ leagues, groups, initialLeagueId, initialGroupId, initialTeams }: Props) {
  const [isPending, startTransition] = useTransition();

  const [selectedLeagueId, setSelectedLeagueId] = useState<string | undefined>(initialLeagueId);
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(initialGroupId);

  const [items, setItems] = useState<TeamForBoard[]>(() =>
    initialTeams.map((t) => ({
      ...t,
      tier: t.tier ?? "REGULARES",
    })),
  );

  // ────────────────────────────────
  // Derivados de ligas / grupos
  // ────────────────────────────────

  const leagueOptions = useMemo(() => {
    return leagues;
  }, [leagues]);

  const groupsByLeague = useMemo(() => {
    const map = new Map<string, GroupDoc[]>();
    for (const g of groups) {
      const list = map.get(g.leagueId) ?? [];
      list.push(g);
      map.set(g.leagueId, list);
    }
    return map;
  }, [groups]);

  const groupOptions = useMemo(() => {
    if (!selectedLeagueId) return [];
    return groupsByLeague.get(selectedLeagueId) ?? [];
  }, [selectedLeagueId, groupsByLeague]);

  // ────────────────────────────────
  // Carga de equipos al cambiar grupo
  // ────────────────────────────────

  const loadTeamsForGroup = useCallback((groupId: string | undefined) => {
    if (!groupId) {
      setItems([]);
      return;
    }

    startTransition(async () => {
      try {
        const res = await listTeamsByGroupAction({ groupId, pageSize: 100 });
        const itemsRaw = (res.items ?? []) as any[];

        const next: TeamForBoard[] = itemsRaw.map((t) => ({
          id: t.id,
          name: t.name,
          logoUrl: t.logoUrl ?? null,
          tier: t.tier ?? null,
        }));

        setItems(
          next.map((t) => ({
            ...t,
            tier: t.tier ?? "REGULARES",
          })),
        );
      } catch (err: any) {
        console.error(err);
        toast.error("No se pudieron cargar los equipos de este grupo.");
      }
    });
  }, []);

  // Primera carga (por initialGroupId)
  useEffect(() => {
    // Si ya venían equipos iniciales, no hacemos nada extra.
    // Pero si no venían y hay groupId, los cargamos.
    if (!initialTeams.length && initialGroupId) {
      loadTeamsForGroup(initialGroupId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando cambia el league seleccionado: resetear grupo y equipos
  const handleLeagueChange = useCallback(
    (leagueId: string) => {
      setSelectedLeagueId(leagueId);

      const groupsForLeague = groupsByLeague.get(leagueId) ?? [];
      const firstGroupId = groupsForLeague[0]?.id;

      setSelectedGroupId(firstGroupId);
      loadTeamsForGroup(firstGroupId);
    },
    [groupsByLeague, loadTeamsForGroup],
  );

  // Cuando cambia el group seleccionado
  const handleGroupChange = useCallback(
    (groupId: string) => {
      setSelectedGroupId(groupId);
      loadTeamsForGroup(groupId);
    },
    [loadTeamsForGroup],
  );

  // ────────────────────────────────
  // Helpers de drag & drop
  // ────────────────────────────────

  const handleDragStart = useCallback((ev: React.DragEvent<HTMLDivElement>, teamId: string) => {
    ev.dataTransfer.setData("text/plain", teamId);
    ev.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOverColumn = useCallback((ev: React.DragEvent<HTMLDivElement>) => {
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

      // si no hay liga o grupo seleccionado, no podemos guardar nada
      if (!selectedLeagueId || !selectedGroupId) {
        toast.error("Selecciona una liga y un grupo antes de mover equipos.");
        return;
      }

      const team = items.find((t) => t.id === teamId);
      if (!team || team.tier === columnTier) return;

      // Optimista
      moveTeamOptimistic(teamId, columnTier);

      startTransition(async () => {
        const res = await setTeamTierAction({
          teamId,
          tier: columnTier,
          leagueId: selectedLeagueId,
          groupId: selectedGroupId,
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
    [items, moveTeamOptimistic, selectedLeagueId, selectedGroupId],
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

    (Object.keys(map) as TeamTier[]).forEach((tier) => {
      map[tier] = map[tier].slice().sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    });

    return map;
  }, [items]);

  const totalTeams = items.length;

  return (
    <div className="space-y-4">
      {/* Filtros de Liga / Grupo */}
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 md:px-4">
        <Select value={selectedLeagueId ?? ""} onValueChange={handleLeagueChange}>
          <SelectTrigger className="w-full max-w-xs md:w-60">
            <SelectValue placeholder="Selecciona liga" />
          </SelectTrigger>
          <SelectContent>
            {leagueOptions.map((lg) => (
              <SelectItem key={lg.id} value={lg.id}>
                {lg.season ? `${lg.name} · ${lg.season}` : lg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedGroupId ?? ""}
          onValueChange={handleGroupChange}
          disabled={!selectedLeagueId || groupOptions.length === 0}
        >
          <SelectTrigger className="w-full max-w-xs md:w-52">
            <SelectValue placeholder="Selecciona grupo" />
          </SelectTrigger>
          <SelectContent>
            {groupOptions.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!selectedGroupId) return;
            loadTeamsForGroup(selectedGroupId);
          }}
        >
          Recargar equipos
        </Button>
      </div>

      {/* Texto descriptivo */}
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

      {/* Columnas de tiers */}
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
                            <div className="bg-muted h-6 w-6 flex-shrink-0 overflow-hidden rounded-full border">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
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
      return "Regulares";
    case "COMPLICADO":
      return "Complicado";
    case "MUY_COMPLICADO":
      return "Muy complicado";
    default:
      return tier;
  }
}
