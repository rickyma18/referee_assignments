"use client";

// src/app/(main)/dashboard/assignments/_components/assignments-columns.tsx

import * as React from "react";

import { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, MapPin } from "lucide-react";

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";

import { ActionsCell } from "./assignments-actions-cell";
import type { AssignmentRowState, AssignmentTableMeta } from "./assignments-types";
import { RefereeSelect } from "./referee-select";

export function createAssignmentsColumns(): ColumnDef<AssignmentRowState>[] {
  return [
    {
      accessorKey: "kickoff",
      id: "fecha",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      enableSorting: true,
      cell: ({ row }) => {
        const match = row.original;
        const parsedDate = match.kickoff ? new Date(match.kickoff) : null;
        const readableDate = parsedDate
          ? parsedDate.toLocaleString(undefined, {
              weekday: "short",
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Por definir";

        return (
          <div className="px-3 py-2.5">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{readableDate}</span>
            </div>
            {typeof match.matchdayNumber === "number" && (
              <div className="text-muted-foreground mt-0.5 text-[11px]">Jornada {match.matchdayNumber}</div>
            )}
          </div>
        );
      },
    },
    {
      id: "league-group",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Liga / Grupo" />,
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="px-3 py-2.5">
            <div className="text-xs font-medium">{m.leagueName}</div>
            <div className="text-muted-foreground text-[11px]">{m.groupName}</div>
          </div>
        );
      },
    },
    {
      id: "match",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Partido" />,
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original;
        const color = m.leagueColorHex ?? undefined;

        return (
          <div className="px-3 py-2.5">
            <div className="text-xs font-semibold">
              <span style={color ? { color } : undefined}>{m.homeTeamName}</span>{" "}
              <span className="text-muted-foreground">vs</span>{" "}
              <span style={color ? { color } : undefined}>{m.awayTeamName}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "venue",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sede" />,
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="px-3 py-2.5">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <MapPin className="h-3.5 w-3.5" />
              <span className="line-clamp-1">{m.venueName ?? "Por definir"}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "central",
      header: "Central",
      enableSorting: false,
      cell: ({ row, table }) => {
        const meta = table.options.meta as AssignmentTableMeta;
        const m = row.original;
        return (
          <div className="px-3 py-2.5">
            <RefereeSelect
              value={m.central}
              onChange={(v) =>
                meta.updateRow(m.id, (prev) => ({
                  ...prev,
                  central: v,
                }))
              }
              referees={meta.referees}
              placeholder="Central"
              mode="ARBITRO"
            />
          </div>
        );
      },
    },
    {
      id: "aa1",
      header: "Asistente 1",
      enableSorting: false,
      cell: ({ row, table }) => {
        const meta = table.options.meta as AssignmentTableMeta;
        const m = row.original;
        return (
          <div className="px-3 py-2.5">
            <RefereeSelect
              value={m.aa1}
              onChange={(v) =>
                meta.updateRow(m.id, (prev) => ({
                  ...prev,
                  aa1: v,
                }))
              }
              referees={meta.referees}
              placeholder="Asistente 1"
              mode="ARBITRO"
            />
          </div>
        );
      },
    },
    {
      id: "aa2",
      header: "Asistente 2",
      enableSorting: false,
      cell: ({ row, table }) => {
        const meta = table.options.meta as AssignmentTableMeta;
        const m = row.original;
        return (
          <div className="px-3 py-2.5">
            <RefereeSelect
              value={m.aa2}
              onChange={(v) =>
                meta.updateRow(m.id, (prev) => ({
                  ...prev,
                  aa2: v,
                }))
              }
              referees={meta.referees}
              placeholder="Asistente 2"
              mode="ARBITRO"
            />
          </div>
        );
      },
    },
    {
      id: "fourth",
      header: "4º Árbitro",
      enableSorting: false,
      cell: ({ row, table }) => {
        const meta = table.options.meta as AssignmentTableMeta;
        const m = row.original;
        return (
          <div className="px-3 py-2.5">
            <RefereeSelect
              value={m.fourth}
              onChange={(v) =>
                meta.updateRow(m.id, (prev) => ({
                  ...prev,
                  fourth: v,
                }))
              }
              referees={meta.referees}
              placeholder="4º Árbitro (opcional)"
              mode="ARBITRO"
            />
          </div>
        );
      },
    },
    {
      id: "assessor",
      header: "Asesor",
      enableSorting: false,
      cell: ({ row, table }) => {
        const meta = table.options.meta as AssignmentTableMeta;
        const m = row.original;
        return (
          <div className="px-3 py-2.5">
            <RefereeSelect
              value={m.assessor}
              onChange={(v) =>
                meta.updateRow(m.id, (prev) => ({
                  ...prev,
                  assessor: v,
                }))
              }
              referees={meta.referees}
              placeholder="Asesor (opcional)"
              mode="ASESOR"
            />
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-center">Acciones</div>,
      enableSorting: false,
      cell: ({ row, table }) => {
        const meta = table.options.meta as AssignmentTableMeta;
        const m = row.original;
        return <ActionsCell row={m} meta={meta} />;
      },
    },
  ];
}
