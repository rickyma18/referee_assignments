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
  Estado: string; // "DISPONIBLE" | "LESIONADO" | "INACTIVO"
  Categoría: string; // "TDP" | "LP" (ampliable)
  Teléfono: string;
  Correo: string;
  RFC: string;
  CURP: string;
  NUI: string;
  FotoURL: string;
  Tipo: string; // "ARBITRO" | "ASESOR" (opcional)
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

// 🔹 Campos obligatorios (por clave de RefRow)
const REQUIRED_FIELDS: Array<keyof RefRow> = ["Nombre", "Zonas", "Estado", "Categoría", "Correo"];

const FIELD_LABELS: Record<keyof RefRow, string> = {
  Nombre: "Nombre",
  Zonas: "Zonas",
  Roles: "Roles",
  Estado: "Estado",
  Categoría: "Categoría",
  Teléfono: "Teléfono",
  Correo: "Correo",
  RFC: "RFC",
  CURP: "CURP",
  NUI: "NUI",
  FotoURL: "FotoURL",
  Tipo: "Tipo",
};

const VALID_ESTADOS = ["DISPONIBLE", "LESIONADO", "INACTIVO"] as const;
const VALID_CATEGORIES = ["TDP", "LP"] as const;
const VALID_ROLES = ["CENTRAL", "AA1", "AA2", "4TO"] as const;
const VALID_TYPES = ["ARBITRO", "ASESOR"] as const;

// Email muy básico, solo para filtrar burradas
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Detecta si un valor está "vacío" (null, undefined, "", espacios, NBSP, etc.)
 */
function isBlankValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    // Limpia espacios normales, NBSP (\u00A0), y otros whitespace Unicode
    return v.replace(/[\s\u00A0\u200B]+/g, "") === "";
  }
  return false;
}

/**
 * Detecta si una fila cruda del Excel está vacía (debe ignorarse).
 * Revisa las 5 columnas obligatorias: Nombre, Zonas, Estado, Categoría, Correo.
 */
