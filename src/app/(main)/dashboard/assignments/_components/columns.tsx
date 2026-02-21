"use client";

import Link from "next/link";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { Designation } from "./types";

function formatMx(dateISO: string, time?: string) {
  try {
    const d = new Date(dateISO + (time ? `T${time}:00` : "T00:00:00"));
    return d.toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return dateISO;
  }
}

export const makeColumns = (canEdit: boolean): ColumnDef<Designation>[] => {
  const cols: ColumnDef<Designation>[] = [
    {
      accessorKey: "date",
      header: "Fecha",
      cell: ({ row }) => {
        const v = row.original;
        return <span className="font-medium">{formatMx(v.date, v.time)}</span>;
      },
    },
    { accessorKey: "homeTeam", header: "Equipo Local" },
    { accessorKey: "awayTeam", header: "Equipo Visitante" },
    { accessorKey: "center", header: "Árbitro" },
    { accessorKey: "aa1", header: "AA1" },
    { accessorKey: "aa2", header: "AA2" },
    {
      accessorKey: "venue",
      header: "Sede",
      cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue() ?? "")}</span>,
    },
    {
      accessorKey: "league",
      header: "Liga",
      cell: ({ getValue }) => <Badge variant="secondary">{String(getValue() ?? "")}</Badge>,
    },
  ];

  if (canEdit) {
    cols.push({
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const { id } = row.original;
        return (
          <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Editar designación">
            <Link href={`/assignments/${id}`}>
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Editar</span>
            </Link>
          </Button>
        );
      },
      enableSorting: false,
      enableHiding: false,
    });
  }

  return cols;
};
