"use client";

import * as React from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";

// --- Helper seguro ---
function toDateClientSafe(input: unknown): Date | null {
  if (!input) return null;

  if (input instanceof Date) return input;

  if (typeof input === "object" && input !== null) {
    const obj = input as any;

    // Firestore Timestamp (tiene método toDate)
    if (typeof obj.toDate === "function") {
      try {
        return obj.toDate();
      } catch {
        /* ignore */
      }
    }

    // {seconds, nanoseconds} o {seconds, nanoseconds}
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
  startDate: any; // Puede ser Timestamp, ISO o Date
  endDate: any;
  status?: "ACTIVE" | "ARCHIVED";
};

type Props = {
  initialData: Row[];
  leagueId: string;
  groupId: string;
};

export function MatchdaysClient({ initialData, leagueId, groupId }: Props) {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  const [items] = React.useState<Row[]>(initialData);
  const loading = false;

  // 🔒 formateador seguro
  const fmt = (value: any) => {
    const date = toDateClientSafe(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      dateStyle: "medium",
    }).format(date);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Jornadas</h1>
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
            <Link
              key={md.id}
              href={`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays/${md.id}`}
              className="hover:bg-muted rounded-lg border p-3 transition"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">Jornada {md.number}</div>
                <div className="text-muted-foreground text-sm">
                  {fmt(md.startDate)} — {fmt(md.endDate)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No hay jornadas registradas.</p>
      )}
    </div>
  );
}