function isEmptyExcelRow(row: Record<string, unknown>): boolean {
  if (!row || typeof row !== "object") return true;

  const keys = ["Nombre", "Zonas", "Estado", "Categoría", "Correo"];
  return keys.every((k) => isBlankValue(row[k]));
}

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
        Tipo: s(g("Tipo")), // 👈 NUEVO
      };
    });
  }

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        blankrows: false, // Ya es default, pero explícito para claridad
      });

      // Filtrar filas vacías (por formato de plantilla o NBSP)
      const filtered = json.filter((row) => !isEmptyExcelRow(row));

      if (filtered.length > maxRows) {
        toast.error(`Máximo ${maxRows} filas por carga.`);
        return;
      }

      const normalized = normalizeJson(filtered);

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
      "Tipo", // 👈 NUEVO
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
        Tipo: "ARBITRO",
      },
      {
        Nombre: "Carlos Asesor",
        Zonas: "ZMG",
        Roles: "CENTRAL",
        Estado: "DISPONIBLE",
        Categoría: "TDP",
        Teléfono: "",
        Correo: "asesor@ej.com",
        RFC: "",
        CURP: "",
        NUI: "",
        FotoURL: "",
        Tipo: "ASESOR",
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
        r.Tipo,
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
      { wch: 12 }, // Tipo
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");

    XLSX.writeFile(wb, "plantilla_arbitros_asesores.xlsx");
  }

  // ---------- Validación en cliente ----------
  function runClientValidation() {
    const validatedRows = rows.map((r) => {
      const errors: string[] = [];

      // Campos obligatorios vacíos
      for (const field of REQUIRED_FIELDS) {
        const value = r[field];
        if (!String(value ?? "").trim()) {
          errors.push(`La columna "${FIELD_LABELS[field]}" es obligatoria.`);
        }
      }

      // Estado
      if (r.Estado) {
        const estadoUpper = r.Estado.toUpperCase();
        if (!VALID_ESTADOS.includes(estadoUpper as (typeof VALID_ESTADOS)[number])) {
          errors.push(`Estado inválido "${r.Estado}". Usa: DISPONIBLE, LESIONADO o INACTIVO.`);
        }
      }

      // Categoría
      if (r.Categoría) {
        const catUpper = r.Categoría.toUpperCase();
        if (!VALID_CATEGORIES.includes(catUpper as (typeof VALID_CATEGORIES)[number])) {
          errors.push(`Categoría inválida "${r.Categoría}". Usa: TDP o LP.`);
        }
      }

      // Roles
      if (r.Roles) {
        const rolesList = r.Roles.split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (!rolesList.length) {
          errors.push("Debes indicar al menos un rol.");
        } else {
          const invalidRoles = rolesList.filter(
            (role) => !VALID_ROLES.includes(role.toUpperCase() as (typeof VALID_ROLES)[number]),
          );
          if (invalidRoles.length) {
            errors.push(`Roles inválidos: ${invalidRoles.join(", ")}. Usa: CENTRAL, AA1, AA2, 4TO.`);
          }
        }
      }

      // Correo
      if (r.Correo && !EMAIL_REGEX.test(r.Correo)) {
        errors.push(`Correo inválido "${r.Correo}".`);
      }

      // Tipo (opcional)
      if (r.Tipo) {
        const tipoUpper = r.Tipo.toUpperCase();
        if (!VALID_TYPES.includes(tipoUpper as (typeof VALID_TYPES)[number])) {
          errors.push(`Tipo inválido "${r.Tipo}". Usa: ARBITRO o ASESOR (o deja vacío).`);
        }
      }

      return {
        errors,
        normalized: r,
      };
    });

    const ok = !validatedRows.some((row) => row.errors.length > 0);

    return { ok, rows: validatedRows };
  }

  // ---------- Actions ----------
  async function onValidate() {
    if (rows.length === 0) return toast.error("Sube un archivo primero.");
    setBusy(true);
    try {
      // 1) Validación en cliente (obligatorios + enums básicos)
      const clientRes = runClientValidation();
      setResult(clientRes);

      if (!clientRes.ok) {
        toast.error("Hay errores en columnas obligatorias. Corrige antes de confirmar.");
        return;
      }

      // 2) Validación en servidor (reglas de negocio)
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

  // eslint-disable-next-line complexity
  async function onConfirm() {
    if (!result?.ok) return toast.error("No puedes confirmar con errores.");
    setBusy(true);

    try {
      const payload = {
        rows: (result.rows ?? rows).map((r: any) => r.normalized ?? r),
      };

      const res = (await confirmRefereesImport(payload)) as ConfirmRefereesResponse;

      // res.ok = secureWrite pasó (autenticación/permisos)
      // res.data.ok = operación real pasó (repo.create exitoso)
      if (!res.ok) {
        // Error de permisos o wrapper
        toast.error(res.message ?? "No tienes permisos para importar.");
        return;
      }

      if (res.data?.ok) {
        const created = res.data.created ?? rows.length;
        toast.success(`Registros creados/actualizados: ${created}`);
        onClear();
      } else {
        // Error en la operación (ej: duplicados, falta delegateId, etc.)
        const msg = res.data?.errors?.length ? res.data.errors.join("; ") : "No se pudo confirmar la importación.";
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
            <h3 className="text-base font-semibold">Importar árbitros y asesores por Excel</h3>
            <p className="text-muted-foreground text-sm">
              Columnas (<span className="font-semibold">*</span> obligatorias):{" "}
              <span className="font-mono">Nombre*</span>, <span className="font-mono">Zonas*</span>,{" "}
              <span className="font-mono">Roles</span>, <span className="font-mono">Estado*</span>,{" "}
              <span className="font-mono">Categoría*</span>, <span className="font-mono">Teléfono</span>,{" "}
              <span className="font-mono">Correo*</span>, <span className="font-mono">RFC</span>,{" "}
              <span className="font-mono">CURP</span>, <span className="font-mono">NUI</span>,{" "}
              <span className="font-mono">FotoURL</span>, <span className="font-mono">Tipo</span> (opcional:
              ARBITRO/ASESOR). Usa comas para múltiples <span className="font-mono">Zonas</span> y{" "}
              <span className="font-mono">Roles</span>.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Puedes dejar vacíos: Teléfono, RFC, CURP, NUI, FotoURL y Tipo (por defecto se asume árbitro).
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
                <th className="p-2 text-left">Nombre*</th>
                <th className="p-2 text-left">Zonas*</th>
                <th className="p-2 text-left">Roles*</th>
                <th className="p-2 text-left">Estado*</th>
                <th className="p-2 text-left">Categoría*</th>
                <th className="p-2 text-left">Teléfono</th>
                <th className="p-2 text-left">Correo*</th>
                <th className="p-2 text-left">RFC</th>
                <th className="p-2 text-left">CURP</th>
                <th className="p-2 text-left">NUI</th>
                <th className="p-2 text-left">Foto</th>
                <th className="p-2 text-left">Tipo</th>
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
                    <td className="p-2">{r.Tipo || "—"}</td>
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

      <Separator className="opacity-50" />
    </div>
  );
}
