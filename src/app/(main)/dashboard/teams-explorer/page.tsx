// src/app/(main)/dashboard/teams-explorer/page.tsx
"use client";

import * as React from "react";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

import { toast } from "sonner";

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { listGroupsAction } from "@/server/actions/groups.actions";
import { listLeaguesAction } from "@/server/actions/leagues.actions";
import { listTeamsByGroupAction } from "@/server/actions/teams.actions";

type LeagueUI = { id: string; name: string; season: string; logoUrl?: string | null };
type GroupUI = { id: string; name: string; season: string };
type TeamUI = { id: string; name: string; municipality?: string; logoUrl?: string | null };
type Paged<T> = { items: T[]; nextCursorId: string | null };

// --- Mini avatar/logo con fallback a iniciales ---
function CircleLogo({
  src,
  alt,
  size = 28,
  initials,
}: {
  src?: string | null;
  alt: string;
  size?: number;
  initials: string;
}) {
  const dim = size;
  return src ? (
    <div className="relative overflow-hidden rounded-full border" style={{ width: dim, height: dim }}>
      <Image src={src} alt={alt} fill sizes={`${dim}px`} className="object-cover" />
    </div>
  ) : (
    <div
      className="bg-muted text-muted-foreground flex items-center justify-center rounded-full border"
      style={{ width: dim, height: dim, fontSize: Math.max(10, Math.floor(dim * 0.42)) }}
      aria-label={alt}
      title={alt}
    >
      {initials}
    </div>
  );
}

