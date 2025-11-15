// src/app/(main)/dashboard/assignments/_components/assignments-table.tsx
"use client";

import * as React from "react";
import { useTransition, useMemo, useState, useEffect } from "react";

import { useRouter } from "next/navigation";

import {
  ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CalendarDays, MapPin, ChevronsUpDown, Check, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { assignManualTernaAction, type AssignManualTernaData } from "@/server/actions/assignments.actions";

// Ajusta paths según tengas tus componentes

/* ---------- Tipos ---------- */

type LeagueDoc = {
  id: string;
  name: string;
  season?: string | null;
};

type GroupDoc = {
  id: string;
  name: string;
  leagueId: string;
};

type AssignmentMatchRow = {
  id: string;
  leagueId: string;
  leagueName: string;
  groupId: string;
  groupName: string;
  matchdayId: string;
  matchdayNumber: number | null;
  kickoff: string | null;
  category?: string | null;
  jornadaLabel?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string | null;
  centralRefereeId?: string | null;
  aa1RefereeId?: string | null;
  aa2RefereeId?: string | null;
  fourthRefereeId?: string | null;
  assessorRefereeId?: string | null;
  leagueColorHex?: string | null;
};

type RefereeOption = {
  id: string;
  name: string;
  status: string;
  canAssess: boolean; // 👈 viene directo del documento
};

// Estado interno por fila (para selects)
type AssignmentRowState = AssignmentMatchRow & {
  central: string;
  aa1: string;
  aa2: string;
  fourth: string;
  assessor: string;
};

type AssignmentTableMeta = {
  referees: RefereeOption[];
  isPendingGlobal: boolean;
  updateRow: (id: string, updater: (prev: AssignmentRowState) => AssignmentRowState) => void;
  onSaved: () => void;
};

type Props = {
  leagues: LeagueDoc[];
  groups: GroupDoc[];
  matches: AssignmentMatchRow[];
  referees: RefereeOption[];
};

/* ---------- Helper para Excel ---------- */

function buildExportRows(rows: AssignmentRowState[], referees: RefereeOption[], leagueById: Map<string, LeagueDoc>) {
  const getRefName = (id?: string | null) => (id ? (referees.find((r) => r.id === id)?.name ?? "") : "");

  return rows.map((m) => {
    const league = leagueById.get(m.leagueId);
    const kickoff = m.kickoff ? new Date(m.kickoff) : null;

    const fecha = kickoff
      ? kickoff.toLocaleString("es-MX", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    return {
      Liga: league?.name ?? m.leagueName,
      Grupo: m.groupName,
      Jornada: m.matchdayNumber ?? "",
      Fecha: fecha,
      "Equipo local": m.homeTeamName,
      "Equipo visitante": m.awayTeamName,
      Sede: m.venueName ?? "",
      Central: getRefName(m.central),
      "Asistente 1": getRefName(m.aa1),
      "Asistente 2": getRefName(m.aa2),
      "4º Árbitro": getRefName(m.fourth),
      Asesor: getRefName(m.assessor),
    };
  });
}

/* ---------- Componente principal ---------- */

export function AssignmentsTable({ leagues, groups, matches, referees }: Props) {
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

  const columns = useMemo<ColumnDef<AssignmentRowState>[]>(
    () => [
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
      // 👇 NUEVA columna: 4º Árbitro (opcional, también solo árbitros)
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
      // 👇 NUEVA columna: Asesor (solo asesores)
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
    ],
    [],
  );

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

  const handleExport = React.useCallback(() => {
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
      {/* Toolbar de filtros */}
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
                {lg.name}
                {"season" in lg && lg.season ? ` · ${lg.season}` : ""}
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

type ActionsCellProps = {
  row: AssignmentRowState;
  meta: AssignmentTableMeta;
};

function ActionsCell({ row: m, meta }: ActionsCellProps) {
  const [saving, setSaving] = React.useState(false);

  // La terna "completa" sigue siendo central + AA1 + AA2; 4º y asesor son opcionales
  const hasTerna = Boolean(m.central && m.aa1 && m.aa2);

  async function handleSave() {
    if (!m.central || !m.aa1 || !m.aa2) {
      toast.error("Debes seleccionar al menos Central y los dos Asistentes.");
      return;
    }

    try {
      setSaving(true);

      const centralName = meta.referees.find((r) => r.id === m.central)?.name ?? "";
      const aa1Name = meta.referees.find((r) => r.id === m.aa1)?.name ?? "";
      const aa2Name = meta.referees.find((r) => r.id === m.aa2)?.name ?? "";
      const fourthName = m.fourth ? (meta.referees.find((r) => r.id === m.fourth)?.name ?? "") : "";
      const assessorName = m.assessor ? (meta.referees.find((r) => r.id === m.assessor)?.name ?? "") : "";

      const fd = new FormData();
      fd.append("leagueId", m.leagueId);
      fd.append("groupId", m.groupId);
      fd.append("matchdayId", m.matchdayId);
      fd.append("matchId", m.id);

      fd.append("centralRefereeId", m.central);
      fd.append("aa1RefereeId", m.aa1);
      fd.append("aa2RefereeId", m.aa2);

      if (centralName) fd.append("centralRefereeName", centralName);
      if (aa1Name) fd.append("aa1RefereeName", aa1Name);
      if (aa2Name) fd.append("aa2RefereeName", aa2Name);

      // 👇 Nuevos campos opcionales
      if (m.fourth) {
        fd.append("fourthRefereeId", m.fourth);
        if (fourthName) fd.append("fourthRefereeName", fourthName);
      }

      if (m.assessor) {
        fd.append("assessorRefereeId", m.assessor);
        if (assessorName) fd.append("assessorRefereeName", assessorName);
      }

      const res = await assignManualTernaAction(fd);

      if (!res.ok) {
        toast.error(res.message ?? "No se pudo asignar la terna.");
        return;
      }

      const data = res.data;
      if (!data) {
        toast.error("Respuesta inesperada del servidor.");
        return;
      }

      if (data.code === "OK") {
        toast.success("Terna asignada correctamente.");
        meta.onSaved();
        return;
      }

      if (data.code === "REFEREE_NOT_AVAILABLE") {
        toast.error(`Uno o más árbitros no están disponibles: ${(data.unavailableRefs ?? []).join(", ")}`);
        return;
      }

      if (data.code === "RECENT_TEAM_CONFLICT") {
        toast.error(data.error ?? "Conflicto con equipos en últimas 4 jornadas.");
        console.log("Conflictos:", data.conflicts);
        return;
      }

      toast.error(data.error ?? "Error al asignar la terna.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Error al asignar la terna.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-3 py-2.5 text-center">
      <div className="flex flex-col items-center justify-center gap-1">
        <Button
          size="sm"
          variant={hasTerna ? "default" : "outline"}
          onClick={handleSave}
          disabled={saving || meta.isPendingGlobal}
        >
          {saving ? "Guardando…" : hasTerna ? "Actualizar" : "Asignar"}
        </Button>
        <Badge
          variant={hasTerna ? "default" : "outline"}
          className={cn("mt-0.5 text-[10px]", hasTerna && "border-emerald-200 bg-emerald-100 text-emerald-700")}
        >
          {hasTerna ? "Terna completa" : "Sin terna"}
        </Badge>
      </div>
    </div>
  );
}

/* ---------- Select de árbitros / asesores ---------- */

type RefereeSelectMode = "ALL" | "ARBITRO" | "ASESOR";

function RefereeSelect({
  value,
  onChange,
  referees,
  placeholder,
  mode = "ALL",
}: {
  value: string;
  onChange: (v: string) => void;
  referees: RefereeOption[];
  placeholder: string;
  mode?: RefereeSelectMode;
}) {
  const [open, setOpen] = React.useState(false);

  // Filtrado por rol (árbitro vs asesor) + orden alfabético
  const options = React.useMemo(() => {
    let list = referees;

    if (mode === "ARBITRO") {
      // Solo árbitros: canAssess === false
      list = list.filter((r) => !r.canAssess);
    } else if (mode === "ASESOR") {
      // Solo asesores: canAssess === true
      list = list.filter((r) => r.canAssess);
    }

    return [...list].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  }, [mode, referees]);

  const selected = options.find((r) => r.id === value) ?? referees.find((r) => r.id === value);
  const label = selected?.name ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between px-2 text-xs"
        >
          {label || <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${placeholder.toLowerCase()}...`} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-muted-foreground py-2 text-xs">No se encontraron coincidencias.</CommandEmpty>
            <CommandGroup>
              {/* Opción "Sin asignar" */}
              <CommandItem
                value="none"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs"
              >
                <Check className={cn("mr-2 h-3 w-3", value === "" ? "opacity-100" : "opacity-0")} />
                Sin asignar
              </CommandItem>

              {options.map((r) => (
                <CommandItem
                  key={r.id}
                  value={r.name}
                  onSelect={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3", value === r.id ? "opacity-100" : "opacity-0")} />
                  {r.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
