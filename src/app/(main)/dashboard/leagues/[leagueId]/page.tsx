// src/app/(main)/dashboard/leagues/[leagueId]/page.tsx
"use client";

import * as React from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/hooks/use-current-user";
import { listGroupsAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";

// ---- Tipos UI (lo que muestra el cliente)
type LeagueUI = {
  id: string;
  name: string;
  season: string;
  status?: "ACTIVE" | "ARCHIVED";
  color?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
  createdAt?: string; // ISO en UI
  updatedAt?: string; // ISO en UI
};

type GroupRow = {
  id: string;
  name: string;
  season: string;
};

// Normaliza cualquier cosa (Date|string|Timestamp-like) a ISO string o undefined
function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value; // ya viene serializado

  // Date
  if (value instanceof Date) return value.toISOString();

  // Timestamp-like con toDate()
  if (typeof (value as any)?.toDate === "function") {
    try {
      return (value as any).toDate().toISOString();
    } catch (err) {
      // no-op: si falla la conversión, seguimos con las otras heurísticas
      console.error("toIso(): fallo toDate()", err);
    }
  }

  // Raw {seconds/_seconds, nanoseconds/_nanoseconds}
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, any>;
    const s = obj["seconds"] ?? obj["_seconds"]; // ✅ bracket notation para evitar no-underscore-dangle
    const n = obj["nanoseconds"] ?? obj["_nanoseconds"] ?? 0; // ✅ bracket notation

    if (typeof s === "number") {
      const nanos = typeof n === "number" ? n : 0;
      const ms = s * 1000 + Math.floor(nanos / 1e6);
      return new Date(ms).toISOString();
    }
  }

  return undefined;
}

function toLeagueUI(x: any): LeagueUI {
  if (!x) return x;
  return {
    id: String(x.id),
    name: String(x.name),
    season: String(x.season),
    status: x.status ?? "ACTIVE",
    color: x.color ?? null,
    slug: x.slug ?? null,
    logoUrl: x.logoUrl ?? x.logoURL ?? null,
    createdAt: toIso(x.createdAt),
    updatedAt: toIso(x.updatedAt),
  };
}

export default function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [league, setLeague] = React.useState<LeagueUI | null>(null);
  const [groups, setGroups] = React.useState<GroupRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const [lg, grs] = await Promise.all([
        getLeagueAction(String(leagueId)),
        listGroupsAction({ leagueId: String(leagueId) }),
      ]);
      setLeague(lg ? toLeagueUI(lg) : null);
      setGroups((grs ?? []) as GroupRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al cargar la liga");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (leagueId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  if (loading) return <div className="p-6">Cargando...</div>;
  if (!league) return <div className="p-6">Liga no encontrada</div>;

  const status = league.status ?? "ACTIVE";

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header de liga */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="bg-muted size-16 shrink-0 overflow-hidden rounded-md border">
            {league.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={league.logoUrl}
                alt={`${league.name} logo`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm opacity-50">Sin logo</div>
            )}
          </div>

          {/* Info básica */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl leading-tight font-bold">{league.name}</h1>
              <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>{status}</Badge>
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              Temporada: <span className="font-medium">{league.season}</span>
              {league.slug ? (
                <>
                  {" · "}Slug: <span className="font-mono">{league.slug}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Acciones liga */}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/leagues">Volver a ligas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/leagues/${league.id}/groups`}>Ver grupos</Link>
          </Button>
          {canEdit && (
            <>
              <Button asChild>
                <Link href={`/dashboard/leagues/${league.id}/groups/new`}>Nuevo grupo</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/dashboard/leagues/${league.id}/edit`}>Editar liga</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Color de la liga (si existe) */}
      {league.color ? (
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

      {/* Lista de grupos de la liga */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Grupos ({groups.length})</h2>
        {canEdit && (
          <Button asChild>
            <Link href={`/dashboard/leagues/${league.id}/groups/new`}>Crear grupo</Link>
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Nombre</th>
              <th className="p-3">Temporada</th>
              {canEdit && <th className="w-52 p-3 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="p-3">
                  <Link
                    href={`/dashboard/leagues/${leagueId}/groups/${g.id}/teams`}
                    className="text-blue-200 hover:underline"
                  >
                    {g.name}
                  </Link>
                </td>
                <td className="p-3">{g.season}</td>
                {canEdit && (
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/dashboard/leagues/${league.id}/groups/${g.id}`}>Editar</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/leagues/${leagueId}/groups/${g.id}/teams`}>Ver equipos</Link>
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}

            {!groups.length && (
              <tr>
                <td colSpan={3} className="text-muted-foreground p-6 text-center">
                  Aún no hay grupos en esta liga.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
