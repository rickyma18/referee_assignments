"use client";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/hooks/use-current-user";
import { createMatchdayAction, getNextMatchdayNumberAction } from "@/server/actions/matchdays.actions";

export default function NewMatchdayPage() {
  const { leagueId, groupId } = useParams<{ leagueId: string; groupId: string }>();
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";
  const router = useRouter();

  const [nextNumber, setNextNumber] = React.useState<number | null>(null);
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);

  // Cargar el siguiente número de jornada
  React.useEffect(() => {
    (async () => {
      try {
        const n = await getNextMatchdayNumberAction(String(leagueId), String(groupId));
        setNextNumber(n);
      } catch {
        toast.error("Error al obtener número de jornada");
      }
    })();
  }, [leagueId, groupId]);

  // Si no tiene permisos
  if (!canEdit) {
    return <p className="text-muted-foreground text-sm">No tienes permisos para crear jornadas.</p>;
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

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

    setSubmitting(true);
    try {
      const res = await createMatchdayAction({
        leagueId: String(leagueId),
        groupId: String(groupId),
        startDate,
        endDate,
        _prefillNumber: nextNumber ?? undefined,
      });

      if (!res.ok) {
        toast.error(res.message ?? "Error al crear jornada");
      } else {
        toast.success(`Jornada ${res.data?.number} creada`);
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
      <h1 className="text-xl font-semibold">Crear jornada</h1>
      <Separator />

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>Número (autogenerado)</Label>
          <Input value={nextNumber ?? ""} readOnly />
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
