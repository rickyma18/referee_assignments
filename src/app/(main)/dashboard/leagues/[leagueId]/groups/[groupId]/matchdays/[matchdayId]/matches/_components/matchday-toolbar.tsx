// src/app/(main)/dashboard/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/_components/matchday-toolbar.tsx
"use client";

import * as React from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  number: number | null;
  startDate: Date | null;
  endDate: Date | null;
  total: number;
  // 👇 nuevo: estado actual del filtro leído por el server
  estadoActual?: string;
};

const formatDate = (d: Date | null): string => {
  if (!d) return "Sin fecha";
  return d.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
};

const ESTADOS: { key: string; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "programados", label: "Programados" },
  { key: "en-juego", label: "En juego" },
  { key: "finalizados", label: "Finalizados" },
  // 👇 ya NO incluimos "pospuestos"
  // { key: "pospuestos", label: "Pospuestos" },
];

export function MatchdayToolbar({ number, startDate, endDate, total, estadoActual }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = (estadoActual ?? searchParams.get("estado") ?? "todos").toLowerCase();

  const handleClickEstado = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!key || key === "todos") {
      params.delete("estado");
    } else {
      params.set("estado", key);
    }

    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router.push(href);
  };

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <div className="text-sm font-semibold">
          Jornada {number ?? "—"}{" "}
          <span className="text-muted-foreground text-xs">
            ({formatDate(startDate)} – {formatDate(endDate)})
          </span>
        </div>
        <div className="text-muted-foreground text-xs">
          {total} partido{total === 1 ? "" : "s"} programado{total === 1 ? "" : "s"} en esta jornada
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ESTADOS.map((opt) => (
          <Button
            key={opt.key}
            type="button"
            variant={active === opt.key ? "default" : "outline"}
            size="sm"
            className={cn(
              "rounded-full text-xs",
              active === opt.key && "border-primary bg-primary text-primary-foreground",
            )}
            onClick={() => handleClickEstado(opt.key)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// Skeleton que ya usabas en el Suspense
export function MatchCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mb-3 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}