// Utilidad simple para sacar iniciales
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export default function TeamsExplorerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leagues, setLeagues] = React.useState<LeagueUI[]>([]);
  const [loadingLeagues, setLoadingLeagues] = React.useState(true);
  const [leagueError, setLeagueError] = React.useState<string | null>(null);

  // Cache por liga/grupo
  const [groupsByLeague, setGroupsByLeague] = React.useState<
    Record<string, { loading: boolean; items: GroupUI[]; error?: string | null }>
  >({});
  const [teamsByGroup, setTeamsByGroup] = React.useState<
    Record<string, { loading: boolean; page: Paged<TeamUI>; error?: string | null }>
  >({});

  // UI
  const [openLeague, setOpenLeague] = React.useState<string | undefined>(undefined);
  // CAMBIO CLAVE: grupos expandidos por liga (no global)
  const [expandedGroupsByLeague, setExpandedGroupsByLeague] = React.useState<Record<string, string[]>>({});

  // Deep link
  const initialLeagueId = searchParams.get("leagueId") ?? "";
  const initialGroupId = searchParams.get("groupId") ?? "";

  // Cargar ligas al montar
  React.useEffect(() => {
    (async () => {
      try {
        setLoadingLeagues(true);
        const data = await listLeaguesAction({});
        setLeagues(data ?? []);
      } catch (e) {
        setLeagueError("No se pudieron cargar las ligas");
        toast.error("Error al cargar ligas");
      } finally {
        setLoadingLeagues(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abrir lo que venga en la URL (solo agregar, NO reabrir cerradas)
  React.useEffect(() => {
    if (initialLeagueId) {
      setOpenLeague(initialLeagueId);
      void ensureGroupsLoaded(initialLeagueId);

      if (initialGroupId) {
        setExpandedGroupsByLeague((prev) => {
          const prevFor = prev[initialLeagueId] ?? [];
          return prevFor.includes(initialGroupId) ? prev : { ...prev, [initialLeagueId]: [...prevFor, initialGroupId] };
        });
        void ensureTeamsLoaded(initialGroupId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeagueId, initialGroupId]);

  // --- Cargas ---
  const ensureGroupsLoaded = async (leagueId: string) => {
    const cache = groupsByLeague[leagueId];
    if (cache && (cache.loading || cache.items.length > 0 || cache.error)) return;

    setGroupsByLeague((prev) => ({ ...prev, [leagueId]: { loading: true, items: [], error: null } }));
    try {
      const gs = await listGroupsAction({ leagueId });
      setGroupsByLeague((prev) => ({ ...prev, [leagueId]: { loading: false, items: gs ?? [], error: null } }));
    } catch (e) {
      setGroupsByLeague((prev) => ({
        ...prev,
        [leagueId]: { loading: false, items: [], error: "Error al cargar grupos" },
      }));
      toast.error("Error al cargar grupos");
    }
  };

  const ensureTeamsLoaded = async (groupId: string) => {
    const cache = teamsByGroup[groupId];
    if (cache && (cache.loading || cache.page.items.length > 0 || cache.error)) return;

    setTeamsByGroup((prev) => ({
      ...prev,
      [groupId]: { loading: true, page: { items: [], nextCursorId: null }, error: null },
    }));
    try {
      const page = (await listTeamsByGroupAction({ groupId, pageSize: 25 })) as Paged<TeamUI> | TeamUI[] | null;
      const normalized: Paged<TeamUI> = Array.isArray(page)
        ? { items: page, nextCursorId: null }
        : (page ?? { items: [], nextCursorId: null });

      setTeamsByGroup((prev) => ({ ...prev, [groupId]: { loading: false, page: normalized, error: null } }));
    } catch (e) {
      setTeamsByGroup((prev) => ({
        ...prev,
        [groupId]: { loading: false, page: { items: [], nextCursorId: null }, error: "Error al cargar equipos" },
      }));
      toast.error("Error al cargar equipos");
    }
  };

  const loadMoreTeams = async (groupId: string) => {
    const cache = teamsByGroup[groupId];
    if (!cache || cache.loading || !cache.page.nextCursorId) return;

    setTeamsByGroup((prev) => ({ ...prev, [groupId]: { ...prev[groupId], loading: true } }));
    try {
      const next = (await listTeamsByGroupAction({
        groupId,
        pageSize: 25,
        cursorId: cache.page.nextCursorId,
      })) as Paged<TeamUI> | TeamUI[] | null;

      const normalized: Paged<TeamUI> = Array.isArray(next)
        ? { items: next, nextCursorId: null }
        : (next ?? { items: [], nextCursorId: null });

      setTeamsByGroup((prev) => ({
        ...prev,
        [groupId]: {
          loading: false,
          error: null,
          page: {
            items: [...(prev[groupId]?.page.items ?? []), ...normalized.items],
            nextCursorId: normalized.nextCursorId,
          },
        },
      }));
    } catch {
      setTeamsByGroup((prev) => ({
        ...prev,
        [groupId]: { ...prev[groupId], loading: false, error: "No se pudo cargar más." },
      }));
      toast.error("No se pudo cargar más equipos");
    }
  };

  // --- Handlers ---
  const handleLeaguesChange = async (next: string | undefined) => {
    const prev = openLeague;
    setOpenLeague(next);

    const params = new URLSearchParams(searchParams);

    // si se cerró todo
    if (!next) {
      if (prev) {
        setExpandedGroupsByLeague((p) => {
          const c = { ...p };
          delete c[prev];
          return c;
        });
      }
      params.delete("leagueId");
      params.delete("groupId");
      router.replace(`?${params.toString()}`);
      return;
    }

    // si se abrió/cambió de liga
    if (prev !== next) {
      void ensureGroupsLoaded(next);
    }

    params.set("leagueId", next);

    const openGroups = expandedGroupsByLeague[next] ?? [];
    if (openGroups.length > 0) params.set("groupId", openGroups[openGroups.length - 1]);
    else params.delete("groupId");

    router.replace(`?${params.toString()}`);
  };

  const handleGroupsChange = async (leagueId: string, next: string[]) => {
    // set por liga
    setExpandedGroupsByLeague((prev) => ({ ...prev, [leagueId]: next }));

    // cargar recién abiertos
    const prevForLeague = expandedGroupsByLeague[leagueId] ?? [];
    const openedNow = next.filter((id) => !prevForLeague.includes(id));
    for (const gid of openedNow) void ensureTeamsLoaded(gid);

    // deep link a último abierto de ESTA liga
    const params = new URLSearchParams(searchParams);
    if (openedNow.length > 0) {
      params.set("leagueId", leagueId);
      params.set("groupId", openedNow[openedNow.length - 1]);
    } else {
      // si cerraste todos los grupos de esa liga y era la actual, limpia groupId
      if (params.get("leagueId") === leagueId) {
        params.delete("groupId");
      }
    }
    router.replace(`?${params.toString()}`);
  };

  // Badges (evitar 0 antes de cargar)
  const renderGroupBadge = (leagueId: string) => {
    const gl = groupsByLeague[leagueId];
    if (!gl) return <Badge variant="outline">—</Badge>;
    if (gl.loading) return <Badge variant="secondary">Cargando…</Badge>;
    if (gl.error) return <Badge variant="destructive">Error</Badge>;
    return <Badge variant="outline">{gl.items.length} grupos</Badge>;
  };

  const renderTeamBadge = (groupId: string) => {
    const tg = teamsByGroup[groupId];
    if (!tg) return <Badge variant="outline">—</Badge>;
    if (tg.loading) return <Badge variant="secondary">Cargando…</Badge>;
    if (tg.error) return <Badge variant="destructive">Error</Badge>;
    return <Badge variant="outline">{tg.page.items.length} equipos</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Explorador de Ligas, Grupos y Equipos</h1>
        <p className="text-muted-foreground text-sm">Navega todo en una sola vista.</p>
      </div>

      <Separator />

      {/* LIGAS */}
      <div className="rounded-lg border">
        <div className="p-3 sm:p-4">
          {loadingLeagues ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-6 w-72" />
              <Skeleton className="h-6 w-56" />
            </div>
          ) : leagueError ? (
            <p className="text-destructive text-sm">{leagueError}</p>
          ) : leagues.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay ligas registradas.</p>
          ) : (
            <Accordion
              type="single"
              collapsible
              value={openLeague}
              onValueChange={handleLeaguesChange}
              className="space-y-1"
            >
              {leagues.map((league) => (
                <AccordionItem key={league.id} value={league.id} className="rounded-md border px-2">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-3">
                      <CircleLogo
                        src={league.logoUrl}
                        alt={`${league.name} logo`}
                        size={28}
                        initials={initialsOf(league.name)}
                      />
                      <div className="font-medium">
                        {league.name} <span className="text-muted-foreground">({league.season})</span>
                      </div>
                      {renderGroupBadge(league.id)}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent>
                    <div className="pl-1 sm:pl-3">
                      {groupsByLeague[league.id]?.loading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-5 w-72" />
                          <Skeleton className="h-5 w-64" />
                          <Skeleton className="h-5 w-80" />
                        </div>
                      ) : groupsByLeague[league.id]?.error ? (
                        <p className="text-destructive text-sm">{groupsByLeague[league.id]?.error}</p>
                      ) : (groupsByLeague[league.id]?.items?.length ?? 0) === 0 ? (
                        <p className="text-muted-foreground text-sm">Esta liga aún no tiene grupos.</p>
                      ) : (
                        <Accordion
                          type="multiple"
                          value={expandedGroupsByLeague[league.id] ?? []}
                          onValueChange={(vals) => handleGroupsChange(league.id, vals)}
                          className="space-y-1"
                        >
                          {groupsByLeague[league.id].items.map((group) => (
                            <AccordionItem key={group.id} value={group.id} className="rounded-md border px-2">
                              {/* Header del grupo: Trigger + acción (hermanos) */}
                              <div className="flex items-center justify-between">
                                <AccordionTrigger className="flex-1 py-2 text-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="font-medium">
                                      {group.name} <span className="text-muted-foreground">({group.season})</span>
                                    </div>
                                    {renderTeamBadge(group.id)}
                                  </div>
                                </AccordionTrigger>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="ml-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/dashboard/leagues/${league.id}/groups/${group.id}/teams`);
                                  }}
                                >
                                  Ver / administrar equipos
                                </Button>
                              </div>

                              <AccordionContent>
                                <div className="pl-1 sm:pl-3">
                                  {teamsByGroup[group.id]?.loading ? (
                                    <div className="space-y-2 py-2">
                                      <Skeleton className="h-5 w-72" />
                                      <Skeleton className="h-5 w-80" />
                                      <Skeleton className="h-5 w-64" />
                                    </div>
                                  ) : teamsByGroup[group.id]?.error ? (
                                    <p className="text-destructive text-sm">{teamsByGroup[group.id]?.error}</p>
                                  ) : (teamsByGroup[group.id]?.page?.items?.length ?? 0) === 0 ? (
                                    <div className="flex items-center justify-between pr-2">
                                      <p className="text-muted-foreground py-2 text-sm">Sin equipos en este grupo.</p>
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          router.push(`/dashboard/leagues/${league.id}/groups/${group.id}/teams/new`)
                                        }
                                      >
                                        Crear equipo
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <ScrollArea className="h-[260px] pr-2">
                                        <ul className="space-y-1 py-1">
                                          {teamsByGroup[group.id].page.items.map((t) => (
                                            <li
                                              key={t.id}
                                              className="flex items-center justify-between rounded-md border px-2 py-1.5"
                                            >
                                              <div className="flex items-center gap-3">
                                                <CircleLogo
                                                  src={t.logoUrl}
                                                  alt={`${t.name} logo`}
                                                  size={24}
                                                  initials={initialsOf(t.name)}
                                                />
                                                <div className="text-sm">
                                                  <div className="leading-none font-medium">{t.name}</div>
                                                  {t.municipality ? (
                                                    <div className="text-muted-foreground text-xs">
                                                      {t.municipality}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-2">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() =>
                                                    router.push(
                                                      `/dashboard/leagues/${league.id}/groups/${group.id}/teams/${t.id}`,
                                                    )
                                                  }
                                                >
                                                  Abrir
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() =>
                                                    router.push(
                                                      `/dashboard/leagues/${league.id}/groups/${group.id}/teams/${t.id}/edit`,
                                                    )
                                                  }
                                                >
                                                  Editar
                                                </Button>
                                              </div>
                                            </li>
                                          ))}
                                        </ul>
                                      </ScrollArea>

                                      <div className="flex items-center justify-between pt-2">
                                        <span className="text-muted-foreground text-xs">
                                          Mostrando {teamsByGroup[group.id].page.items.length}
                                          {teamsByGroup[group.id].page.nextCursorId ? "+" : ""} equipos
                                        </span>
                                        {teamsByGroup[group.id].page.nextCursorId ? (
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            disabled={teamsByGroup[group.id]?.loading}
                                            onClick={() => loadMoreTeams(group.id)}
                                          >
                                            {teamsByGroup[group.id]?.loading ? "Cargando…" : "Refrescar"}
                                          </Button>
                                        ) : null}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
}
