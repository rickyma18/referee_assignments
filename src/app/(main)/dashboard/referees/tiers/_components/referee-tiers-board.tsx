// src/app/(main)/dashboard/referees/tiers/_components/referee-tiers-board.tsx
"use client";

import * as React from "react";

import { toast } from "sonner";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setRefereeTierAction } from "@/server/actions/referees.actions";

type RefTier = "NO_ELEGIBLE" | "DEBUTANTE" | "EN_DESARROLLO" | "EXPERIMENTADO" | "MUY_EXPERIMENTADO";

type RefereeItem = {
  id: string;
  name: string;
  tier: RefTier | string;
  category?: string | null;
  zones?: string[];
};

type Props = {
  referees: RefereeItem[];
};

const TIERS: { id: RefTier; label: string; description: string }[] = [
  {
    id: "NO_ELEGIBLE",
    label: "No elegible",
    description: "No entra al pool automático. Solo asignación manual.",
  },
  {
    id: "DEBUTANTE",
    label: "Debutante",
    description: "Primeros partidos, baja exposición a partidos complicados.",
  },
  {
    id: "EN_DESARROLLO",
    label: "En desarrollo",
    description: "Nivel esperado para la mayoría de partidos.",
  },
  {
    id: "EXPERIMENTADO",
    label: "Experimentado",
    description: "Buen desempeño, puede ir a partidos de mayor exigencia.",
  },
  {
    id: "MUY_EXPERIMENTADO",
    label: "Muy experimentado",
    description: "Confianza máxima. Ideal para partidos de alto MDS.",
  },
];

function normalizeTier(tier: string | undefined): RefTier {
  if (!tier) return "DEBUTANTE";
  const up = tier.toUpperCase() as RefTier;
  if (["NO_ELEGIBLE", "DEBUTANTE", "EN_DESARROLLO", "EXPERIMENTADO", "MUY_EXPERIMENTADO"].includes(up)) {
    return up;
  }
  return "DEBUTANTE";
}

export function RefereeTiersBoard({ referees }: Props) {
  const [columns, setColumns] = React.useState<Record<RefTier, RefereeItem[]>>(() => {
    const base: Record<RefTier, RefereeItem[]> = {
      NO_ELEGIBLE: [],
      DEBUTANTE: [],
      EN_DESARROLLO: [],
      EXPERIMENTADO: [],
      MUY_EXPERIMENTADO: [],
    };
    referees.forEach((r) => {
      const t = normalizeTier(r.tier);
      base[t].push({ ...r, tier: t });
    });
    // Orden simple alfabético dentro de cada columna
    (Object.keys(base) as RefTier[]).forEach((tier) => {
      base[tier].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    });
    return base;
  });

  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  const handleDropOnTier = React.useCallback(
    async (targetTier: RefTier, refId: string) => {
      // Estado anterior para revertir en caso de error
      const prevColumns = columns;

      let fromTier: RefTier | null = null;
      let movedRef: RefereeItem | null = null;

      for (const t of Object.keys(columns) as RefTier[]) {
        const found = columns[t].find((r) => r.id === refId);
        if (found) {
          fromTier = t;
          movedRef = found;
          break;
        }
      }

      if (!movedRef || !fromTier) return;
      if (fromTier === targetTier) return;

      // Construimos nuevo estado optimista
      const next: Record<RefTier, RefereeItem[]> = {
        NO_ELEGIBLE: [],
        DEBUTANTE: [],
        EN_DESARROLLO: [],
        EXPERIMENTADO: [],
        MUY_EXPERIMENTADO: [],
      };

      (Object.keys(columns) as RefTier[]).forEach((tier) => {
        if (tier === fromTier) {
          next[tier] = columns[tier].filter((r) => r.id !== refId);
        } else {
          next[tier] = [...columns[tier]];
        }
      });

      next[targetTier] = [...next[targetTier], { ...movedRef, tier: targetTier }];
      next[targetTier].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

      setColumns(next);

      try {
        const res = await setRefereeTierAction(refId, targetTier);
        if (!res.ok) {
          throw new Error(res.message ?? "No se pudo actualizar el tier.");
        }
        toast.success(`Tier actualizado a "${targetTier.toLowerCase()}" para ${movedRef.name}.`);
      } catch (err: any) {
        console.error(err);
        setColumns(prevColumns);
        toast.error(err?.message ?? "Error al actualizar el tier.");
      }
    },
    [columns],
  );

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, refId: string) => {
    setDraggingId(refId);
    event.dataTransfer.setData("text/plain", refId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetTier: RefTier) => {
    event.preventDefault();
    const refId = event.dataTransfer.getData("text/plain") || draggingId;
    if (!refId) return;
    void handleDropOnTier(targetTier, refId);
    setDraggingId(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {TIERS.map((tier) => (
        <Card
          key={tier.id}
          className={cn(
            "flex min-h-[260px] flex-col border-dashed transition-colors",
            tier.id === "NO_ELEGIBLE" && "border-red-300/70",
          )}
          onDrop={(e) => handleDrop(e, tier.id)}
          onDragOver={handleDragOver}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>{tier.label}</span>
              <span className="text-muted-foreground text-xs">
                {columns[tier.id].length} {columns[tier.id].length === 1 ? "árbitro" : "árbitros"}
              </span>
            </CardTitle>
            <p className="text-muted-foreground text-xs">{tier.description}</p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-1.5">
            {columns[tier.id].length === 0 ? (
              <div className="text-muted-foreground flex flex-1 items-center justify-center text-xs italic">
                Arrastra árbitros aquí…
              </div>
            ) : (
              columns[tier.id].map((ref) => (
                <div
                  key={ref.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, ref.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "bg-muted flex cursor-move items-center justify-between rounded-md px-2 py-1.5 text-xs shadow-sm transition",
                    draggingId === ref.id && "ring-primary opacity-60 ring-2",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{ref.name}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {ref.category ? `${ref.category}` : "Sin categoría"}
                      {ref.zones && ref.zones.length > 0 ? ` · ${ref.zones.join(", ")}` : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
