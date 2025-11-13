// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/[matchId]/edit/_client-form.tsx
"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { EntityHeader } from "@/components/entity-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { updateMatchAction } from "@/server/actions/matches.actions";

type HeaderContext = {
  leagueName: string;
  season?: string | null;
  groupName?: string | null; // Ej. "Grupo A" o "A"
  matchdayNumber?: number | null; // Ej. 5
  leagueLogoUrl?: string | null;
  leagueColorHex?: string | null; // Ej. "#1F8B4C"
};

type Props = {
  initial: {
    id: string;
    leagueId: string;
    groupId: string;
    matchdayId: string;
    matchId: string;

    venueName: string;
    status: string;
    homeGoals: number | "";
    awayGoals: number | "";

    fecha: string; // YYYY-MM-DD
    hora: string; // HH:mm

    homeTeamName: string;
    awayTeamName: string;
  };

  /** Contexto para pintar el header (lo provee el padre) */
  header?: HeaderContext;
};

export default function EditMatchForm({ initial, header }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const [venueName, setVenueName] = React.useState(initial.venueName ?? "");
  const [status, setStatus] = React.useState(initial.status ?? "SCHEDULED");
  const [homeGoals, setHomeGoals] = React.useState<string>(initial.homeGoals === "" ? "" : String(initial.homeGoals));
  const [awayGoals, setAwayGoals] = React.useState<string>(initial.awayGoals === "" ? "" : String(initial.awayGoals));
  const [fecha, setFecha] = React.useState(initial.fecha ?? "");
  const [hora, setHora] = React.useState(initial.hora ?? "");

  // Regresar a la lista de partidos de la jornada
  const backHref = React.useMemo(
    () => `/dashboard/leagues/${initial.leagueId}/groups/${initial.groupId}/matchdays/${initial.matchdayId}/matches`,
    [initial.leagueId, initial.groupId, initial.matchdayId],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const parsedHome = homeGoals === "" ? null : Number(homeGoals);
      const parsedAway = awayGoals === "" ? null : Number(awayGoals);
      if (parsedHome !== null && isNaN(parsedHome)) throw new Error("Marcador local inválido.");
      if (parsedAway !== null && isNaN(parsedAway)) throw new Error("Marcador visitante inválido.");

      const res = await updateMatchAction({
        leagueId: initial.leagueId,
        groupId: initial.groupId,
        matchdayId: initial.matchdayId,
        matchId: initial.matchId,

        fecha: fecha || null,
        hora: hora || null,
        venueName: venueName || null,
        status,

        homeGoals: parsedHome,
        awayGoals: parsedAway,
      });

      if (!res?.ok) throw new Error(res?.error ?? "No se pudo actualizar.");
      toast.success("Partido actualizado.");
      router.back();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Error al actualizar.");
    } finally {
      setBusy(false);
    }
  }

  // Header (solo liga/grupo/jornada, sin datos del partido)
  const title = `${header?.leagueName ?? "Liga"}${header?.season ? ` • ${header.season}` : " • Temporada"}`;
  const subtitle = `${header?.groupName ?? "Grupo"} • Jornada ${header?.matchdayNumber ?? "—"}`;

  return (
    <div className="space-y-6">
      <EntityHeader
        title={<span className="truncate">{title}</span>}
        subtitle={<span className="truncate">{subtitle}</span>}
        logoUrl={header?.leagueLogoUrl ?? null}
        colorHex={header?.leagueColorHex ?? null}
        backHref={backHref}
        backText="Volver a jornada"
        canDelete={false}
        rightExtra={
          <Button variant="outline" onClick={() => router.push(backHref)}>
            Ver partidos
          </Button>
        }
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={initial.homeTeamName} readOnly />
          </div>
          <div className="space-y-1.5">
            <Label>Visitante</Label>
            <Input value={initial.awayTeamName} readOnly />
          </div>

          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Hora</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Sede (nombre)</Label>
            <Input
              placeholder="Ej. Estadio Municipal Zapotlanejo"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Marcador local</Label>
            <Input
              inputMode="numeric"
              placeholder="—"
              value={homeGoals}
              onChange={(e) => setHomeGoals(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Marcador visitante</Label>
            <Input
              inputMode="numeric"
              placeholder="—"
              value={awayGoals}
              onChange={(e) => setAwayGoals(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Estatus</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona estatus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SCHEDULED">SCHEDULED</SelectItem>
                <SelectItem value="LIVE">LIVE</SelectItem>
                <SelectItem value="FINISHED">FINISHED</SelectItem>
                <SelectItem value="POSTPONED">POSTPONED</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <Separator />

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => window.history.back()} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
