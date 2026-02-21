"use client";

import * as React from "react";

import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Maximize2,
  Minimize2,
  SkipForward,
  Upload,
  X,
  XIcon,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { importFmfExcelAction } from "@/server/actions/fmf-import.actions";
import type {
  FmfImportResult,
  FmfRowResult,
  OverridesByRow,
  RelocationSuggestion,
  TeamMatchMeta,
} from "@/server/actions/fmf-import.types";

// ─── Constants (mirror of ALLOWED in server action, for display only) ────────
const GROUP_LABEL_BY_ID_CLIENT: Record<string, string> = {
  NAK2FN6ZgXi8MbhzSnAW: "LTDP GRUPO 13",
  C1ck0Sl8qOs6U0bFlV3B: "LTDP GRUPO 14",
  knIIB4rj611CsE2Z2YJq: "LTDP GRUPO 15",
  BUXXff1MmrC0ALp5onKV: "LTDP FEMENIL GRUPO 4",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "ok" | "error" | "skipped";
type Props = { leagueId: string; groupId: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: FmfRowResult["status"] }) {
  if (status === "ok") return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />;
  if (status === "error") return <AlertTriangle className="size-3.5 shrink-0 text-red-500" />;
  return <SkipForward className="size-3.5 shrink-0 text-amber-500" />;
}

function StatusBadge({ status }: { status: FmfRowResult["status"] }) {
  if (status === "ok")
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        OK
      </Badge>
    );
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return (
    <Badge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
      Duplicado
    </Badge>
  );
}

