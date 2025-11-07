// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/teams/page.tsx
"use client";

import * as React from "react";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getGroupAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";
import { listTeamsByGroupAction, deleteTeamAction } from "@/server/actions/teams.actions";

// ---- Tipos UI
type TeamRow = {
  id: string;
  name: string;
  municipality?: string;
  stadium?: string;
  venue?: string;
  logoUrl?: string | null;
};

type Paged<T> = { items: T[]; nextCursorId: string | null };

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

export default function TeamsPage() {
  const { leagueId, groupId } = useParams<{ leagueId: string; groupId: string }>();

  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  // Header de liga
  const [league, setLeague] = React.useState<LeagueUI | null>(null);
  const [loadingLeague, setLoadingLeague] = React.useState(true);

  // Header de grupo
  const [group, setGroup] = React.useState<GroupUI | null>(null);
  const [loadingGroup, setLoadingGroup] = React.useState(true);

  // Lista de equipos
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState<Paged<TeamRow>>({ items: [], nextCursorId: null });

  // Estado de eliminación
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Guard para evitar doble fetch
  const fetchingRef = React.useRef(false);

  // ---------- Cargar LIGA ----------
  React.useEffect(() => {
    (async () => {
      if (!leagueId) return;
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

  // ---------- Cargar GRUPO ----------
  React.useEffect(() => {
    (async () => {
      if (!leagueId || !groupId) return;
      try {
        setLoadingGroup(true);
        const g = await getGroupAction(String(leagueId), String(groupId));
        if (!g) {
          setGroup(null);
          return;
        }
        setGroup({
          id: String(g.id),
          name: String(g.name ?? ""),
          season: (g.season ?? null) as string | null,
        });
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cargar el grupo");
        setGroup(null);
      } finally {
        setLoadingGroup(false);
      }
    })();
  }, [leagueId, groupId]);

  // ---------- Cargar EQUIPOS ----------
  const load = React.useCallback(
    async (opts?: { append?: boolean; cursorId?: string | null }) => {
      if (!groupId) return;
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      try {
        setLoading(true);
        const res = await listTeamsByGroupAction({
          groupId: String(groupId),
          search: search.trim() || undefined,
          pageSize: 20,
          cursorId: opts?.append ? (opts?.cursorId ?? undefined) : undefined,
        });

        const mapItem = (x: any): TeamRow => ({
          id: x.id,
          name: x.name,
          municipality: x.municipality ?? "",
          stadium: x.stadium ?? "",
          venue: x.venue ?? "",
          logoUrl: x.logoUrl ?? null,
        });

        const items = (res.items ?? []).map(mapItem);
        const nextCursorId = res.nextCursorId ?? null;

        if (opts?.append) {
          setPage((prev) => ({ items: [...prev.items, ...items], nextCursorId }));
        } else {
          setPage({ items, nextCursorId });
        }
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message ?? "Error al cargar equipos");
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [groupId, search],
  );

  React.useEffect(() => {
    setPage({ items: [], nextCursorId: null });
    load({ append: false });
  }, [groupId, search, load]);

  // ---------- Eliminar equipo (con AlertDialog) ----------
  async function handleDelete(team: TeamRow) {
    if (!canEdit) return;
    try {
      setDeletingId(team.id);
      const res = await deleteTeamAction(String(leagueId), String(groupId), team.id);
      if ((res as any)?.ok === false) {
        toast.error((res as any)?.message ?? "No se pudo eliminar el equipo");
        return;
      }
      setPage((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== team.id) }));
      toast.success("Equipo eliminado");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  const onLoadMore = () => {
    if (!page.nextCursorId) return;
    load({ append: true, cursorId: page.nextCursorId });
  };

  // Debounce búsqueda
  const [pendingSearch, setPendingSearch] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(pendingSearch), 300);
    return () => clearTimeout(t);
  }, [pendingSearch]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header: liga + acciones */}
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
                {loadingLeague ? "Cargando..." : "Sin logo"}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl leading-tight font-bold">{league?.name ?? "Equipos"}</h1>
            <p className="text-muted-foreground text-sm">
              {league ? (
                <>
                  Temporada: <span className="font-medium">{league.season}</span> · Grupo:{" "}
                  <span className="font-medium">{loadingGroup ? "Cargando…" : (group?.name ?? String(groupId))}</span>
                </>
              ) : (
                "Administra los equipos del grupo seleccionado."
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/import`}>
            <Button variant="secondary">Importar CSV/Excel</Button>
          </Link>

          {canEdit && (
            <Link href={`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/new`}>
              <Button>Nuevo equipo</Button>
            </Link>
          )}
        </div>
      </div>

      <Separator />

      {/* Filtros */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar por nombre…"
          value={pendingSearch}
          onChange={(e) => setPendingSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="ghost" onClick={() => setPendingSearch("")} disabled={!pendingSearch}>
          Limpiar
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left [&>th]:px-4 [&>th]:py-3">
              <th>Logo</th>
              <th>Nombre</th>
              <th>Municipio</th>
              <th>Estadio</th>
              <th>Sede (dirección)</th>
              <th className="w-[220px] text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {page.items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                  No hay equipos {pendingSearch ? `para “${pendingSearch}”` : ""}.
                </td>
              </tr>
            )}

            {page.items.map((t) => (
              <tr key={t.id} className="border-t [&>td]:px-4 [&>td]:py-3">
                <td>
                  {t.logoUrl ? (
                    <div className="relative h-8 w-8 overflow-hidden rounded">
                      <Image src={t.logoUrl} alt={t.name} fill className="object-cover" sizes="32px" unoptimized />
                    </div>
                  ) : (
                    <div className="bg-muted h-8 w-8 rounded" />
                  )}
                </td>

                {/* 🔗 Nombre enlazado al detalle */}
                <td className="font-medium">
                  <Link
                    href={`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/${t.id}`}
                    className="hover:underline"
                    title={`Ver información de ${t.name}`}
                  >
                    {t.name}
                  </Link>
                </td>

                <td>{t.municipality ?? ""}</td>
                <td>{t.stadium ?? ""}</td>
                <td className="max-w-[420px] truncate">{t.venue ?? ""}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-3">
                    {/* Para roles sin permisos: solo "Ver" */}
                    {!canEdit ? (
                      <Link
                        href={`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/${t.id}`}
                        className="text-muted-foreground hover:underline"
                      >
                        Ver
                      </Link>
                    ) : (
                      <>
                        <Link
                          href={`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/${t.id}`}
                          className="text-primary hover:underline"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/${t.id}/edit`}
                          className="text-primary hover:underline"
                        >
                          Editar
                        </Link>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="text-destructive hover:underline" disabled={deletingId === t.id}>
                              {deletingId === t.id ? "Eliminando..." : "Eliminar"}
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminar equipo</AlertDialogTitle>
                              <AlertDialogDescription>
                                Vas a eliminar el equipo <span className="font-semibold">{t.name}</span>. Esta acción no
                                se puede deshacer y podría afectar registros relacionados. ¿Deseas continuar?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(t)}>Confirmar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer de tabla */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-muted-foreground text-xs">{page.items.length} resultados</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onLoadMore} disabled={!page.nextCursorId || loading}>
              {loading ? "Cargando…" : page.nextCursorId ? "Refrescar" : "Sin más resultados"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
