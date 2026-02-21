/* eslint-disable max-lines, complexity, func-call-spacing */
"use client";

import * as React from "react";
import { useTransition, useMemo, useState, useEffect, useCallback } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { FileSpreadsheet, RefreshCw, Sparkles, CheckCircle2, Users } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-current-user";
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
  type RowSnapshot,
} from "./assignments-types";

/** Normaliza texto para búsqueda: minúsculas, sin acentos, sin puntuación */
function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AssignmentsTable({ leagues, groups, matches, referees }: AssignmentsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();

  // Info del usuario
  const { userDoc } = useCurrentUser();

  // Mientras no tengamos rol, consideramos que sigue "cargando"
  const resolvedRole = (userDoc?.role as string | undefined) ?? null;
  const isRoleLoading = !resolvedRole;

  const role = resolvedRole ?? "DESCONOCIDO";

  const isRefereeView = role === "ARBITRO";
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO" || role === "ASISTENTE";

  // ✅ UX: si no hay árbitros cargados, mostramos alerta + bloqueamos generar ternas
  const hasReferees = referees.length > 0;

  const [filterLeagueId, setFilterLeagueId] = useState<string>("all");
  const [filterGroupId, setFilterGroupId] = useState<string>("all");

  const [globalSearch, setGlobalSearch] = useState<string>("");

  const [filterRefereeId, setFilterRefereeId] = useState<string>("all");

  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  const [isRecalcDialogOpen, setIsRecalcDialogOpen] = useState(false);

  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);

  /* ---------- Inicialización de filas ---------- */
  // Helper para inicializar el valor del select (ID o ext:LABEL)
  const getInitialValue = (id?: string | null, label?: string | null) => {
    if (id) return id;
    if (label) return `ext:${label}`;
    return "";
  };

  const [rowData, setRowData] = useState<AssignmentRowState[]>(() =>
    matches.map((m) => ({
      ...m,
      central: getInitialValue(m.centralRefereeId, m.centralExternalLabel),
      aa1: getInitialValue(m.aa1RefereeId, m.aa1ExternalLabel),
      aa2: getInitialValue(m.aa2RefereeId, m.aa2ExternalLabel),
      fourth: getInitialValue(m.fourthRefereeId, m.fourthExternalLabel),
      assessor: getInitialValue(m.assessorRefereeId, m.assessorExternalLabel),
    })),
  );

  /* ---------- Dirty tracking: baseline por fila ---------- */
  const [baselineById, setBaselineById] = useState<Map<string, RowSnapshot>>(() => {
    const map = new Map<string, RowSnapshot>();
    for (const m of matches) {
      map.set(m.id, {
        central: getInitialValue(m.centralRefereeId, m.centralExternalLabel),
        aa1: getInitialValue(m.aa1RefereeId, m.aa1ExternalLabel),
        aa2: getInitialValue(m.aa2RefereeId, m.aa2ExternalLabel),
        fourth: getInitialValue(m.fourthRefereeId, m.fourthExternalLabel),
        assessor: getInitialValue(m.assessorRefereeId, m.assessorExternalLabel),
      });
    }
    return map;
  });

  // Mapa indexado de rowData para búsqueda O(1) en isRowDirty
  const rowById = useMemo(() => {
    const map = new Map<string, AssignmentRowState>();
    for (const r of rowData) map.set(r.id, r);
    return map;
  }, [rowData]);

  const isRowDirty = useCallback(
    (id: string): boolean => {
      const row = rowById.get(id);
      const base = baselineById.get(id);
      if (!row || !base) return false;
      return (
        row.central !== base.central ||
        row.aa1 !== base.aa1 ||
        row.aa2 !== base.aa2 ||
        row.fourth !== base.fourth ||
        row.assessor !== base.assessor
      );
    },
    [rowById, baselineById],
  );

  const markRowSaved = useCallback((id: string, snapshot: RowSnapshot) => {
    setBaselineById((prev) => {
      const next = new Map(prev);
      next.set(id, snapshot);
      return next;
    });
  }, []);

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
      if (!id) return "";
      if (id.startsWith("ext:")) {
        return id.replace("ext:", "");
      }
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

  // Precomputed search index per row (accent-insensitive, all relevant fields)
  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of rowData) {
      const parts: string[] = [
        leagueById.get(m.leagueId)?.name ?? "",
        m.groupName ?? "",
        m.matchdayNumber != null ? String(m.matchdayNumber) : "",
        m.jornadaLabel ?? "",
        m.category ?? "",
        m.homeTeamName ?? "",
        m.awayTeamName ?? "",
        m.venueName ?? "",
        getRefDisplay(m.central),
        getRefDisplay(m.aa1),
        getRefDisplay(m.aa2),
        getRefDisplay(m.fourth),
        getRefDisplay(m.assessor),
        m.centralExternalLabel ?? "",
        m.aa1ExternalLabel ?? "",
        m.aa2ExternalLabel ?? "",
        m.fourthExternalLabel ?? "",
        m.assessorExternalLabel ?? "",
      ];
      map.set(m.id, normText(parts.join(" ")));
    }
    return map;
  }, [rowData, leagueById, getRefDisplay]);

  const isRangeActive = filterFrom !== "" || filterTo !== "";

  // Si cambian los matches desde el servidor (router.refresh), sincronizamos
  useEffect(() => {
    setRowData((prev) => {
      // Si es el mismo lote de partidos (misma cantidad y mismos IDs), NO resetees
      if (prev.length === matches.length) {
        const sameIds = prev.every((row, idx) => row.id === matches[idx]?.id);
        if (sameIds) return prev;
      }

      // También reseteamos baseline
      const newBaseline = new Map<string, RowSnapshot>();
      for (const m of matches) {
        newBaseline.set(m.id, {
          central: getInitialValue(m.centralRefereeId, m.centralExternalLabel),
          aa1: getInitialValue(m.aa1RefereeId, m.aa1ExternalLabel),
          aa2: getInitialValue(m.aa2RefereeId, m.aa2ExternalLabel),
          fourth: getInitialValue(m.fourthRefereeId, m.fourthExternalLabel),
          assessor: getInitialValue(m.assessorRefereeId, m.assessorExternalLabel),
        });
      }
      setBaselineById(newBaseline);

      return matches.map((m) => ({
        ...m,
        central: getInitialValue(m.centralRefereeId, m.centralExternalLabel),
        aa1: getInitialValue(m.aa1RefereeId, m.aa1ExternalLabel),
        aa2: getInitialValue(m.aa2RefereeId, m.aa2ExternalLabel),
        fourth: getInitialValue(m.fourthRefereeId, m.fourthExternalLabel),
        assessor: getInitialValue(m.assessorRefereeId, m.assessorExternalLabel),
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

    // 🎯 filtro por árbitro (en cualquier posición de la terna) — solo para vista normal
    if (!isRefereeView && filterRefereeId !== "all") {
      rows = rows.filter((m) => [m.central, m.aa1, m.aa2, m.fourth, m.assessor].some((rid) => rid === filterRefereeId));
    }

    // 🧭 rango de fechas / próximos
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (isRangeActive) {
      rows = rows.filter((m) => {
        const d = getMatchDate(m);
        if (!d) return true;

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
      rows = rows.filter((m) => {
        const d = getMatchDate(m);
        if (!d) return true;
        return d.getTime() >= todayStart.getTime();
      });
    }

    // 🔍 búsqueda global (multi-token AND, accent-insensitive)
    const tokens = normText(globalSearch)
      .split(" ")
      .filter((t) => t.length >= 2);
    if (tokens.length > 0) {
      rows = rows.filter((m) => {
        const idx = searchIndex.get(m.id) ?? "";
        return tokens.every((t) => idx.includes(t));
      });
    }

    // 🧊 ORDEN POR FECHA (ascendente)
    const sorted = [...rows].sort((a, b) => {
      const da = getMatchDate(a)?.getTime() ?? 0;
      const db = getMatchDate(b)?.getTime() ?? 0;
      return da - db;
    });

    // Vista ARBITRO: solo partidos con terna CONFIRMADA en Firestore
    const finalRows = isRefereeView
      ? sorted.filter((m) => {
          // En vista árbitro, consideramos "confirmado" si hay ID o Label
          const c = m.centralRefereeId ?? m.centralExternalLabel;
          const a1 = m.aa1RefereeId ?? m.aa1ExternalLabel;
          const a2 = m.aa2RefereeId ?? m.aa2ExternalLabel;
          return Boolean(c && a1 && a2);
        })
      : sorted;

    return finalRows;
  }, [
    rowData,
    filterLeagueId,
    filterGroupId,
    filterRefereeId,
    filterFrom,
    filterTo,
    globalSearch,
    searchIndex,
    getMatchDate,
    isRangeActive,
    isRefereeView,
  ]);

  const leagueOptions = useMemo(() => [{ id: "all", name: "Todas las ligas" }, ...leagues], [leagues]);

  const groupOptions = useMemo(() => {
    const base = [{ id: "all", name: "Todos los grupos", leagueId: "all" } as GroupDoc];
    return base.concat(filteredGroups);
  }, [filteredGroups]);

  /* ---------- Columnas TanStack ---------- */

  const columns = useMemo(() => createAssignmentsColumns(canEdit), [canEdit]);

  /* ---------- Instancia TanStack table ---------- */
  const table = useReactTable<AssignmentRowState>({
    data: filteredMatches,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: {
        pageSize: 50,
      },
      sorting: [],
    },
    meta: {
      referees,
      isPendingGlobal: isPending,
      canEdit,
      updateRow: (id, updater) =>
        setRowData((prev) =>
          prev.map((row) => {
            if (row.id !== id) return row;
            return updater(row);
          }),
        ),
      // Fase 2: no hacemos router.refresh() en saves individuales.
      // El server action ya invalida caches con revalidateTag;
      // el estado local (rowData) ya refleja la selección del usuario.
      // router.refresh() solo se usa en handleConfirmAll (acciones globales).
      onSaved: () => {},
      isRowDirty,
      markRowSaved,
    } satisfies AssignmentTableMeta,
  });

  /* ---------- Motor de sugerencias (normal + recalcular) ---------- */

  const runSuggestions = useCallback(
    async (targetRows: AssignmentRowState[], mode: "fill-missing" | "recalc-all") => {
      if (!canEdit) return; // seguridad extra

      try {
        setIsGeneratingSuggestions(true);

        const seedBase = Date.now().toString();

        const payload = {
          matches: targetRows.map((m, idx) => ({
            leagueId: m.leagueId,
            groupId: m.groupId,
            matchdayId: m.matchdayId,
            matchId: m.id,

            ignoreExistingAssignment: mode === "recalc-all" ? true : undefined,

            // ahora SIEMPRE mandamos variantSeed
            variantSeed: `${mode}-${seedBase}-${idx}`,
          })),
        };

        const res = await suggestAssignmentsForMatchesAction(payload);

        if (!res.ok) {
          toast.error(res.message ?? "No se pudieron generar las ternas sugeridas.");
          return;
        }

        const suggestions = res.data ?? [];

        if (suggestions.length === 0) {
          toast.info("No se generaron sugerencias para los partidos seleccionados.");
          return;
        }

        const byMatchId = new Map<string, (typeof suggestions)[number]>();
        for (const s of suggestions) {
          byMatchId.set(s.matchId, s);
        }

        setRowData((prev) =>
          prev.map((row) => {
            const sug = byMatchId.get(row.id);
            if (!sug || !sug.hasSuggestion) return row;

            // Modo normal: solo rellenar vacíos
            // Modo recalcular: sobreescribir lo que haya en pantalla
            if (mode !== "recalc-all" && (row.central || row.aa1 || row.aa2)) {
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

        if (mode === "recalc-all") {
          toast.success(
            "Se recalcularon ternas sugeridas para los partidos de la vista actual. Revisa y guarda las que necesites.",
          );
        } else {
          toast.success("Ternas sugeridas generadas para los partidos sin terna. Revisa y guarda las que necesites.");
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err?.message ?? "Error al generar ternas sugeridas.");
      } finally {
        setIsGeneratingSuggestions(false);
      }
    },
    [canEdit],
  );

  /* ---------- Generar ternas sugeridas ---------- */

  const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false);

  const handleGenerateSuggestions = useCallback(async () => {
    if (!canEdit) return;

    // ✅ Bloqueo UX (y seguridad de UI)
    if (!hasReferees) {
      toast.error("No hay árbitros creados para este delegado. Registra árbitros antes de generar ternas.");
      return;
    }

    const coreRows = table.getPrePaginationRowModel().rows;
    const rows = coreRows.map((r) => r.original);

    const rowsWithoutTerna = rows.filter((m) => !m.central && !m.aa1 && !m.aa2);

    // Primera vez: llenar huecos
    if (!hasGeneratedOnce && rowsWithoutTerna.length > 0) {
      await runSuggestions(rowsWithoutTerna, "fill-missing");
      setHasGeneratedOnce(true);
      return;
    }

    // Si no hay partidos en la vista
    if (rows.length === 0) {
      toast.info("No hay partidos en la vista actual.");
      return;
    }

    // A partir de aquí siempre mostramos el diálogo de recalcular
    setIsRecalcDialogOpen(true);
  }, [table, runSuggestions, hasGeneratedOnce, canEdit, hasReferees]);

  /* ---------- Confirmar recalcular (diálogo) ---------- */

  const handleConfirmRecalc = useCallback(async () => {
    if (!canEdit) return;

    setIsRecalcDialogOpen(false);

    const coreRows = table.getPrePaginationRowModel().rows;
    const rows = coreRows.map((r) => r.original);

    await runSuggestions(rows, "recalc-all");
  }, [table, runSuggestions, canEdit]);

  /* ---------- Confirmar todas las ternas (sugeridas / editadas) ---------- */

  const handleConfirmAll = useCallback(async () => {
    if (!canEdit) return;

    try {
      setIsConfirmingAll(true);

      // Filas actuales SIN paginación (pero ya filtradas)
      const coreRows = table.getPrePaginationRowModel().rows;
      const rows = coreRows.map((r) => r.original);

      // Helper para extraer ID vs Label
      const parseVal = (val: string) => {
        if (!val) return { id: null, label: null };
        if (val.startsWith("ext:")) {
          return { id: null, label: val.replace("ext:", "") };
        }
        return { id: val, label: null };
      };

      // Tomamos solo las que:
      // 1) Tienen terna completa en el UI (central / aa1 / aa2) - Requisito base
      // 2) Cambiaron respecto a lo que venía desde el servidor (incluyendo 4to y asesor)
      const toConfirm = rows.filter((row) => {
        if (!row.central || !row.aa1 || !row.aa2) return false;

        const origCentral = getInitialValue(row.centralRefereeId, row.centralExternalLabel);
        const origAa1 = getInitialValue(row.aa1RefereeId, row.aa1ExternalLabel);
        const origAa2 = getInitialValue(row.aa2RefereeId, row.aa2ExternalLabel);
        const origFourth = getInitialValue(row.fourthRefereeId, row.fourthExternalLabel);
        const origAssessor = getInitialValue(row.assessorRefereeId, row.assessorExternalLabel);

        const changed =
          row.central !== origCentral ||
          row.aa1 !== origAa1 ||
          row.aa2 !== origAa2 ||
          row.fourth !== origFourth ||
          row.assessor !== origAssessor;

        return changed;
      });

      if (toConfirm.length === 0) {
        toast.info("No hay cambios de ternas por confirmar en la vista actual.");
        return;
      }

      const payloadMatches = toConfirm.map((row) => {
        const c = parseVal(row.central);
        const a1 = parseVal(row.aa1);
        const a2 = parseVal(row.aa2);
        const f = parseVal(row.fourth);
        const as = parseVal(row.assessor);

        return {
          leagueId: row.leagueId,
          groupId: row.groupId,
          matchdayId: row.matchdayId,
          matchId: row.id,

          centralRefereeId: c.id,
          centralExternalLabel: c.label,
          aa1RefereeId: a1.id,
          aa1ExternalLabel: a1.label,
          aa2RefereeId: a2.id,
          aa2ExternalLabel: a2.label,
          fourthRefereeId: f.id,
          fourthExternalLabel: f.label,
          assessorRefereeId: as.id,
          assessorExternalLabel: as.label,

          // Nombres calculados para display histórico
          centralRefereeName: c.id ? getRefDisplay(c.id) : c.label,
          aa1RefereeName: a1.id ? getRefDisplay(a1.id) : a1.label,
          aa2RefereeName: a2.id ? getRefDisplay(a2.id) : a2.label,
          fourthRefereeName: f.id ? getRefDisplay(f.id) : f.label,
          assessorRefereeName: as.id ? getRefDisplay(as.id) : as.label,
        };
      });

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

        // Actualizar baseline de las filas confirmadas
        setBaselineById((prev) => {
          const next = new Map(prev);
          for (const row of toConfirm) {
            next.set(row.id, {
              central: row.central,
              aa1: row.aa1,
              aa2: row.aa2,
              fourth: row.fourth,
              assessor: row.assessor,
            });
          }
          return next;
        });
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
  }, [table, getRefDisplay, startTransition, router, canEdit]);

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

  // 🔄 Refresh manual (Fase 2: el usuario decide cuándo recargar)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [, forceTickUpdate] = useState(0);

  const handleManualRefresh = useCallback(() => {
    startRefreshTransition(() => {
      router.refresh();
    });
    setLastRefreshedAt(Date.now());
  }, [router]);

  // Tick cada 10s para actualizar el label relativo
  useEffect(() => {
    if (lastRefreshedAt === null) return;
    const id = setInterval(() => forceTickUpdate((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [lastRefreshedAt]);

  /* ---------- LOADING DE ROL: evitamos el parpadeo ---------- */

  if (isRoleLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 md:px-4">
          <div className="text-muted-foreground text-sm">Cargando designaciones…</div>
        </div>
        <div className="bg-card rounded-lg border">
          <div className="space-y-3 p-4">
            <div className="bg-muted h-8 w-40 animate-pulse rounded-md" />
            <div className="bg-muted h-[320px] w-full animate-pulse rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  /* ---------- RENDER NORMAL ---------- */

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

      {/* ✅ Alert UX cuando no hay árbitros */}
      {canEdit && !hasReferees && (
        <Alert className="border-border bg-muted/40">
          <Users className="h-4 w-4" />
          <div>
            <AlertTitle>No hay árbitros creados</AlertTitle>
            <AlertDescription className="mt-1">
              Para poder generar ternas sugeridas, primero registra árbitros para este delegado.
              <div className="mt-3">
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/referees/new">Crear árbitro</Link>
                </Button>
              </div>
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Tabla + opciones + paginación */}
      <div className="bg-card flex flex-col gap-2 rounded-lg border">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="text-sm font-medium">
            {isRangeActive ? "Partidos (vista por rango de fechas)" : "Partidos próximos por asignar"}
          </div>
          <div className="flex-1" />

          {/* Acciones de edición solo para roles con permiso */}
          {canEdit && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={handleGenerateSuggestions}
                disabled={isGeneratingSuggestions || isPending || !hasReferees}
                title={!hasReferees ? "Debes crear árbitros primero" : undefined}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isGeneratingSuggestions ? "Generando…" : "Generar ternas sugeridas"}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleConfirmAll} disabled={isConfirmingAll || isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isConfirmingAll ? "Confirmando…" : "Confirmar todas las ternas"}
              </Button>
            </>
          )}

          {/* Exportar lo puedes dejar visible o también limitar, como prefieras */}
          <Button size="sm" variant="outline" onClick={handleExport}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>

          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={handleManualRefresh} disabled={isRefreshing || isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Actualizando…" : "Actualizar"}
            </Button>
            {lastRefreshedAt !== null && !isRefreshing && (
              <span className="text-muted-foreground text-[11px] leading-none">
                {(() => {
                  const secs = Math.floor((Date.now() - lastRefreshedAt) / 1000);
                  if (secs < 10) return "Actualizado justo ahora";
                  if (secs < 60) return `Actualizado hace ${secs}s`;
                  const mins = Math.floor(secs / 60);
                  return `Actualizado hace ${mins}m`;
                })()}
              </span>
            )}
          </div>

          <DataTableViewOptions table={table} />
        </div>

        <div className="overflow-x-auto">
          <DataTable table={table} columns={columns} />
        </div>

        <div className="border-t">
          <DataTablePagination table={table} />
        </div>
      </div>

      <Dialog open={isRecalcDialogOpen} onOpenChange={setIsRecalcDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recalcular ternas sugeridas</DialogTitle>
            <DialogDescription>
              Todos los partidos de la vista actual ya tienen una terna asignada. Si continúas, generaré nuevas ternas
              sugeridas y reemplazaré las que ves en pantalla.
              <br />
              <br />
              <span className="font-medium">Nada se guardará en la base de datos hasta que confirmes las ternas.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRecalcDialogOpen(false)}
              disabled={isGeneratingSuggestions}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirmRecalc} disabled={isGeneratingSuggestions}>
              {isGeneratingSuggestions ? "Recalculando…" : "Recalcular ternas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
