"use client";

// src/app/(main)/dashboard/assignments/_components/assignments-table.tsx

import * as React from "react";
import { useTransition, useMemo, useState, useEffect, useCallback } from "react";

import { useRouter } from "next/navigation";

import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

import { createAssignmentsColumns } from "./assignments-columns";
import { buildExportRows } from "./assignments-export";
import {
  type LeagueDoc,
  type GroupDoc,
  type AssignmentMatchRow,
  type RefereeOption,
  type AssignmentRowState,
  type AssignmentTableMeta,
  type AssignmentsTableProps,
} from "./assignments-types";

export function AssignmentsTable({ leagues, groups, matches, referees }: AssignmentsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [filterLeagueId, setFilterLeagueId] = useState<string>("all");
  const [filterGroupId, setFilterGroupId] = useState<string>("all");
  const [searchTeam, setSearchTeam] = useState<string>("");

  // Estado interno de filas con selección editable
  const [rowData, setRowData] = useState<AssignmentRowState[]>(() =>
    matches.map((m) => ({
      ...m,
      central: m.centralRefereeId ?? "",
      aa1: m.aa1RefereeId ?? "",
      aa2: m.aa2RefereeId ?? "",
      fourth: m.fourthRefereeId ?? "",
      assessor: m.assessorRefereeId ?? "",
    })),
  );

  const leagueById = useMemo(() => {
    const map = new Map<string, LeagueDoc>();
    leagues.forEach((l) => map.set(l.id, l));
    return map;
  }, [leagues]);

  // Si cambian los matches desde el servidor (router.refresh), sincronizamos
  useEffect(() => {
    setRowData(
      matches.map((m) => ({
        ...m,
        central: m.centralRefereeId ?? "",
        aa1: m.aa1RefereeId ?? "",
        aa2: m.aa2RefereeId ?? "",
        fourth: m.fourthRefereeId ?? "",
        assessor: m.assessorRefereeId ?? "",
      })),
    );
  }, [matches]);

  const filteredGroups = useMemo(() => {
    // helper para sacar el número del nombre, p.ej. "Grupo 4" -> 4
    const getGroupNumber = (name: string): number => {
      const match = name.match(/\d+/);
      if (!match) return Number.POSITIVE_INFINITY; // los sin número van al final
      const n = parseInt(match[0], 10);
      return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
    };

    let list = groups;
    if (filterLeagueId !== "all") {
      list = list.filter((g) => g.leagueId === filterLeagueId);
    }

    return [...list].sort((a, b) => {
      const na = getGroupNumber(a.name);
      const nb = getGroupNumber(b.name);
      if (na !== nb) return na - nb;
      // fallback por si nombre no tiene número o hay empate
      return a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" });
    });
  }, [groups, filterLeagueId]);

  const filteredMatches = useMemo(() => {
    let rows = rowData;

    if (filterLeagueId !== "all") {
      rows = rows.filter((m) => m.leagueId === filterLeagueId);
    }
    if (filterGroupId !== "all") {
      rows = rows.filter((m) => m.groupId === filterGroupId);
    }
    if (searchTeam.trim().length > 0) {
      const q = searchTeam.trim().toLowerCase();
      rows = rows.filter((m) => m.homeTeamName.toLowerCase().includes(q) || m.awayTeamName.toLowerCase().includes(q));
    }
    return rows;
  }, [rowData, filterLeagueId, filterGroupId, searchTeam]);

  const leagueOptions = useMemo(() => [{ id: "all", name: "Todas las ligas" }, ...leagues], [leagues]);

  const groupOptions = useMemo(() => {
    const base = [{ id: "all", name: "Todos los grupos", leagueId: "all" } as GroupDoc];
    return base.concat(filteredGroups);
  }, [filteredGroups]);

  /* ---------- Columnas TanStack ---------- */

  const columns = useMemo(() => createAssignmentsColumns(), []);

  /* ---------- Instancia TanStack table ---------- */

  const table = useReactTable<AssignmentRowState>({
    data: filteredMatches,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      referees,
      isPendingGlobal: isPending,
      updateRow: (id, updater) =>
        setRowData((prev) =>
          prev.map((row) => {
            if (row.id !== id) return row;
            return updater(row);
          }),
        ),
      onSaved: () => {
        startTransition(() => {
          router.refresh();
        });
      },
    } satisfies AssignmentTableMeta,
  });

  /* ---------- Exportar a Excel ---------- */

  const handleExport = useCallback(() => {
    // Filas actuales SIN paginación (pero ya filtradas por liga / grupo / búsqueda)
    const coreRows = table.getPrePaginationRowModel().rows;
    const rows = coreRows.map((r) => r.original);

    if (rows.length === 0) {
      toast.info("No hay partidos para exportar.");
      return;
    }

    const data = buildExportRows(rows, referees, leagueById);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    XLSX.utils.book_append_sheet(wb, ws, "Designaciones");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const now = new Date();
    const ts = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");

    a.href = url;
    a.download = `designaciones-${ts}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [table, referees, leagueById]);

  return (
    <div className="space-y-4">
      {/* Toolbar de filtros (shadcn Select como antes) */}
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 md:px-4">
        <Select
          value={filterLeagueId}
          onValueChange={(v) => {
            setFilterLeagueId(v);
            setFilterGroupId("all");
          }}
        >
          <SelectTrigger className="w-full max-w-xs md:w-60">
            <SelectValue placeholder="Liga" />
          </SelectTrigger>
          <SelectContent>
            {leagueOptions.map((lg) => (
              <SelectItem key={lg.id} value={lg.id}>
                {"season" in lg && lg.season ? `${lg.name} · ${lg.season}` : lg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterGroupId}
          onValueChange={setFilterGroupId}
          disabled={filterLeagueId !== "all" && filteredGroups.length === 0}
        >
          <SelectTrigger className="w-full max-w-xs md:w-52">
            <SelectValue placeholder="Grupo" />
          </SelectTrigger>
          <SelectContent>
            {groupOptions.map((g) => {
              const leagueName = g.leagueId === "all" ? null : (leagueById.get(g.leagueId)?.name ?? "Liga");

              return (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                  {leagueName && <span className="text-muted-foreground text-xs"> ({leagueName})</span>}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Input
          value={searchTeam}
          onChange={(e) => setSearchTeam(e.target.value)}
          placeholder="Buscar por equipo…"
          className="w-full max-w-xs"
        />
      </div>

      {/* Tabla + opciones + paginación */}
      <div className="bg-card flex flex-col gap-2 rounded-lg border">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="text-sm font-medium">Partidos por asignar</div>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={handleExport}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
          <DataTableViewOptions table={table} />
        </div>

        <div className="overflow-x-auto">
          <DataTable table={table} columns={columns} />
        </div>

        <div className="border-t">
          <DataTablePagination table={table} />
        </div>
      </div>
    </div>
  );
}
