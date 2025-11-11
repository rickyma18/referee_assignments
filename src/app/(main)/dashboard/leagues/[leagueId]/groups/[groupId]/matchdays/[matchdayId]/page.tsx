"use client";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getGroupAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";
import { getMatchdayAction, updateMatchdayAction, deleteMatchdayAction } from "@/server/actions/matchdays.actions";

type MatchdayDTO = {
  id: string;
  leagueId: string;
  groupId: string;
  number: number;
  startDate: any; // Firestore Timestamp
  endDate: any; // Firestore Timestamp
  status?: "ACTIVE" | "ARCHIVED";
};

type LeagueUI = {
  id: string;
  name: string;
  season: string;
  color?: string | null;
  logoUrl?: string | null;
};

export default function MatchdayDetailPage() {
  const { leagueId, groupId, matchdayId } = useParams<{
    leagueId: string;
    groupId: string;
    matchdayId: string;
  }>();
  const router = useRouter();

  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [loading, setLoading] = React.useState(true);
  const [item, setItem] = React.useState<MatchdayDTO | null>(null);

  // Meta header (liga/grupo)
  const [league, setLeague] = React.useState<LeagueUI | null>(null);
  const [groupName, setGroupName] = React.useState<string | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);

  // Form state
  const [start, setStart] = React.useState<string>(""); // YYYY-MM-DD
  const [end, setEnd] = React.useState<string>(""); // YYYY-MM-DD
  const [status, setStatus] = React.useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getMatchdayAction(String(leagueId), String(groupId), String(matchdayId));
        if (!data) {
          toast.error("Jornada no encontrada");
          router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`);
          return;
        }
        setItem(data as MatchdayDTO);

        // Parsear Timestamps a YYYY-MM-DD
        const s = tsToInputDate((data as any).startDate);
        const e = tsToInputDate((data as any).endDate);
        setStart(s);
        setEnd(e);
        setStatus((data as any).status ?? "ACTIVE");
      } catch {
        toast.error("Error al cargar la jornada");
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId, groupId, matchdayId, router]);

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
      } catch {
        // silencioso; el header tiene fallbacks
      } finally {
        if (alive) setMetaLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [leagueId, groupId]);

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!item) return;

    if (!start || !end) {
      toast.error("Completa las fechas.");
      return;
    }
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T23:59:59`);
    if (endDate < startDate) {
      toast.error("La fecha fin no puede ser anterior a la fecha inicio.");
      return;
    }

    setSaving(true);
    try {
      const res = await updateMatchdayAction({
        id: item.id,
        leagueId: String(leagueId),
        groupId: String(groupId),
        startDate,
        endDate,
        status,
      });

      if (!res.ok) {
        toast.error(res.message ?? "No se pudo guardar");
        return;
      }

      toast.success("Jornada actualizada");
      router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`);
    } catch {
      toast.error("Error inesperado al guardar");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      const res = await deleteMatchdayAction(String(leagueId), String(groupId), String(item.id));
      if (!res.ok) {
        toast.error(res.message ?? "No se pudo eliminar");
        return;
      }
      toast.success("Jornada eliminada");
      router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`);
    } catch {
      toast.error("Error inesperado al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {/* Header skeleton */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        <Separator />

        <div className="grid gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!item) {
    return <p className="text-muted-foreground text-sm">No se encontró la jornada.</p>;
  }

  return (
    <form onSubmit={onSave} className="max-w-xl space-y-4">
      {/* Header con logo + liga/grupo */}
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
            <h1 className="truncate text-xl leading-tight font-semibold">Jornada {item.number}</h1>
            <p className="text-muted-foreground text-sm">
              Liga: <span className="font-medium">{league?.name ?? "(?)"}</span>{" "}
              {league?.season ? <span>({league.season})</span> : null}
              {" · Grupo: "}
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

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`)}
          >
            Volver
          </Button>

          {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive">
                  Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar jornada</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. Se eliminará la jornada y su registro. (No borra partidos aún; eso
                    lo definimos en 3.2+)
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Eliminando..." : "Eliminar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Separator />

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>Número</Label>
          <Input value={item.number} readOnly />
        </div>

        <div className="grid gap-2">
          <Label>Fecha inicio</Label>
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            disabled={!canEdit || saving}
          />
        </div>

        <div className="grid gap-2">
          <Label>Fecha fin</Label>
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
            disabled={!canEdit || saving}
          />
        </div>

        <div className="grid gap-2">
          <Label>Estado</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as "ACTIVE" | "ARCHIVED")}
            disabled={!canEdit || saving}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">ACTIVA</SelectItem>
              <SelectItem value="ARCHIVED">ARCHIVADA</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Convierte Firestore Timestamp | Date | string a "YYYY-MM-DD" para <input type="date" /> */
function tsToInputDate(ts: any): string {
  const d = ts && typeof ts === "object" && "toDate" in ts ? (ts.toDate() as Date) : new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
