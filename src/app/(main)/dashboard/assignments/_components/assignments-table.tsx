"use client";

// src/app/(main)/dashboard/assignments/_components/assignments-table.tsx

import * as React from "react";
import { useTransition, useMemo, useState, useEffect, useCallback } from "react";

import { useRouter } from "next/navigation";

import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { FileSpreadsheet, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { suggestAssignmentsForMatchesAction } from "@/server/actions/assignments-suggestions.actions";
import { confirmSuggestedAssignmentsAction } from "@/server/actions/assignments.actions";

import { createAssignmentsColumns } from "./assignments-columns";
import { buildExportRows } from "./assignments-export";
import {
  type LeagueDoc,
  type GroupDoc,
  type AssignmentRowState,
  type RefereeOption,
  type AssignmentTableMeta,
  type AssignmentsTableProps,
} from "./assignments-types";

export function AssignmentsTable({ leagues, groups, matches, referees }: AssignmentsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [filterLeagueId, setFilterLeagueId] = useState<string>("all");
  const [filterGroupId, setFilterGroupId] = useState<string>("all");

  const [globalSearch, setGlobalSearch] = useState<string>("");

  const [filterRefereeId, setFilterRefereeId] = useState<string>("all");

  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);

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

  // Mapa de árbitros para buscar por nombre fácilmente
  const refereesById = useMemo(() => {
    const map = new Map<string, RefereeOption>();
    referees.forEach((r) => map.set(r.id, r));
    return map;
  }, [referees]);

  const getRefDisplay = useCallback(
    (id: string) => {
      const r = refereesById.get(id);
      if (!r) return id;
      const anyRef = r as any;
      return anyRef.name ?? anyRef.label ?? id;
    },
    [refereesById],
  );

  // Helper para obtener la fecha del partido
  const getMatchDate = useCallback((row: AssignmentRowState): Date | null => {
    const anyRow = row as any;
    const value = anyRow.kickoff ?? anyRow.date ?? anyRow.matchDate ?? anyRow.matchDateTime;
    if (!value) return null;

    if (value instanceof Date) return value;
    // Firestore Timestamp
    if (value?.toDate) {
      try {
        return value.toDate();
      } catch {
        /* ignore */
      }
    }
    try {
      return new Date(value);
    } catch {
      return null;
    }
  }, []);

  const isRangeActive = filterFrom !== "" || filterTo !== "";

  // Si cambian los matches desde el servidor (router.refresh), sincronizamos
  useEffect(() => {
    setRowData((prev) => {
      // Si es el mismo lote de partidos (misma cantidad y mismos IDs), NO resetees
      if (prev.length === matches.length) {
        const sameIds = prev.every((row, idx) => row.id === matches[idx]?.id);
        if (sameIds) return prev;
      }

      return matches.map((m) => ({
        ...m,
        central: m.centralRefereeId ?? "",
        aa1: m.aa1RefereeId ?? "",
        aa2: m.aa2RefereeId ?? "",
        fourth: m.fourthRefereeId ?? "",
        assessor: m.assessorRefereeId ?? "",
      }));
    });
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

    // 🎯 filtro por árbitro (en cualquier posición de la terna)
    if (filterRefereeId !== "all") {
      rows = rows.filter((m) => [m.central, m.aa1, m.aa2, m.fourth, m.assessor].some((rid) => rid === filterRefereeId));
    }

    // 🧭 comportamiento especial:
    // - Si NO hay rango de fechas → solo partidos desde hoy (próximos)
    // - Si SÍ hay rango → usamos únicamente ese rango (puede incluir pasados)
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (isRangeActive) {
      // 📅 filtro por rango de fechas explícito
      rows = rows.filter((m) => {
        const d = getMatchDate(m);
        if (!d) return true; // si no hay fecha, no lo sacamos del listado

        const time = d.getTime();

        if (filterFrom) {
          const fromTime = new Date(`${filterFrom}T00:00:00`).getTime();
          if (time < fromTime) return false;
        }
        if (filterTo) {
          const toTime = new Date(`${filterTo}T23:59:59`).getTime();
          if (time > toTime) return false;
        }
        return true;
      });
    } else {
      // 👀 Vista general: solo próximos
      rows = rows.filter((m) => {
        const d = getMatchDate(m);
        if (!d) return true;
        return d.getTime() >= todayStart.getTime();
      });
    }

    // 🔍 búsqueda global (equipo, liga, árbitros)
    if (globalSearch.trim().length > 0) {
      const q = globalSearch.trim().toLowerCase();
      rows = rows.filter((m) => {
        const leagueName = leagueById.get(m.leagueId)?.name ?? "";

        const texts: string[] = [
          m.homeTeamName ?? "",
          m.awayTeamName ?? "",
          leagueName,
          String((m as any).matchdayNumber ?? ""),
        ];

        const refIds = [m.central, m.aa1, m.aa2, m.fourth, m.assessor].filter(Boolean);
        for (const rid of refIds) {
          texts.push(getRefDisplay(rid));
        }

        return texts.some((t) => t.toLowerCase().includes(q));
      });
    }

    return rows;
  }, [
    rowData,
    filterLeagueId,
    filterGroupId,
    filterRefereeId,
    filterFrom,
    filterTo,
    globalSearch,
    leagueById,
    getMatchDate,
    getRefDisplay,
    isRangeActive,
  ]);

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

  /* ---------- Generar ternas sugeridas ---------- */

  const handleGenerateSuggestions = useCallback(async () => {
    try {
      setIsGeneratingSuggestions(true);

      // Filas actuales SIN paginación (pero ya filtradas por liga/grupo/fechas)
      const coreRows = table.getPrePaginationRowModel().rows;
      const rows = coreRows.map((r) => r.original);

      // 🎯 SOLO partidos sin terna (nada en central / AA1 / AA2)
      const rowsWithoutTerna = rows.filter((m) => !m.central && !m.aa1 && !m.aa2);

      if (rowsWithoutTerna.length === 0) {
        toast.info("Todos los partidos de la vista actual ya tienen terna.");
        return;
      }

      const payload = {
        matches: rowsWithoutTerna.map((m) => ({
          leagueId: m.leagueId,
          groupId: m.groupId,
          matchdayId: m.matchdayId,
          matchId: m.id,
        })),
      };

      const res = await suggestAssignmentsForMatchesAction(payload);

      if (!res.ok) {
        toast.error(res.message ?? "No se pudieron generar las ternas sugeridas.");
        return;
      }

      const suggestions = res.data ?? [];

      if (suggestions.length === 0) {
        toast.info("No se generaron sugerencias para los partidos sin terna.");
        return;
      }

      const byMatchId = new Map<string, (typeof suggestions)[number]>();
      for (const s of suggestions) {
        byMatchId.set(s.matchId, s);
      }

      setRowData((prev) =>
        prev.map((row) => {
          const sug = byMatchId.get(row.id);
          // 🔒 extra: si por cualquier cosa este partido ya tiene terna, no lo tocamos
          if (!sug || !sug.hasSuggestion || row.central || row.aa1 || row.aa2) {
            return row;
          }

          return {
            ...row,
            central: sug.centralRefereeId ?? row.central,
            aa1: sug.aa1RefereeId ?? row.aa1,
            aa2: sug.aa2RefereeId ?? row.aa2,
            assessor: sug.assessorRefereeId ?? row.assessor,
          };
        }),
      );

      toast.success("Ternas sugeridas generadas para los partidos sin terna. Revisa y guarda las que necesites.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Error al generar ternas sugeridas.");
    } finally {
      setIsGeneratingSuggestions(false);
    }
  }, [table]);

  /* ---------- Confirmar todas las ternas (sugeridas / editadas) ---------- */

  const handleConfirmAll = useCallback(async () => {
    try {
      setIsConfirmingAll(true);

      // Filas actuales SIN paginación (pero ya filtradas)
      const coreRows = table.getPrePaginationRowModel().rows;
      const rows = coreRows.map((r) => r.original);

      // Tomamos solo las que:
      // 1) Tienen terna completa en el UI (central / aa1 / aa2)
      // 2) Cambiaron respecto a lo que venía desde el servidor (centralRefereeId/aa1RefereeId/aa2RefereeId)
      const toConfirm = rows.filter((row) => {
        if (!row.central || !row.aa1 || !row.aa2) return false;

        const origCentral = row.centralRefereeId ?? "";
        const origAa1 = row.aa1RefereeId ?? "";
        const origAa2 = row.aa2RefereeId ?? "";

        const changed = row.central !== origCentral || row.aa1 !== origAa1 || row.aa2 !== origAa2;

        return changed;
      });

      if (toConfirm.length === 0) {
        toast.info("No hay cambios de ternas por confirmar en la vista actual.");
        return;
      }

      const payloadMatches = toConfirm.map((row) => ({
        leagueId: row.leagueId,
        groupId: row.groupId,
        matchdayId: row.matchdayId,
        matchId: row.id,
        centralRefereeId: row.central,
        aa1RefereeId: row.aa1,
        aa2RefereeId: row.aa2,
        centralRefereeName: row.central ? getRefDisplay(row.central) : null,
        aa1RefereeName: row.aa1 ? getRefDisplay(row.aa1) : null,
        aa2RefereeName: row.aa2 ? getRefDisplay(row.aa2) : null,
      }));

      const res = await confirmSuggestedAssignmentsAction({
        matches: payloadMatches,
      });

      if (!res.ok) {
        toast.error(res.message ?? "Error al confirmar las ternas.");
        return;
      }

      const updatedCount = res.data?.updatedCount ?? toConfirm.length;

      if (updatedCount === 0) {
        toast.info("No se confirmó ninguna terna. Verifica que haya cambios pendientes.");
      } else {
        toast.success(`Se confirmaron ${updatedCount} ternas.`);
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Error al confirmar las ternas.");
    } finally {
      setIsConfirmingAll(false);
    }
  }, [table, getRefDisplay, startTransition, router]);

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

  // 🔁 handler para limpiar todos los filtros rápido
  const handleClearFilters = useCallback(() => {
    setFilterLeagueId("all");
    setFilterGroupId("all");
    setFilterRefereeId("all");
    setFilterFrom("");
    setFilterTo("");
    setGlobalSearch("");
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar de filtros (shadcn Select + inputs) */}
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 md:px-4">
        {/* Liga */}
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

        {/* Grupo */}
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

        {/* Fecha desde / hasta */}
        <Input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="w-[140px]"
          aria-label="Fecha desde"
        />
        <Input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="w-[140px]"
          aria-label="Fecha hasta"
        />

        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="ml-auto">
          Limpiar filtros
        </Button>

        {/* Búsqueda global */}
        <Input
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder={
            isRangeActive
              ? "Buscar en el rango (equipo, árbitro, liga)…"
              : "Buscar en próximos (equipo, árbitro, liga)…"
          }
          className="w-full max-w-xs md:ml-2"
        />
      </div>

      {/* Tabla + opciones + paginación */}
      <div className="bg-card flex flex-col gap-2 rounded-lg border">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="text-sm font-medium">
            {isRangeActive ? "Partidos (vista por rango de fechas)" : "Partidos próximos por asignar"}
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="default"
            onClick={handleGenerateSuggestions}
            disabled={isGeneratingSuggestions || isPending}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isGeneratingSuggestions ? "Generando…" : "Generar ternas sugeridas"}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleConfirmAll} disabled={isConfirmingAll || isPending}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {isConfirmingAll ? "Confirmando…" : "Confirmar todas las ternas"}
          </Button>
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
