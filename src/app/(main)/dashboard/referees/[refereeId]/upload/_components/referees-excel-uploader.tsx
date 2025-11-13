"use client";

import * as React from "react";

import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Eraser, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { validateRefereesDryRun, confirmRefereesImport } from "@/server/actions/referees-import.actions";

type Props = {
  /** Límite defensivo de filas por carga (UX) */
  maxRows?: number;
};

type RefRow = {
  Nombre: string;
  Zonas: string; // CSV "ZMG, Altos"
  Roles: string; // CSV "CENTRAL, AA1"
  Estado: string; // "DISPONIBLE" | "DUDOSO" | "LESIONADO"
  Categoría: string; // "TDP" | "LP" (ampliable)
  Teléfono: string;
  Correo: string;
  RFC: string;
  CURP: string;
  NUI: string;
  FotoURL: string;
};
type ConfirmRefereesResponse = {
  ok: boolean;
  message?: string;
  data?: {
    ok: boolean;
    created: number;
    errors: string[];
  };
};

export function RefereesExcelUploader({ maxRows = 2000 }: Props) {
  const [rows, setRows] = React.useState<RefRow[]>([]);
  const [result, setResult] = React.useState<any | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [fileName, setFileName] = React.useState<string>("");

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ---------- Helpers ----------
  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  function normalizeJson(json: any[]): RefRow[] {
    // Acepta variantes de encabezados (por si exportan con minúsculas)
    return json.map((r) => {
      const g = (k: string) => r[k] ?? r[k.toLowerCase()] ?? "";

      // trim defensivo
      const s = (v: unknown) => String(v ?? "").trim();

      return {
        Nombre: s(g("Nombre")),
        Zonas: s(g("Zonas")),
        Roles: s(g("Roles")),
        Estado: s(g("Estado")),
        Categoría: s(g("Categoría")),
        Teléfono: s(g("Teléfono")),
        Correo: s(g("Correo")),
        RFC: s(g("RFC")),
        CURP: s(g("CURP")),
        NUI: s(g("NUI")),
        FotoURL: s(g("FotoURL")),
      };
    });
  }

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (json.length > maxRows) {
        toast.error(`Máximo ${maxRows} filas por carga.`);
        return;
      }

      const normalized = normalizeJson(json);

      setRows(normalized);
      setResult(null);
      setFileName(file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
    // Para permitir re-seleccionar el mismo archivo
    e.target.value = "";
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

  function onClear() {
    setRows([]);
    setResult(null);
    setFileName("");
  }

  function downloadTemplate() {
    const headers = [
      "Nombre",
      "Zonas",
      "Roles",
      "Estado",
      "Categoría",
      "Teléfono",
      "Correo",
      "RFC",
      "CURP",
      "NUI",
      "FotoURL",
    ];

    const sample: RefRow[] = [
      {
        Nombre: "Juan Pérez",
        Zonas: "ZMG, Altos",
        Roles: "CENTRAL, AA1",
        Estado: "DISPONIBLE",
        Categoría: "TDP",
        Teléfono: "3312345678",
        Correo: "juan@ej.com",
        RFC: "",
        CURP: "",
        NUI: "",
        FotoURL: "",
      },
      {
        Nombre: "",
        Zonas: "",
        Roles: "",
        Estado: "",
        Categoría: "",
        Teléfono: "",
        Correo: "",
        RFC: "",
        CURP: "",
        NUI: "",
        FotoURL: "",
      },
    ];

    const aoa = [
      headers,
      ...sample.map((r) => [
        r.Nombre,
        r.Zonas,
        r.Roles,
        r.Estado,
        r.Categoría,
        r.Teléfono,
        r.Correo,
        r.RFC,
        r.CURP,
        r.NUI,
        r.FotoURL,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    (ws as any)["!cols"] = [
      { wch: 24 }, // Nombre
      { wch: 20 }, // Zonas
      { wch: 18 }, // Roles
      { wch: 12 }, // Estado
      { wch: 10 }, // Categoría
      { wch: 14 }, // Teléfono
      { wch: 26 }, // Correo
      { wch: 14 }, // RFC
      { wch: 18 }, // CURP
      { wch: 12 }, // NUI
      { wch: 36 }, // FotoURL
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");

    XLSX.writeFile(wb, "plantilla_arbitros.xlsx");
  }

  // ---------- Actions ----------
  async function onValidate() {
    if (rows.length === 0) return toast.error("Sube un archivo primero.");
    setBusy(true);
    try {
      const res = await validateRefereesDryRun(rows);
      setResult(res);
      if (res?.ok) toast.success("Validación OK. Puedes confirmar.");
      else toast.error("Hay errores. Corrige antes de confirmar.");
    } catch (e: any) {
      toast.error(e?.message ?? "Error al validar.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!result?.ok) return toast.error("No puedes confirmar con errores.");
    setBusy(true);
    try {
      const payload = {
        rows: (result.rows ?? rows).map((r: any) => r.normalized ?? r),
      };

      const res = (await confirmRefereesImport(payload)) as ConfirmRefereesResponse;

      if (res.ok) {
        const created = res.data?.created ?? rows.length; // fallback amistoso
        toast.success(`Árbitros creados/actualizados: ${created}`);
        onClear();
      } else {
        // Si viene listado de errores en data.errors, muéstralo
        const msg = res.message ?? (res.data?.errors?.length ? res.data.errors.join("; ") : "No se pudo confirmar.");
        toast.error(msg);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al confirmar.");
    } finally {
      setBusy(false);
    }
  }

  // ---------- UI ----------
  return (
    <div className="space-y-6">
      {/* Header / instrucciones */}
      <div className="rounded-lg border p-4 md:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold">Importar árbitros por Excel</h3>
            <p className="text-muted-foreground text-sm">
              Columnas: <span className="font-mono">Nombre</span>, <span className="font-mono">Zonas</span>,{" "}
              <span className="font-mono">Roles</span>, <span className="font-mono">Estado</span>,{" "}
              <span className="font-mono">Categoría</span>, <span className="font-mono">Teléfono</span>,{" "}
              <span className="font-mono">Correo</span>, <span className="font-mono">RFC</span>,{" "}
              <span className="font-mono">CURP</span>, <span className="font-mono">NUI</span>,{" "}
              <span className="font-mono">FotoURL</span>. Usa comas para múltiples{" "}
              <span className="font-mono">Zonas</span> y <span className="font-mono">Roles</span>.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} disabled={busy}>
              <Download className="mr-2 h-4 w-4" />
              Descargar plantilla
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
        <Button onClick={onConfirm} disabled={!result?.ok || busy} variant="secondary">
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
                <th className="p-2 text-left">Nombre</th>
                <th className="p-2 text-left">Zonas</th>
                <th className="p-2 text-left">Roles</th>
                <th className="p-2 text-left">Estado</th>
                <th className="p-2 text-left">Categoría</th>
                <th className="p-2 text-left">Teléfono</th>
                <th className="p-2 text-left">Correo</th>
                <th className="p-2 text-left">RFC</th>
                <th className="p-2 text-left">CURP</th>
                <th className="p-2 text-left">NUI</th>
                <th className="p-2 text-left">Foto</th>
                <th className="p-2 text-left">Validación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const item = result?.rows?.[i];
                const errs: string[] = item?.errors ?? [];
                const ok = item ? errs.length === 0 : false;

                return (
                  <tr key={i} className="border-t">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2">{r.Nombre}</td>
                    <td className="p-2">{r.Zonas}</td>
                    <td className="p-2">{r.Roles}</td>
                    <td className="p-2">{r.Estado}</td>
                    <td className="p-2">{r.Categoría}</td>
                    <td className="p-2">{r.Teléfono}</td>
                    <td className="p-2">{r.Correo}</td>
                    <td className="p-2">{r.RFC}</td>
                    <td className="p-2">{r.CURP}</td>
                    <td className="p-2">{r.NUI}</td>
                    <td className="max-w-[160px] truncate p-2">{r.FotoURL || "—"}</td>
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
          {/* Pie de tabla con leyenda */}
          <div className="text-muted-foreground flex items-center justify-between border-t px-3 py-2 text-xs">
            <span>
              {rows.length} fila{rows.length === 1 ? "" : "s"} cargada{rows.length === 1 ? "" : "s"}
            </span>
            <span>
              Estado: <span className="text-green-600">OK</span> / <span className="text-red-600">Errores</span>
            </span>
          </div>
        </div>
      )}

      {/* Separador opcional para respiración visual */}
      <Separator className="opacity-50" />
    </div>
  );
}
