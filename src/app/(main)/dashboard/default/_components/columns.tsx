"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Designation } from "./types";

export const columns: ColumnDef<Designation>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="px-0">
        Fecha/Hora
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => {
      const v = getValue<string>();
      return (
        <div className="min-w-[160px]">
          <div className="font-medium">{format(new Date(v), "EEE d MMM yyyy", { locale: es })}</div>
          <div className="text-muted-foreground text-xs">{format(new Date(v), "HH:mm", { locale: es })} hrs</div>
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "league",
    header: "Liga",
    cell: ({ getValue }) => <span className="text-sm">{getValue<string>()}</span>,
  },
  {
    accessorKey: "matchday",
    header: "Jornada",
    cell: ({ getValue }) => <span>J{getValue<number>()}</span>,
  },
  {
    id: "match",
    header: "Partido",
    cell: ({ row }) => {
      const h = row.original.homeTeam;
      const a = row.original.awayTeam;
      return (
        <div className="min-w-[220px]">
          <div className="font-medium">
            {h} vs {a}
          </div>
          <div className="text-muted-foreground text-xs">{row.original.venue}</div>
        </div>
      );
    },
  },
  {
    id: "crew",
    header: "Terna",
    cell: ({ row }) => {
      const { center, aa1, aa2, fourth } = row.original;
      return (
        <div className="flex flex-col gap-1">
          <div>
            <span className="text-muted-foreground text-xs">Central:</span> {center}
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground text-xs">AA1:</span> {aa1}{" "}
            <span className="text-muted-foreground ml-2 text-xs">AA2:</span> {aa2}
          </div>
          {fourth ? (
            <div className="text-sm">
              <span className="text-muted-foreground text-xs">4º:</span> {fourth}
            </div>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "difficulty",
    header: "Dificultad",
    cell: ({ getValue }) => {
      const v = getValue<Designation["difficulty"]>();
      const variant = v === "Alta" ? "destructive" : v === "Media" ? "default" : "secondary";
      return <Badge variant={variant as any}>{v ?? "—"}</Badge>;
    },
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ getValue }) => {
      const v = getValue<Designation["status"]>();
      const map: Record<Designation["status"], string> = {
        Programado: "secondary",
        Confirmado: "default",
        Reasignar: "outline",
      };
      return <Badge variant={map[v] as any}>{v}</Badge>;
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      // Aquí podrías abrir un drawer/modal para reasignar o confirmar
      return (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="mr-2">
            Sugerir
          </Button>
          <Button size="sm">Confirmar</Button>
        </div>
      );
    },
    enableSorting: false,
  },
];
