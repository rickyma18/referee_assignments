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
import { getNextMatchdayNumberAction, generateMatchdaysBulkAction } from "@/server/actions/matchdays.actions";

type LeagueUI = {
  id: string;
  name: string;
  season: string;
  color?: string | null;
  logoUrl?: string | null;
};

export default function GenerateMatchdaysPage() {
  const { leagueId, groupId } = useParams<{ leagueId: string; groupId: string }>();
  const { userDoc, loading } = useCurrentUser();
  const router = useRouter();

  const [league, setLeague] = React.useState<LeagueUI | null>(null);
  const [groupName, setGroupName] = React.useState<string | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);

  const [startNumber, setStartNumber] = React.useState<number | null>(null);

  const [countStr, setCountStr] = React.useState<string>("5");
  const [intervalStr, setIntervalStr] = React.useState<string>("7");
  const [durationStr, setDurationStr] = React.useState<string>("1");
  const [firstStart, setFirstStart] = React.useState<string>("");

  const [submitting, setSubmitting] = React.useState(false);

  // Cargar liga y grupo (meta del header)
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

  // Cargar el siguiente número sugerido
  React.useEffect(() => {
    (async () => {
      try {
        const n = await getNextMatchdayNumberAction(String(leagueId), String(groupId));
        setStartNumber(n ?? 1);
      } catch {
        toast.error("Error al obtener el siguiente número de jornada.");
      }
    })();
  }, [leagueId, groupId]);

  // 👇 Estos useMemo SIEMPRE se ejecutan, no están detrás de returns condicionales
  const countNum = React.useMemo(() => {
    const n = parseInt(countStr || "0", 10);
    return Number.isNaN(n) || n <= 0 ? 0 : n;
  }, [countStr]);

  const intervalNum = React.useMemo(() => {
    const n = parseInt(intervalStr || "0", 10);
    return Number.isNaN(n) || n <= 0 ? 7 : n;
  }, [intervalStr]);

  const durationNum = React.useMemo(() => {
    const n = parseInt(durationStr || "0", 10);
    return Number.isNaN(n) || n <= 0 ? 1 : n;
  }, [durationStr]);

  const preview = React.useMemo(() => {
    if (!startNumber || !firstStart || countNum <= 0) return [];

    const dayMs = 24 * 60 * 60 * 1000;
    const base = new Date(`${firstStart}T00:00:00`);
    if (Number.isNaN(base.getTime())) return [];

    const rows: {
      number: number;
      start: string;
      end: string;
    }[] = [];

    for (let i = 0; i < countNum; i += 1) {
      const num = startNumber + i;
      const startMs = base.getTime() + i * intervalNum * dayMs;
      const startDate = new Date(startMs);
      const endDate = new Date(startMs + (durationNum - 1) * dayMs);

      const startLabel = startDate.toLocaleDateString("es-MX", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
      const endLabel = endDate.toLocaleDateString("es-MX", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });

      rows.push({
        number: num,
        start: startLabel,
        end: endLabel,
      });
    }

    return rows;
  }, [startNumber, firstStart, countNum, intervalNum, durationNum]);

  // 🔄 Loader mientras se resuelve el rol / usuario
  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/FMF_Logo.png" alt="FMF Logo" className="h-20 w-20 animate-pulse object-contain opacity-90" />
        <div className="border-muted-foreground size-10 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Verificando permisos…</p>
      </div>
    );
  }

  // 🧱 Guard de permisos DESPUÉS de todos los hooks
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  if (!canEdit) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-muted-foreground text-sm">No tienes permisos para generar jornadas.</p>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!firstStart) {
      toast.error("Selecciona la fecha de inicio de la primera jornada.");
      return;
    }
    if (!startNumber) {
      toast.error("No se pudo determinar el número inicial de jornada.");
      return;
    }
    if (countNum <= 0) {
      toast.error("La cantidad de jornadas debe ser mayor a 0.");
      return;
    }

    const firstStartDate = new Date(`${firstStart}T00:00:00`);
    if (Number.isNaN(firstStartDate.getTime())) {
      toast.error("Fecha inicial inválida.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await generateMatchdaysBulkAction({
        leagueId: String(leagueId),
        groupId: String(groupId),
        count: countNum,
        firstStartDate,
        intervalDays: intervalNum,
        durationDays: durationNum,
        startNumberOverride: startNumber,
      });

      if (!res.ok) {
        toast.error(res.message ?? "No se pudieron generar las jornadas.");
        return;
      }

      const data = res.data;
      const created = data?.createdCount ?? 0;
      const skipped = data?.skippedNumbers?.length ?? 0;

      if (created === 0) {
        toast.info("No se creó ninguna jornada nueva (posiblemente todos los números ya existen).");
      } else {
        toast.success(
          `Se generaron ${created} jornadas a partir de la jornada ${
            data?.startNumber ?? startNumber
          }${skipped > 0 ? ` (se saltaron ${skipped} números ya existentes)` : ""}.`,
        );
      }

      router.push(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`);
    } catch (err: any) {
      toast.error(err?.message ?? "Error inesperado al generar jornadas.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
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
            <h1 className="truncate text-xl leading-tight font-semibold">Generar calendario de jornadas</h1>
            <p className="text-muted-foreground text-sm">
              <span className="font-medium">{league?.name ?? "(?)"}</span>{" "}
              {league?.season ? <span>({league.season})</span> : null}
              {" · "}
              <span className="font-medium">{groupName ?? "(?)"}</span>
            </p>
            {startNumber && (
              <p className="text-muted-foreground mt-1 text-xs">
                Empezando a partir de la <span className="font-semibold">jornada {startNumber}</span> (basado en las
                jornadas existentes).
              </p>
            )}
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

      {/* Formulario de parámetros */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Cantidad de jornadas a crear</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={countStr}
            onChange={(e) => setCountStr(e.target.value.replace(/[^\d]/g, ""))}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label>Fecha de inicio de la primera jornada</Label>
          <Input type="date" value={firstStart} onChange={(e) => setFirstStart(e.target.value)} required />
        </div>

        <div className="grid gap-2">
          <Label>Días entre jornadas</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={intervalStr}
            onChange={(e) => setIntervalStr(e.target.value.replace(/[^\d]/g, ""))}
          />
          <p className="text-muted-foreground text-xs">Ejemplo: 7 para una jornada por semana.</p>
        </div>

        <div className="grid gap-2">
          <Label>Duración de cada jornada (en días)</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={durationStr}
            onChange={(e) => setDurationStr(e.target.value.replace(/[^\d]/g, ""))}
          />
          <p className="text-muted-foreground text-xs">Ejemplo: 1 si solo te importa el día del partido.</p>
        </div>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="rounded-md border">
          <div className="bg-muted text-muted-foreground px-3 py-2 text-xs font-semibold uppercase">
            Previsualización de jornadas
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Jornada</th>
                  <th className="px-3 py-2 font-medium">Fecha inicio</th>
                  <th className="px-3 py-2 font-medium">Fecha fin</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.number} className="border-t">
                    <td className="px-3 py-1.5 font-medium">Jornada {p.number}</td>
                    <td className="px-3 py-1.5">{p.start}</td>
                    <td className="px-3 py-1.5">{p.end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground px-3 py-2 text-[11px]">
            No se sobrescribe ninguna jornada existente: si ya hay una jornada con ese número, simplemente se salta.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Generando…" : "Generar jornadas"}
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
