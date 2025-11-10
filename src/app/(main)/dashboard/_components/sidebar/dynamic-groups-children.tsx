// =====================================
// src/navigation/sidebar/dynamic-groups-children.tsx
// =====================================
"use client";

import * as React from "react";

import Link from "next/link";

import { ChevronRight } from "lucide-react";

import { listLeaguesAction } from "@/server/actions/leagues.actions";

type LeagueMini = { id: string; name: string; season: string; logoUrl?: string | null };

export function DynamicGroupsChildren() {
  const [leagues, setLeagues] = React.useState<LeagueMini[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const data = (await listLeaguesAction({})) as any[];
        const mapped = (data ?? []).map((x) => ({
          id: String(x.id),
          name: String(x.name),
          season: String(x.season ?? ""),
          logoUrl: x.logoUrl ?? null,
        }));
        setLeagues(mapped);
      } catch {
        setError("No se pudieron cargar las ligas");
      }
    })();
  }, []);

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
      {leagues.map((lg) => (
        <li key={lg.id}>
          <Link
            href={`/dashboard/leagues/${lg.id}/`}
            className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
          >
            <span className="truncate">
              {lg.name} <span className="text-muted-foreground">({lg.season})</span>
            </span>
            <ChevronRight className="h-4 w-4 opacity-60" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
