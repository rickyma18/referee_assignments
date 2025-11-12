"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getGroupAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";
import { deleteMatchdayAction } from "@/server/actions/matchdays.actions";

// --- Helper seguro ---
function toDateClientSafe(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;

  if (typeof input === "object" && input !== null) {
    const obj = input as any;
    if (typeof obj.toDate === "function") {
      try {
        return obj.toDate();
      } catch {
        // ignore conversion error
      }
    }
    const seconds = obj.seconds ?? obj.seconds;
    const nanos = obj.nanoseconds ?? obj.nanoseconds ?? 0;
    if (typeof seconds === "number") {
      const ms = seconds * 1000 + Math.floor(nanos / 1e6);
      return new Date(ms);
    }
  }

  if (typeof input === "string" || typeof input === "number") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// --- Tipos ---
type Row = {
  id: string;
  number: number;
  startDate: any;
  endDate: any;
  status?: "ACTIVE" | "ARCHIVED";
};

type LeagueUI = {
  id: string;
  name: string;
  season: string;
  color?: string | null;
  logoUrl?: string | null;
};

type Props = {
  initialData: Row[];
  leagueId: string;
  groupId: string;
};

export function MatchdaysClient({ initialData, leagueId, groupId }: Props) {
  const router = useRouter();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [items, setItems] = React.useState<Row[]>(initialData);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const loading = false;

  // ⬇️ meta: liga y grupo para el header
  const [league, setLeague] = React.useState<LeagueUI | null>(null);
  const [groupName, setGroupName] = React.useState<string | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);

  // ⬇️ estado del diálogo de eliminación
  const [openDelete, setOpenDelete] = React.useState(false);
  const [targetMd, setTargetMd] = React.useState<Row | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setMetaLoading(true);
        const [lg, grp] = await Promise.all([
          getLeagueAction(String(leagueId)),
          getGroupAction(String(leagueId), String(groupId)),
        ]);
        if (!alive) return;
        setLeague(
          lg
            ? {
                id: String(lg.id),
                name: lg.name ?? "",
                season: lg.season ?? "",
                color: lg.color ?? null,
                logoUrl: lg.logoUrl ?? null,
              }
            : null,
        );
        setGroupName(grp?.name ?? null);
      } finally {
        if (alive) setMetaLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [leagueId, groupId]);

  // 🔒 formateador seguro
  const fmt = (value: any) => {
    const date = toDateClientSafe(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      dateStyle: "medium",
    }).format(date);
  };

  // --- Actions por jornada ---
  const askDelete = (md: Row) => {
    if (!canEdit) return;
    setTargetMd(md);
    setOpenDelete(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!canEdit || !targetMd) return;
    try {
      setDeletingId(targetMd.id);
      const res = await deleteMatchdayAction(leagueId, groupId, targetMd.id);
      if (!res?.ok) {
        throw new Error(res?.message ?? "No se pudo eliminar la jornada");
      }
      setItems((prev) => prev.filter((x) => x.id !== targetMd.id));
      toast.success(`Jornada ${targetMd.number} eliminada`);
      setOpenDelete(false);
      setTargetMd(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Error eliminando la jornada");
    } finally {
      setDeletingId(null);
    }
  };

  const onEdit = (md: Row) => {
    if (!canEdit) return;
    router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays/${md.id}`);
  };

  const onAddMatches = (md: Row) => {
    if (!canEdit) return;
    // Puedes ajustar esta ruta a tu flujo (nuevo partido o importador por Excel)
    router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays/${md.id}/matches/upload`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header con logo + nombres */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-muted size-14 shrink-0 overflow-hidden rounded-md border">
            {league?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={league.logoUrl}
                alt={`${league.name} logo`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-muted-foreground flex h-full w-full items-center justify-center text-[10px]">
                {metaLoading ? "Cargando…" : "Sin logo"}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-xl leading-tight font-semibold">Jornadas</h1>
            <p className="text-muted-foreground text-sm">
              <span className="font-medium">{league?.name ?? "(?)"}</span>{" "}
              {league?.season ? <span>({league.season})</span> : null}
              {" · "}
              <span className="font-medium">{groupName ?? "(?)"}</span>
            </p>
            {league?.color ? (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span
                  className="inline-block size-4 rounded border"
                  style={{ backgroundColor: league.color ?? undefined }}
                  title={league.color ?? ""}
                />
                <span className="text-muted-foreground">Color liga:</span>
                <span className="font-mono">{league.color}</span>
              </div>
            ) : null}
          </div>
        </div>

        {canEdit && (
          <Button asChild>
            <Link href={`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays/new`}>Crear jornada</Link>
          </Button>
        )}
      </div>

      <Separator />

      {/* Contenido */}
      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items && items.length > 0 ? (
        <div className="grid gap-2">
          {items.map((md) => (
            <div key={md.id} className="hover:bg-muted/50 rounded-lg border p-3 transition">
              <div className="flex items-center justify-between gap-3">
                {/* Info principal con link a la jornada */}
                <Link
                  href={`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays/${md.id}/matches`}
                  className="min-w-0 grow"
                >
                  <div className="font-medium">Jornada {md.number}</div>
                  <div className="text-muted-foreground text-sm">
                    {fmt(md.startDate)} — {fmt(md.endDate)}
                  </div>
                </Link>

                {/* Acciones */}
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => onAddMatches(md)} title="Agregar partidos">
                      Agregar partidos
                    </Button>

                    <Button variant="secondary" size="sm" onClick={() => onEdit(md)} title="Editar jornada">
                      Editar
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => askDelete(md)}
                      disabled={deletingId === md.id}
                      title="Eliminar jornada"
                    >
                      {deletingId === md.id ? "Eliminando…" : "Eliminar"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No hay jornadas registradas.</p>
      )}

      {/* Diálogo reutilizable de confirmación */}
      <ConfirmDeleteDialog
        open={openDelete}
        onOpenChange={(open) => {
          // si se cierra manualmente, soltamos el target
          if (!open) setTargetMd(null);
          setOpenDelete(open);
        }}
        onConfirm={handleDeleteConfirmed}
        loading={Boolean(deletingId)}
        title={targetMd ? `¿Eliminar Jornada ${targetMd.number}?` : "¿Eliminar jornada?"}
        description="Esta acción eliminará la jornada y sus partidos. No se puede deshacer."
      />
    </div>
  );
}
