"use client";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getGroupAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";
import { createMatchdayAction, getNextMatchdayNumberAction } from "@/server/actions/matchdays.actions";

type LeagueUI = {
  id: string;
  name: string;
  season: string;
  color?: string | null;
  logoUrl?: string | null;
};

export default function NewMatchdayPage() {
  const { leagueId, groupId } = useParams<{ leagueId: string; groupId: string }>();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";
  const router = useRouter();

  const [nextNumber, setNextNumber] = React.useState<number | null>(null);
  const [numberStr, setNumberStr] = React.useState<string>(""); // <- editable
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);

  // Header meta
  const [league, setLeague] = React.useState<LeagueUI | null>(null);
  const [groupName, setGroupName] = React.useState<string | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);

  // Cargar liga y grupo
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
        /* no-op */
      } finally {
        if (alive) setMetaLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [leagueId, groupId]);

  // Cargar el siguiente número (y precargar input editable)
  React.useEffect(() => {
    (async () => {
      try {
        const n = await getNextMatchdayNumberAction(String(leagueId), String(groupId));
        setNextNumber(n);
        setNumberStr(n ? String(n) : ""); // precarga en el input
      } catch {
        toast.error("Error al obtener número de jornada");
      }
    })();
  }, [leagueId, groupId]);

  if (!canEdit) {
    return <p className="text-muted-foreground text-sm">No tienes permisos para crear jornadas.</p>;
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!start || !end) {
      toast.error("Completa las fechas.");
      return;
    }

    // validar número editable
    const numOk = /^\d+$/.test(numberStr) && parseInt(numberStr, 10) >= 1;
    if (!numOk) {
      toast.error("El número de jornada debe ser un entero ≥ 1.");
      return;
    }
    const chosenNumber = parseInt(numberStr, 10);

    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T23:59:59`);

    if (endDate < startDate) {
      toast.error("La fecha fin no puede ser anterior a la fecha inicio.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createMatchdayAction({
        leagueId: String(leagueId),
        groupId: String(groupId),
        startDate,
        endDate,
        // Antes solo lo autogenerábamos; ahora permitimos override con el input:
        _prefillNumber: chosenNumber,
      });

      if (!res.ok) {
        toast.error(res.message ?? "Error al crear jornada");
      } else {
        toast.success(`Jornada ${res.data?.number ?? chosenNumber} creada`);
        router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`);
      }
    } catch {
      toast.error("Error inesperado al crear la jornada");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
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
            <h1 className="truncate text-xl leading-tight font-semibold">Crear jornada</h1>
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

        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`)}
        >
          Volver
        </Button>
      </div>

      <Separator />

      {/* Formulario */}
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>Número (autogenerado, editable)</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={numberStr}
            onChange={(e) => {
              // solo dígitos
              const v = e.target.value.replace(/[^\d]/g, "");
              setNumberStr(v);
            }}
            placeholder={nextNumber ? String(nextNumber) : "1"}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label>Fecha inicio</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>

        <div className="grid gap-2">
          <Label>Fecha fin</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
