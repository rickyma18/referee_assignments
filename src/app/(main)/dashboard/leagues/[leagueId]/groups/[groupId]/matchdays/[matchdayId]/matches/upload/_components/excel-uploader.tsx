"use client";

import * as React from "react";

import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Eraser, DatabaseZap, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { validateMatchesDryRun, confirmMatchesImport } from "@/server/actions/matches-import.actions";

/**
 * Helper para normalizar respuestas de server actions.
 * Soporta:
 *   Formato A (directo): { ok, created, message?, errors? }
 *   Formato B (secureWrite): { ok, data: { ok, created, errors? }, message? }
 */

type AnyRes = any;

// eslint-disable-next-line complexity
export function getActionResult(res: AnyRes) {
  // ✅ Formato A: { ok, rows, created?, errors?, message? }
  if (res && typeof res === "object" && "ok" in res) {
    return {
      ok: Boolean(res.ok),
      created: res.created ?? 0,
      rows: res.rows ?? [],
      errors: res.errors ?? [],
      message: res.message,
    };
  }

  // ✅ Formato B: { data: { ok, ... } }
  if (res?.data && typeof res.data === "object" && "ok" in res.data) {
    const outerOk = typeof res?.ok === "boolean" ? res.ok : true;
    return {
      ok: outerOk && Boolean(res.data.ok),
      created: res.data.created ?? 0,
      rows: res.data.rows ?? [],
      errors: res.data.errors ?? [],
      message: res.message ?? res.data.message,
    };
  }

  // fallback
  return { ok: false, created: 0, rows: [], errors: ["Respuesta inesperada del servidor"] };
}

/**
 * Detecta si un valor está "vacío" (null, undefined, "", espacios, NBSP, etc.)
 */
function isBlankValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    return v.replace(/[\s\u00A0\u200B]+/g, "") === "";
  }
  return false;
}

/**
 * Detecta si una fila de partidos está vacía (debe ignorarse).
 */
function isEmptyMatchRow(row: Record<string, unknown>): boolean {
  if (!row || typeof row !== "object") return true;
  return (
    isBlankValue(row.Local ?? row.local) &&
    isBlankValue(row.Visitante ?? row.visitante) &&
    isBlankValue(row.Fecha ?? row.fecha) &&
    isBlankValue(row.Hora ?? row.hora)
  );
}

