"use client";

import * as React from "react";

import Link from "next/link";

import { ChevronRight } from "lucide-react";

import { listGroupsByLeagueAction } from "@/server/actions/groups.actions";
import { listLeaguesAction } from "@/server/actions/leagues.actions";

type LeagueMini = { id: string; name: string; season: string; logoUrl?: string | null };
type GroupMini = { id: string; name: string; leagueId: string };

type Row = { league: LeagueMini; groups: GroupMini[] };

export function DynamicTeamsChildren() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const leaguesRaw = (await listLeaguesAction({})) as any[];
        const leagues: LeagueMini[] = (leaguesRaw ?? []).map((x) => ({
          id: String(x.id),
          name: String(x.name),
          season: String(x.season ?? ""),
          logoUrl: x.logoUrl ?? null,
        }));

        // Carga grupos por liga en paralelo
        const rows: Row[] = await Promise.all(
          leagues.map(async (lg) => {
            const groups = (await listGroupsByLeagueAction(lg.id)) as GroupMini[];
            return { league: lg, groups };
          }),
        );

        setRows(rows);
      } catch (e) {
        setError("No se pudieron cargar ligas y grupos");
      }
    })();
  }, []);

  if (error) return <div className="text-destructive px-2 py-1.5 text-xs">{error}</div>;
  if (!rows) return <div className="text-muted-foreground px-2 py-1.5 text-xs">Cargando ligas…</div>;
  if (rows.length === 0) return <div className="text-muted-foreground px-2 py-1.5 text-xs">Aún no hay ligas.</div>;

  return (
    <ul className="mt-1 space-y-1">
      {rows.map(({ league, groups }) => (
        <li key={league.id}>
          {/* Liga (fila) */}
          <details className="group">
            <summary className="hover:bg-muted flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm">
              <span className="truncate">
                {league.name} <span className="text-muted-foreground">({league.season})</span>
              </span>
              <ChevronRight className="h-4 w-4 opacity-60 transition-transform group-open:rotate-90" />
            </summary>

            {/* Grupos de esa liga */}
            <ul className="mt-1 space-y-1 pl-3">
              {groups.length === 0 ? (
                <li className="text-muted-foreground px-2 py-1.5 text-xs">Sin grupos</li>
              ) : (
                groups.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/dashboard/leagues/${g.leagueId}/groups/${g.id}/teams`}
                      className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                    >
                      <span className="truncate">{g.name}</span>
                      <ChevronRight className="h-4 w-4 opacity-60" />
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
