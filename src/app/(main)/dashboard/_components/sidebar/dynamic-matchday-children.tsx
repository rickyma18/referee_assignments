// =====================================
// src/navigation/sidebar/dynamic-matchdays-children.tsx
// =====================================
"use client";

import * as React from "react";

import Link from "next/link";

import { ChevronRight, CalendarDays } from "lucide-react";

import { listGroupsAction } from "@/server/actions/groups.actions";
import { listLeaguesAction } from "@/server/actions/leagues.actions";

type LeagueMini = { id: string; name: string; season: string; logoUrl?: string | null };
type GroupMini = { id: string; name: string; season?: string };

export function DynamicMatchdaysChildren() {
  const [leagues, setLeagues] = React.useState<LeagueMini[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // liga expandida
  const [expanded, setExpanded] = React.useState<string | null>(null);
  // cache de grupos por liga
  const [groupsMap, setGroupsMap] = React.useState<Record<string, GroupMini[] | null>>({});
  const [groupsError, setGroupsError] = React.useState<Record<string, string | null>>({});
  const [groupsLoading, setGroupsLoading] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    (async () => {
      try {
        const data = (await listLeaguesAction({})) as any[];
        const mapped = (data ?? []).map((x) => ({
          id: String(x.id),
          name: String(x.name),
          season: String(x.season ?? ""),
          logoUrl: x.logoUrl ?? null,
        })) as LeagueMini[];
        setLeagues(mapped);
      } catch {
        setError("No se pudieron cargar las ligas");
      }
    })();
  }, []);

  const toggleLeague = async (leagueId: string) => {
    // colapsar si ya está abierta
    if (expanded === leagueId) {
      setExpanded(null);
      return;
    }
    setExpanded(leagueId);

    // si no hay cache, cargar grupos
    if (!(leagueId in groupsMap)) {
      try {
        setGroupsLoading((s) => ({ ...s, [leagueId]: true }));
        const data = (await listGroupsAction({ leagueId })) as any[];
        const mapped = (data ?? []).map((g) => ({
          id: String(g.id),
          name: String(g.name),
          season: String(g.season ?? ""),
        })) as GroupMini[];
        setGroupsMap((m) => ({ ...m, [leagueId]: mapped }));
        setGroupsError((e) => ({ ...e, [leagueId]: null }));
      } catch {
        setGroupsMap((m) => ({ ...m, [leagueId]: [] }));
        setGroupsError((e) => ({ ...e, [leagueId]: "No se pudieron cargar los grupos" }));
      } finally {
        setGroupsLoading((s) => ({ ...s, [leagueId]: false }));
      }
    }
  };

  if (error) {
    return <div className="text-destructive px-2 py-1.5 text-xs">{error}</div>;
  }
  if (!leagues) {
    return <div className="text-muted-foreground px-2 py-1.5 text-xs">Cargando ligas…</div>;
  }
  if (leagues.length === 0) {
    return <div className="text-muted-foreground px-2 py-1.5 text-xs">Aún no hay ligas.</div>;
  }

  return (
    <ul className="mt-1 space-y-1">
      {leagues.map((lg) => {
        const isOpen = expanded === lg.id;
        const loading = !!groupsLoading[lg.id];
        const gError = groupsError[lg.id];
        const groups = groupsMap[lg.id];

        return (
          <li key={lg.id}>
            <button
              type="button"
              onClick={() => toggleLeague(lg.id)}
              className="hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm"
            >
              <span className="truncate">
                {lg.name} <span className="text-muted-foreground">({lg.season})</span>
              </span>
              <ChevronRight className={`h-4 w-4 opacity-60 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>

            {isOpen && (
              <div className="border-muted-foreground/20 mt-1 ml-3 border-l pl-2">
                {loading && <div className="text-muted-foreground px-2 py-1 text-xs">Cargando grupos…</div>}
                {gError && <div className="text-destructive px-2 py-1 text-xs">{gError}</div>}
                {!loading && !gError && groups && groups.length === 0 && (
                  <div className="text-muted-foreground px-2 py-1 text-xs">Aún no hay grupos.</div>
                )}
                {!loading && !gError && groups && groups.length > 0 && (
                  <ul className="space-y-1">
                    {groups.map((gp) => (
                      <li key={gp.id}>
                        <Link
                          href={`/dashboard/leagues/${lg.id}/groups/${gp.id}/matchdays`}
                          className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                        >
                          <CalendarDays className="h-4 w-4 opacity-70" />
                          <span className="truncate">
                            {gp.name} {gp.season ? <span className="text-muted-foreground">({gp.season})</span> : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