export function ExcelUploader({
  leagueId,
  groupId,
  matchdayId,
  matchdayNumber,
  userId,
  maxRows = 2000,
}: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchdayNumber: number;
  userId: string;
  maxRows?: number;
}) {
  const [rows, setRows] = React.useState<any[]>([]);
  const [result, setResult] = React.useState<any | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [fileName, setFileName] = React.useState<string>("");

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        blankrows: false,
      });

      // Filtrar filas vacías (por formato de plantilla o NBSP)
      const filtered = json.filter((row) => !isEmptyMatchRow(row));

      if (filtered.length > maxRows) {
        toast.error(`Máximo ${maxRows} filas por carga.`);
        return;
      }

      const normalized = filtered.map((r) => ({
        Local: String(r.Local ?? r.local ?? "").trim(),
        Visitante: String(r.Visitante ?? r.visitante ?? "").trim(),
        Fecha: String(r.Fecha ?? r.fecha ?? "").trim(),
        Hora: String(r.Hora ?? r.hora ?? "").trim(),
      }));

      setRows(normalized);
      setResult(null);
      setFileName(file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadTemplate() {
    // Encabezados y una fila de ejemplo
    const headers = ["Local", "Visitante", "Fecha", "Hora"];
    const sampleRows = [
      ["Tapatíos Soccer FC", "Tecos B", "2025-11-15", "16:00"],
      ["", "", "", ""], // fila vacía por si quieren copiar
    ];

    // Construir hoja y libro
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);

    // Anchos amigables
    (ws as any)["!cols"] = [
      { wch: 28 }, // Local
      { wch: 28 }, // Visitante
      { wch: 14 }, // Fecha
      { wch: 10 }, // Hora
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");

    // Nombre del archivo: personaliza con liga/grupo/jornada
    const safeLeague = String(leagueId).slice(0, 6);
    const safeGroup = String(groupId).slice(0, 6);
    const filename = `plantilla_partidos_${safeLeague}_${safeGroup}_J${matchdayNumber}.xlsx`;

    // Descargar
    XLSX.writeFile(wb, filename);
  }

  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
    e.target.value = "";
  }

  async function onSeedVenues() {
    try {
      setBusy(true);
      const res = await fetch("/api/admin/seed-venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId, groupId }),
        cache: "no-store",
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        /* no-op */
      }

      if (!res.ok || !data?.ok) {
        throw new Error(data?.message ?? `No se pudo sembrar sedes (HTTP ${res.status}).`);
      }

      toast.success(`Sedes creadas desde equipos: ${data.created}`);

      if (rows.length > 0) {
        const reval = await validateMatchesDryRun({
          leagueId,
          groupId,
          matchdayId,
          matchdayNumber,
          rows,
          userId,
          limit: maxRows,
        });
        setResult(reval);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al sembrar sedes.");
    } finally {
      setBusy(false);
    }
  }

  // eslint-disable-next-line complexity
  async function onValidate() {
    if (rows.length === 0) return toast.error("Sube un archivo primero.");
    setBusy(true);

    try {
      const res = await validateMatchesDryRun({
        leagueId,
        groupId,
        matchdayId,
        matchdayNumber,
        rows,
        userId,
        limit: maxRows,
      });

      setResult(res);

      // Normalizar respuesta (soporta formato directo y secureWrite)
      const ar = getActionResult(res);

      // ✅ Detectar errores globales
      const globalErrors = Array.isArray(ar.errors) ? ar.errors : [];
      const hasGlobalErrors = globalErrors.length > 0;

      // ✅ Detectar errores por fila (si existen rows en la respuesta)
      const normalizedRows = Array.isArray((ar as any).rows)
        ? (ar as any).rows
        : Array.isArray((res as any).rows)
          ? (res as any).rows
          : [];

      const hasRowErrors = normalizedRows.some((r: any) => Array.isArray(r?.errors) && r.errors.length > 0);

      // ✅ OK real = ok && no hay errores globales ni por fila
      const okReal = Boolean(ar.ok) && !hasGlobalErrors && !hasRowErrors;

      if (okReal) {
        toast.success("Validación OK. Puedes confirmar.");
      } else {
        // Mensaje con prioridad: errores globales → errores por fila → message → genérico
        const msg = hasGlobalErrors
          ? globalErrors.join(" · ")
          : hasRowErrors
            ? "Hay filas con errores. Corrige antes de confirmar."
            : (ar.message ?? "Hay errores. Corrige antes de confirmar.");

        toast.error(msg);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al validar.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    // Verificar que la validación pasó (usando el resultado normalizado)
    const validationResult = getActionResult(result);
    if (!validationResult.ok) {
      return toast.error("No puedes confirmar con errores.");
    }

    setBusy(true);
    try {
      const importBatchId = crypto.randomUUID();

      // Construir payload con filas normalizadas
      const payload = {
        leagueId,
        groupId,
        matchdayId,
        matchdayNumber,
        rows: rows,
        userId,
        importBatchId,
      };

      const res = await confirmMatchesImport(payload);

      // Normalizar respuesta (soporta formato directo y secureWrite)
      const { ok, created, errors, message } = getActionResult(res);

      if (ok) {
        toast.success(`Partidos creados: ${created}`);
        setRows([]);
        setResult(null);
        setFileName("");
      } else {
        // Mostrar errores reales si existen
        const errorMsg = errors.length > 0 ? errors.join("; ") : (message ?? "No se pudo confirmar la importación.");
        toast.error(errorMsg);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al confirmar.");
    } finally {
      setBusy(false);
    }
  }

  function onClear() {
    setRows([]);
    setResult(null);
    setFileName("");
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) parseFile(f);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  // Calcular si la validación pasó para habilitar el botón Confirmar
  const ar = result ? getActionResult(result) : null;
  const canConfirm =
    !!ar &&
    Boolean(ar.ok) &&
    Array.isArray(ar.errors) &&
    ar.errors.length === 0 &&
    Array.isArray(ar.rows) &&
    ar.rows.every((r: any) => !Array.isArray(r?.errors) || r.errors.length === 0);

  return (
    <div className="space-y-6">
      {/* Header / instrucciones */}
      <div className="rounded-lg border p-4 md:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold">Importar partidos por Excel</h3>
            <p className="text-muted-foreground text-sm">
              Estructura de columnas: <span className="font-mono">Local</span>,{" "}
              <span className="font-mono">Visitante</span>, <span className="font-mono">Fecha (YYYY-MM-DD)</span>,{" "}
              <span className="font-mono">Hora (HH:mm)</span>. La sede se resuelve automáticamente por el local.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} disabled={busy}>
              <Download className="mr-2 h-4 w-4" />
              Descargar plantilla
            </Button>

            <Button variant="outline" onClick={onSeedVenues} disabled={busy}>
              <DatabaseZap className="mr-2 h-4 w-4" />
              Sincronizar sedes
            </Button>
          </div>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="group hover:bg-muted/40 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition"
        onClick={handleChooseFile}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleChooseFile()}
      >
        <Upload className="mx-auto mb-2 h-6 w-6 opacity-70 group-hover:opacity-100" />
        <p className="text-sm">
          Arrastra tu archivo aquí o <span className="underline">haz clic para seleccionar</span>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">Formatos: .xlsx, .xls, .csv · Máx. {maxRows} filas</p>
        {fileName ? (
          <div className="bg-background mx-auto mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="font-medium">{fileName}</span>
            {rows.length ? <span className="text-muted-foreground">· {rows.length} filas</span> : null}
          </div>
        ) : null}
      </div>

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />

      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onValidate} disabled={rows.length === 0 || busy}>
          Validar
        </Button>
        <Button onClick={onConfirm} disabled={!canConfirm || busy} variant="secondary">
          Confirmar
        </Button>
        <Button onClick={onClear} disabled={busy} variant="outline">
          <Eraser className="mr-2 h-4 w-4" />
          Limpiar
        </Button>
      </div>

      {/* Preview / Resultados */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">Local</th>
                <th className="p-2 text-left">Visitante</th>
                <th className="p-2 text-left">Fecha</th>
                <th className="p-2 text-left">Hora</th>
                <th className="p-2 text-left">Sede (auto)</th>
                <th className="p-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const item = result?.rows?.[i];
                const errs: string[] = item?.errors ?? [];
                const ok = item ? errs.length === 0 : false;
                const sedeAuto = item?.resolvedVenueName ?? item?.venueName ?? "";

                return (
                  <tr key={i} className="border-t">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2">{r.Local}</td>
                    <td className="p-2">{r.Visitante}</td>
                    <td className="p-2">{r.Fecha}</td>
                    <td className="p-2">{r.Hora}</td>
                    <td className="p-2">{sedeAuto ?? "—"}</td>
                    <td className="p-2">
                      {ok ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-4 w-4" /> OK
                        </span>
                      ) : errs.length ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <AlertTriangle className="h-4 w-4" />
                          {errs.join("; ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
