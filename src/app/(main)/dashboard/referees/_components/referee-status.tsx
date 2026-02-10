// src/app/(main)/dashboard/referees/_components/referee-status.tsx
"use client";
import { Badge } from "@/components/ui/badge";

export function RefStatusBadge({ status }: { status: "DISPONIBLE" | "LESIONADO" | "INACTIVO" }) {
  const map: Record<string, string> = {
    DISPONIBLE: "bg-green-100 text-green-700 border-green-200",
    LESIONADO: "bg-amber-100 text-amber-700 border-amber-200",
    INACTIVO: "bg-red-100 text-red-700 border-red-200",
  };
  return <Badge className={`border px-2 py-1 text-xs ${map[status]}`}>{status}</Badge>;
}