function AutoMatchBadge({ meta }: { meta?: TeamMatchMeta }) {
  if (!meta || meta.method !== "score_auto") return null;
  const pct = meta.score != null ? Math.round(meta.score * 100) : "?";
  return (
    <span
      className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-1 py-px text-[9px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300"
      title={`Detectado por similitud: "${meta.dbName}" (${pct}%)`}
    >
      Auto {pct}%
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="text-muted-foreground hover:text-foreground rounded p-1 transition"
      title="Copiar"
    >
      {copied ? <ClipboardCheck className="size-3.5" /> : <Clipboard className="size-3.5" />}
    </button>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ row, relocationTarget }: { row: FmfRowResult | null; relocationTarget?: string | null }) {
  if (!row) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
        <FileSpreadsheet className="size-8 opacity-30" />
        <p>Selecciona una fila para ver el detalle</p>
      </div>
    );
  }

  const errors = row.message && row.status === "error" ? row.message.split(" | ") : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4">
        {/* Relocation banner (top priority when active) */}
        {relocationTarget && (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            <ArrowRightLeft className="size-3.5 shrink-0" />
            <span>
              Esta fila será creada en: <strong>{relocationTarget}</strong>
            </span>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2">
          <StatusIcon status={row.status} />
          <StatusBadge status={row.status} />
          <span className="text-muted-foreground text-xs">Fila #{row.rowNumber}</span>
        </div>

        {/* Raw data */}
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Datos del Excel</h4>
          <div className="space-y-1.5 rounded-lg border p-3 text-sm">
            <DetailRow label="Categoría" value={row.categoria} />
            <DetailRow label="Jornada" value={row.jornada != null ? String(row.jornada) : "—"} />
            <DetailRow label="Local" value={row.local || "—"} />
            <DetailRow label="Visitante" value={row.visitante || "—"} />
            <DetailRow label="Árbitros" value={row.arbitros || "—"} />
          </div>
        </section>

        {/* Errors */}
        {errors.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold tracking-wider text-red-600 uppercase dark:text-red-400">
              Errores ({errors.length})
            </h4>
            <ul className="space-y-1.5">
              {errors.map((err, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                >
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>{err.trim()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Skipped info */}
        {row.status === "skipped" && (
          <section>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Este partido ya existe en Firestore (mismo local, visitante y horario). Se omitió para evitar duplicados.
            </div>
          </section>
        )}

        {/* OK info */}
        {row.status === "ok" && (
          <section>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              Fila válida. Lista para importar.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 shrink-0 text-xs">{label}</span>
      <span className="min-w-0 text-xs font-medium break-all">{value}</span>
    </div>
  );
}

// ─── Debug Panel ──────────────────────────────────────────────────────────────

function DebugPanel({ debug }: { debug: FmfImportResult["debug"] }) {
  const [open, setOpen] = React.useState(false);
  if (!debug) return null;

  const sampleJson = JSON.stringify(debug.sampleRows[0] ?? {}, null, 2);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-amber-700 dark:text-amber-400"
      >
        <span>🔍 Debug: columnas detectadas ({debug.headers.length})</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-amber-200 px-3 pt-2 pb-3 dark:border-amber-900">
          {/* Header chips */}
          <div className="mb-2 flex flex-wrap gap-1">
            {debug.headers.map((h) => (
              <span
                key={h}
                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 font-mono text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                {h}
              </span>
            ))}
          </div>

          {/* Sample row */}
          {debug.sampleRows.length > 0 && (
            <div className="relative">
              <div className="absolute top-1 right-1">
                <CopyButton text={sampleJson} />
              </div>
              <pre className="max-h-[140px] overflow-auto rounded border bg-white p-2 font-mono text-[10px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                {sampleJson}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({
  summary,
  mode,
  result,
}: {
  summary: FmfImportResult["summary"];
  mode: "idle" | "validated" | "committed";
  result: FmfImportResult;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="secondary">{summary.total} filas</Badge>
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">{summary.valid} válidos</Badge>
      {summary.invalid > 0 && <Badge variant="destructive">{summary.invalid} errores</Badge>}
      {summary.skipped > 0 && (
        <Badge className="border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {summary.skipped} duplicados
        </Badge>
      )}
      {summary.toCreateMatchdays > 0 && <Badge variant="outline">{summary.toCreateMatchdays} jornadas por crear</Badge>}
      {mode === "committed" && result.ok && (
        <>
          {(result.createdMatchdays ?? 0) > 0 && (
            <Badge className="bg-blue-600 text-white">{result.createdMatchdays} jornadas creadas</Badge>
          )}
          <Badge className="bg-emerald-700 text-white">{result.createdMatches ?? 0} partidos creados</Badge>
        </>
      )}
    </div>
  );
}

// ─── Template Download ───────────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  "FECHA",
  "CATEGORIA",
  "JORNADA",
  "EQUIPOLOCAL",
  "EQUIPOVISITANTE",
  "ARBITRO",
  "ARBITRO ASISTENTE 1",
  "ARBITRO ASISTENTE 2",
  "CUARTO ARBITRO",
  "ASESOR",
  "HORA",
  "ESTADIO",
] as const;

const TEMPLATE_EXAMPLE_ROW = [
  "2025-03-15",
  "LTDP GRUPO 13",
  "1",
  "EQUIPO A",
  "EQUIPO B",
  "",
  "",
  "",
  "",
  "",
  "16:00",
  "ESTADIO MUNICIPAL",
];

async function downloadTemplate() {
  const XLSX = await import("xlsx");

  const data = [TEMPLATE_HEADERS as unknown as string[], TEMPLATE_EXAMPLE_ROW];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths based on header lengths
  ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 16) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PARTIDOS");

  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "PLANTILLA_PARTIDOS_LTDP.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;

export function FmfImportDialog({ leagueId: _leagueId, groupId: _groupId }: Props) {
  const [open, setOpen] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<FmfImportResult | null>(null);
  const [mode, setMode] = React.useState<"idle" | "validated" | "committed">("idle");

  // Table state
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [jornadaFilter, setJornadaFilter] = React.useState<string>("all");
  const [pageSize, setPageSize] = React.useState<(typeof PAGE_SIZE_OPTIONS)[number]>(100);
  const [page, setPage] = React.useState(0);

  // Override state (team suggestions selected by user)
  const [overrides, setOverrides] = React.useState<OverridesByRow>({});

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => {
    setFile(null);
    setFileName("");
    setResult(null);
    setMode("idle");
    setSelectedIdx(null);
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setJornadaFilter("all");
    setPage(0);
    setOverrides({});
  };

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      setFile(f);
      setFileName(f.name);
      setResult(null);
      setMode("idle");
      setSelectedIdx(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) {
      setFile(f);
      setFileName(f.name);
      setResult(null);
      setMode("idle");
      setSelectedIdx(null);
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!file) return;
    setBusy(true);
    setSelectedIdx(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "validate");
      // Send overrides for re-validation
      if (Object.keys(overrides).length > 0) {
        fd.append("overridesByRow", JSON.stringify(overrides));
      }
      const res = await importFmfExcelAction(fd);
      setResult(res);
      setMode("validated");
      setPage(0);
      if (res.ok) {
        toast.success(`Validación OK: ${res.summary.valid} partidos listos.`);
      } else {
        toast.error(`${res.summary.invalid} filas con errores. Revisa el detalle.`);
        setStatusFilter("error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error inesperado al validar.");
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "commit");
      if (Object.keys(overrides).length > 0) {
        fd.append("overridesByRow", JSON.stringify(overrides));
      }
      const res = await importFmfExcelAction(fd);
      setResult(res);
      setMode("committed");
      if (res.ok) {
        toast.success(`Importado: ${res.createdMatches ?? 0} partidos, ${res.createdMatchdays ?? 0} jornadas creadas.`);
      } else {
        toast.error("Error al importar. Revisa los detalles.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error inesperado al importar.");
    } finally {
      setBusy(false);
    }
  };

  const handleCommitValid = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "commit_valid");
      if (Object.keys(overrides).length > 0) {
        fd.append("overridesByRow", JSON.stringify(overrides));
      }
      const res = await importFmfExcelAction(fd);
      setResult(res);

      if (res.ok) {
        // All valid! This happens if invalidRemaining === 0
        setMode("committed");
        toast.success(
          `Importación completa: ${res.createdMatches ?? 0} partidos, ${res.createdMatchdays ?? 0} jornadas.`,
        );
      } else {
        // Partial success
        const saved = res.createdMatches ?? 0;
        const remaining = res.invalidRemaining ?? res.summary.invalid;

        if (saved > 0 || (res.createdMatchdays ?? 0) > 0) {
          toast.success(`Guardados: ${saved} partidos. Quedan ${remaining} filas con error.`);
        } else {
          toast.info("No se crearon nuevos registros (posibles duplicados).");
        }
        // Keep mode="validated" to allow fixing remaining
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error inesperado al guardar válidos.");
    } finally {
      setBusy(false);
    }
  };

  // ── Derived filter data ────────────────────────────────────────────────────
  const allRows = result?.rows ?? [];

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) if (r.categoria) set.add(r.categoria);
    return Array.from(set).sort();
  }, [allRows]);

  const jornadas = React.useMemo(() => {
    const set = new Set<number>();
    for (const r of allRows) if (r.jornada != null) set.add(r.jornada);
    return Array.from(set).sort((a, b) => a - b);
  }, [allRows]);

  const filteredRows = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return allRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (categoryFilter !== "all" && r.categoria !== categoryFilter) return false;
      if (jornadaFilter !== "all" && String(r.jornada) !== jornadaFilter) return false;
      if (q) {
        const haystack = `${r.local} ${r.visitante} ${r.arbitros} ${r.categoria}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, statusFilter, categoryFilter, jornadaFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const selectedRow = selectedIdx != null ? (allRows[selectedIdx] ?? null) : null;

  // Reset page when filters change
  React.useEffect(() => {
    setPage(0);
  }, [search, statusFilter, categoryFilter, jornadaFilter, pageSize]);

  // Check if user has overrides set for all team-error rows
  const hasOverridesToRevalidate = React.useMemo(() => {
    if (!result || result.ok) return false;
    return Object.keys(overrides).length > 0;
  }, [result, overrides]);

  /** Helper: set an override for a row */
  const setOverride = (rowNumber: number, field: "homeTeamId" | "awayTeamId", value: string | undefined) => {
    setOverrides((prev) => {
      const existing = prev[rowNumber] ?? {};
      const updated = { ...existing, [field]: value };
      // Clean up empty overrides
      if (!updated.homeTeamId && !updated.awayTeamId && !updated.targetGroupId) {
        const next = { ...prev };
        delete next[rowNumber];
        return next;
      }
      return { ...prev, [rowNumber]: updated };
    });
  };

  /** Helper: set relocation override for a row */
  const setRelocation = (rowNumber: number, relocation: RelocationSuggestion | null) => {
    setOverrides((prev) => {
      if (!relocation) {
        // Clear relocation (and team overrides that came with it)
        const next = { ...prev };
        delete next[rowNumber];
        return next;
      }
      return {
        ...prev,
        [rowNumber]: {
          targetGroupId: relocation.targetGroupId,
          targetLeagueId: relocation.targetLeagueId,
          // Auto-set team IDs from the relocation suggestion
          ...(relocation.home ? { homeTeamId: relocation.home.teamId } : {}),
          ...(relocation.away ? { awayTeamId: relocation.away.teamId } : {}),
        },
      };
    });
  };

  // ── Sizes (inline style bypasses Shadcn's sm:max-w-lg) ───────────────────
  const dialogStyle: React.CSSProperties = fullscreen
    ? { width: "98vw", height: "95vh", maxWidth: "none", maxHeight: "none" }
    : { width: "95vw", maxWidth: "1400px", height: "90vh", maxHeight: "90vh" };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          reset();
          setFullscreen(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="mr-1.5 size-4" />
          Importar jornadas con partidos
        </Button>
      </DialogTrigger>

      {/* Use Radix primitive directly to bypass Shadcn's hardcoded sm:max-w-lg */}
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          style={dialogStyle}
          className="bg-background data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-lg border p-0 shadow-xl transition-all duration-200"
        >
          {/* Visually hidden title for screen-reader accessibility (WAI-ARIA requirement) */}
          <DialogPrimitive.Title className="sr-only">Importar Excel FMF</DialogPrimitive.Title>
          {/* ── Header ── */}
          <div className="shrink-0 border-b px-5 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base leading-none font-semibold tracking-tight">Importar Excel FMF</h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  Columnas: CATEGORIA · JORNADA · FECHA · HORA · LOCAL · VISITANTE · ESTADIO · ARBITRO · AA1 · AA2 ·
                  ASESOR
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => setFullscreen((v) => !v)}
                  className="text-muted-foreground hover:text-foreground rounded p-1 transition"
                  title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                >
                  {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
                <DialogPrimitive.Close className="text-muted-foreground hover:text-foreground rounded p-1 opacity-70 transition hover:opacity-100">
                  <XIcon className="size-4" />
                  <span className="sr-only">Cerrar</span>
                </DialogPrimitive.Close>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Dropzone (only when no result yet) */}
            {mode === "idle" && (
              <div className="flex flex-1 flex-col items-center justify-center p-6">
                <div
                  className="hover:border-primary flex w-full max-w-lg cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 transition"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <Upload className="text-muted-foreground size-10" />
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      {fileName ? fileName : "Arrastra un archivo .xlsx o haz clic para seleccionar"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">Formatos: .xlsx · .xls</p>
                  </div>
                  {fileName && (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {fileName}
                    </Badge>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 gap-1.5 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTemplate();
                  }}
                >
                  <Download className="size-3.5" />
                  Descargar plantilla
                </Button>
              </div>
            )}

            {/* Results area (after validation) */}
            {result && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Summary + filters bar */}
                <div className="shrink-0 space-y-2 border-b px-4 py-3">
                  <SummaryBar summary={result.summary} mode={mode} result={result} />

                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Buscar local, visitante, árbitros…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-7 w-52 text-xs"
                    />

                    {/* Status toggle chips */}
                    <div className="flex items-center gap-1">
                      {(["all", "ok", "error", "skipped"] as StatusFilter[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatusFilter(s)}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                            statusFilter === s
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-muted-foreground hover:border-foreground/50"
                          }`}
                        >
                          {s === "all" ? "Todos" : s === "ok" ? "Válidos" : s === "error" ? "Errores" : "Duplicados"}
                        </button>
                      ))}
                    </div>

                    {/* Category filter */}
                    {categories.length > 1 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                            {categoryFilter === "all" ? "Categoría" : categoryFilter}
                            <ChevronDown className="size-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-60 overflow-auto">
                          <DropdownMenuLabel className="text-xs">Categoría</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            checked={categoryFilter === "all"}
                            onCheckedChange={() => setCategoryFilter("all")}
                          >
                            Todas
                          </DropdownMenuCheckboxItem>
                          {categories.map((c) => (
                            <DropdownMenuCheckboxItem
                              key={c}
                              checked={categoryFilter === c}
                              onCheckedChange={() => setCategoryFilter(c)}
                              className="text-xs"
                            >
                              {c}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {/* Jornada filter */}
                    {jornadas.length > 1 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                            {jornadaFilter === "all" ? "Jornada" : `J${jornadaFilter}`}
                            <ChevronDown className="size-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-60 overflow-auto">
                          <DropdownMenuLabel className="text-xs">Jornada</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            checked={jornadaFilter === "all"}
                            onCheckedChange={() => setJornadaFilter("all")}
                          >
                            Todas
                          </DropdownMenuCheckboxItem>
                          {jornadas.map((j) => (
                            <DropdownMenuCheckboxItem
                              key={j}
                              checked={jornadaFilter === String(j)}
                              onCheckedChange={() => setJornadaFilter(String(j))}
                              className="text-xs"
                            >
                              Jornada {j}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {/* Page size */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                          {pageSize} / pág
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <DropdownMenuCheckboxItem
                            key={n}
                            checked={pageSize === n}
                            onCheckedChange={() => setPageSize(n)}
                            className="text-xs"
                          >
                            {n} filas
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <span className="text-muted-foreground ml-auto text-xs">
                      {filteredRows.length} de {allRows.length} filas
                    </span>

                    {/* Re-upload button */}
                    <button
                      onClick={() => {
                        reset();
                        setTimeout(() => fileInputRef.current?.click(), 50);
                      }}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition"
                    >
                      <X className="size-3" /> Cambiar archivo
                    </button>
                  </div>
                </div>

                {/* Main 2-col area */}
                <div className="flex min-h-0 flex-1">
                  {/* Left: table — native overflow-auto for BOTH axes */}
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r">
                    <div className="min-h-0 flex-1 overflow-auto">
                      <table className="w-max min-w-[1600px] text-xs">
                        <thead className="bg-muted/70 sticky top-0 z-10">
                          <tr>
                            <th className="w-10 px-3 py-2 text-left font-semibold">#</th>
                            <th className="w-36 px-3 py-2 text-left font-semibold">Categoría</th>
                            <th className="w-[260px] px-3 py-2 text-left font-semibold">Reubicación</th>
                            <th className="w-10 px-3 py-2 text-left font-semibold">J</th>
                            <th className="w-48 px-3 py-2 text-left font-semibold">Local</th>
                            <th className="w-48 px-3 py-2 text-left font-semibold">Visitante</th>
                            <th className="w-56 px-3 py-2 text-left font-semibold">Árbitros</th>
                            <th className="w-72 px-3 py-2 text-left font-semibold">Estado / Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedRows.length === 0 && (
                            <tr>
                              <td colSpan={8} className="text-muted-foreground py-8 text-center">
                                Sin resultados para los filtros actuales.
                              </td>
                            </tr>
                          )}
                          {pagedRows.map((row, i) => {
                            const globalIdx = allRows.indexOf(row);
                            const isSelected = selectedIdx === globalIdx;
                            const isEven = i % 2 === 0;
                            const rowOverrides = overrides[row.rowNumber];
                            const homeSuggestions = row.suggestions?.homeTeam;
                            const awaySuggestions = row.suggestions?.awayTeam;
                            const relocationOptions = row.suggestions?.relocation;
                            const hasRelocationOverride = Boolean(rowOverrides?.targetGroupId);
                            const relocatedLabel = hasRelocationOverride
                              ? (GROUP_LABEL_BY_ID_CLIENT[rowOverrides?.targetGroupId ?? ""] ??
                                rowOverrides?.targetGroupId ??
                                "")
                              : "";
                            // Server-confirmed relocation (after re-validate)
                            const serverRelocated = row.status === "ok" && row.relocated;

                            // Row background: blue tint for relocated rows, normal otherwise
                            const rowBg =
                              hasRelocationOverride || serverRelocated
                                ? isSelected
                                  ? "bg-blue-100/60 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-950/50"
                                  : "bg-blue-50/50 hover:bg-blue-50/80 dark:bg-blue-950/20 dark:hover:bg-blue-950/30"
                                : isSelected
                                  ? "bg-primary/10 hover:bg-primary/15"
                                  : isEven
                                    ? "bg-background hover:bg-muted/40"
                                    : "bg-muted/20 hover:bg-muted/40";

                            return (
                              <tr
                                key={row.rowNumber}
                                onClick={() => setSelectedIdx(isSelected ? null : globalIdx)}
                                className={`cursor-pointer border-t transition-colors ${rowBg}`}
                              >
                                <td className="text-muted-foreground px-3 py-1.5">{row.rowNumber}</td>

                                {/* ── Categoría (B): strikethrough + new group when relocated ── */}
                                <td className="px-3 py-1.5" title={row.categoria}>
                                  {hasRelocationOverride || serverRelocated ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-muted-foreground text-[11px] line-through">
                                        {row.categoria || "—"}
                                      </span>
                                      <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300">
                                        {relocatedLabel?.length
                                          ? relocatedLabel
                                          : row.relocatedTo?.length
                                            ? row.relocatedTo
                                            : "—"}
                                      </span>
                                    </div>
                                  ) : (
                                    row.categoria || "—"
                                  )}
                                </td>

                                {/* ── Reubicación (A, D): moved after Categoría ── */}
                                <td className="px-3 py-1.5">
                                  {/* Select for error rows with relocation suggestions (not yet applied) */}
                                  {row.status === "error" &&
                                    relocationOptions &&
                                    relocationOptions.length > 0 &&
                                    !hasRelocationOverride && (
                                      <select
                                        value=""
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          const idx = parseInt(e.target.value, 10);
                                          if (!isNaN(idx) && relocationOptions[idx]) {
                                            setRelocation(row.rowNumber, relocationOptions[idx]);
                                          }
                                        }}
                                        className="bg-background border-input w-full rounded border px-1.5 py-1 text-[11px]"
                                      >
                                        <option value="">Corregir grupo…</option>
                                        {relocationOptions.map((r, ri) => (
                                          <option key={ri} value={ri}>
                                            {r.targetCategoryLabel}
                                            {r.matchType === "both"
                                              ? " — Ambos equipos encontrados"
                                              : r.matchType === "home_only"
                                                ? " — Solo local encontrado"
                                                : " — Solo visitante encontrado"}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  {/* Applied relocation (preview, pre-revalidate) */}
                                  {hasRelocationOverride && (
                                    <div className="flex items-center gap-1.5">
                                      <Badge className="gap-1 border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                        <ArrowRightLeft className="size-2.5" />
                                        {relocatedLabel}
                                      </Badge>
                                      <Badge className="border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                        Corrección aplicada
                                      </Badge>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRelocation(row.rowNumber, null);
                                        }}
                                        className="text-muted-foreground hover:text-destructive rounded p-0.5 transition"
                                        title="Deshacer reubicación"
                                      >
                                        <X className="size-3" />
                                      </button>
                                    </div>
                                  )}
                                  {/* Server-confirmed relocation (after re-validate) */}
                                  {!hasRelocationOverride && serverRelocated && row.relocatedTo && (
                                    <Badge className="gap-1 border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                      <CheckCircle2 className="size-2.5" />
                                      Reubicado
                                    </Badge>
                                  )}
                                </td>

                                <td className="px-3 py-1.5">{row.jornada ?? "—"}</td>
                                <td className="px-3 py-1.5" title={row.local}>
                                  {homeSuggestions && homeSuggestions.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-destructive text-[11px] line-through">{row.local}</span>
                                      <select
                                        value={rowOverrides?.homeTeamId ?? ""}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          setOverride(row.rowNumber, "homeTeamId", e.target.value || undefined);
                                        }}
                                        className="bg-background border-input w-full rounded border px-1 py-0.5 text-[11px]"
                                      >
                                        <option value="">Seleccionar equipo…</option>
                                        {homeSuggestions
                                          .filter((c) => c.sameGroup)
                                          .map((c) => (
                                            <option key={c.teamId} value={c.teamId}>
                                              {c.teamName} ({Math.round(c.score * 100)}%)
                                            </option>
                                          ))}
                                        {homeSuggestions.some((c) => !c.sameGroup) && (
                                          <option disabled>── Otros grupos ──</option>
                                        )}
                                        {homeSuggestions
                                          .filter((c) => !c.sameGroup)
                                          .map((c) => (
                                            <option key={c.teamId} value={c.teamId} disabled>
                                              {c.groupLabel}: {c.teamName} ({Math.round(c.score * 100)}%)
                                            </option>
                                          ))}
                                      </select>
                                    </div>
                                  ) : (
                                    <span className="flex items-center gap-1.5">
                                      <span>{row.local || "—"}</span>
                                      <AutoMatchBadge meta={row.homeTeamMatch} />
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5" title={row.visitante}>
                                  {awaySuggestions && awaySuggestions.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-destructive text-[11px] line-through">{row.visitante}</span>
                                      <select
                                        value={rowOverrides?.awayTeamId ?? ""}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          setOverride(row.rowNumber, "awayTeamId", e.target.value || undefined);
                                        }}
                                        className="bg-background border-input w-full rounded border px-1 py-0.5 text-[11px]"
                                      >
                                        <option value="">Seleccionar equipo…</option>
                                        {awaySuggestions
                                          .filter((c) => c.sameGroup)
                                          .map((c) => (
                                            <option key={c.teamId} value={c.teamId}>
                                              {c.teamName} ({Math.round(c.score * 100)}%)
                                            </option>
                                          ))}
                                        {awaySuggestions.some((c) => !c.sameGroup) && (
                                          <option disabled>── Otros grupos ──</option>
                                        )}
                                        {awaySuggestions
                                          .filter((c) => !c.sameGroup)
                                          .map((c) => (
                                            <option key={c.teamId} value={c.teamId} disabled>
                                              {c.groupLabel}: {c.teamName} ({Math.round(c.score * 100)}%)
                                            </option>
                                          ))}
                                      </select>
                                    </div>
                                  ) : (
                                    <span className="flex items-center gap-1.5">
                                      <span>{row.visitante || "—"}</span>
                                      <AutoMatchBadge meta={row.awayTeamMatch} />
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5" title={row.arbitros}>
                                  <div className="flex flex-col items-start gap-1">
                                    <span className="block max-w-[180px] truncate">{row.arbitros || "—"}</span>
                                    {(row.centralRefereeMeta?.method === "external_label" ||
                                      row.aa1RefereeMeta?.method === "external_label" ||
                                      row.aa2RefereeMeta?.method === "external_label" ||
                                      row.assessorMeta?.method === "external_label") && (
                                      <Badge
                                        variant="secondary"
                                        className="text-muted-foreground border-border h-4 max-w-fit px-1.5 py-0 text-[10px] font-normal"
                                      >
                                        Externo
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-1.5">
                                  <div className="flex items-start gap-1.5">
                                    <StatusIcon status={row.status} />
                                    {row.status !== "ok" && (
                                      <span className="break-words whitespace-normal" title={row.message}>
                                        {row.status === "skipped" ? "Duplicado" : row.message}
                                      </span>
                                    )}
                                    {row.status === "ok" && (
                                      <span className="text-emerald-600 dark:text-emerald-400">OK</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="bg-muted/30 flex shrink-0 items-center justify-between border-t px-3 py-1.5 text-xs">
                        <button
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                          disabled={page === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          ← Anterior
                        </button>
                        <span className="text-muted-foreground">
                          Pág. {page + 1} / {totalPages}
                        </span>
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={page >= totalPages - 1}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          Siguiente →
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right: detail panel — own vertical scroll */}
                  <div className="hidden min-h-0 w-72 shrink-0 flex-col overflow-y-auto lg:flex">
                    <div className="bg-muted/30 shrink-0 border-b px-3 py-2 text-xs font-semibold tracking-wider uppercase">
                      Detalle
                    </div>
                    <DetailPanel
                      row={selectedRow}
                      relocationTarget={
                        selectedRow
                          ? overrides[selectedRow.rowNumber]?.targetGroupId
                            ? (GROUP_LABEL_BY_ID_CLIENT[overrides[selectedRow.rowNumber]?.targetGroupId ?? ""] ??
                              overrides[selectedRow.rowNumber]?.targetGroupId)
                            : selectedRow.relocated
                              ? selectedRow.relocatedTo
                              : null
                          : null
                      }
                    />
                  </div>
                </div>

                {/* Debug panel (below table, only when errors) */}
                {result.debug && result.summary.invalid > 0 && (
                  <div className="shrink-0 border-t p-3">
                    <DebugPanel debug={result.debug} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer (sticky) ── */}
          <div className="bg-background shrink-0 border-t px-5 py-3">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {mode !== "idle" && (
                  <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                    Limpiar
                  </Button>
                )}
                {mode === "validated" && (
                  <Button variant="outline" size="sm" onClick={handleValidate} disabled={busy}>
                    {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Re-validar
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {mode === "idle" && (
                  <Button onClick={handleValidate} disabled={!file || busy} size="sm">
                    {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Validar archivo
                  </Button>
                )}

                {mode === "validated" && !result?.ok && (
                  <Button
                    onClick={handleCommitValid}
                    disabled={busy || (result?.summary.valid ?? 0) === 0}
                    size="sm"
                    variant="outline"
                  >
                    {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Guardar válidos ({result?.summary.valid})
                  </Button>
                )}

                {mode === "validated" && result?.ok && (
                  <Button onClick={handleCommit} disabled={busy} size="sm">
                    {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Confirmar importación ({result.summary.valid} partidos)
                  </Button>
                )}

                {mode === "validated" && !result?.ok && hasOverridesToRevalidate && (
                  <Button onClick={handleValidate} disabled={busy} size="sm" variant="default">
                    {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Validar con correcciones
                  </Button>
                )}

                {mode === "validated" && !result?.ok && !hasOverridesToRevalidate && (
                  <span className="text-muted-foreground text-xs">
                    Corrige los {result?.summary.invalid} errores antes de importar.
                  </span>
                )}

                {mode === "committed" && result?.ok && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ Importación completada
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
