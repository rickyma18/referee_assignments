"use client";

import * as React from "react";

import { Shuffle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MatchdayToolbar({
  number,
  startDate,
  endDate,
  total,
}: {
  number: number | null;
  startDate: Date | null;
  endDate: Date | null;
  total: number;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"ALL" | "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED">("ALL");

  React.useEffect(() => {
    const ev = new CustomEvent("matchday:filters", { detail: { query, status } });
    window.dispatchEvent(ev);
  }, [query, status]);

  const title = typeof number === "number" ? `Jornada ${number}` : "Jornada";
  const range = startDate && endDate ? `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}` : "";

  return (
    <div className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 -mx-2 px-2 pt-2 pb-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        {range && <span className="text-muted-foreground text-sm">({range})</span>}
        <span className="text-muted-foreground ml-auto text-sm">{total} partidos</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por equipo, sede..."
          className="w-full sm:w-80"
        />
        <div className="flex items-center gap-1">
          {(["ALL", "SCHEDULED", "LIVE", "FINISHED", "POSTPONED"] as const).map((s) => (
            <Badge
              key={s}
              variant={status === s ? "default" : "outline"}
              onClick={() => setStatus(s)}
              className="cursor-pointer"
            >
              {s}
            </Badge>
          ))}
        </div>
        <Button size="sm" variant="outline" className="ml-auto">
          <Shuffle className="mr-2 h-4 w-4" />
          Ordenar por hora
        </Button>
      </div>
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <div className="animate-pulse space-y-4 overflow-hidden rounded-2xl border p-5 shadow-sm">
      <div className="bg-muted h-5 w-24 rounded" />
      <div className="bg-muted h-px w-full" />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-muted h-10 w-10 rounded-full" />
          <div className="bg-muted h-4 w-24 rounded" />
        </div>
        <div className="bg-muted h-4 w-6 rounded" />
        <div className="flex items-center justify-end gap-2">
          <div className="bg-muted h-4 w-24 rounded" />
          <div className="bg-muted h-10 w-10 rounded-full" />
        </div>
      </div>
      <div className="bg-muted h-4 w-48 rounded" />
      <div className="flex justify-end gap-2 pt-2">
        <div className="bg-muted h-8 w-20 rounded" />
        <div className="bg-muted h-8 w-16 rounded" />
      </div>
    </div>
  );
}
