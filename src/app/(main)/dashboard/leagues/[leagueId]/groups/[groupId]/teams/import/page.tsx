"use client";

import * as React from "react";

import { useParams } from "next/navigation";

import Papa from "papaparse";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { importTeamsAction, type ImportRow, type ImportReport } from "@/server/actions/teams-import.actions";

type PreviewRow = ImportRow & {
  formErrors?: string[]; // validación de cliente (renombrado para evitar no-underscore-dangle)
};

function normalizeHeader(h: string): string {
  return (h ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[áàä]/g, "a")
    .replace(/[éèë]/g, "e")
    .replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o")
    .replace(/[úùü]/g, "u");
}

function mapHeaders(record: Record<string, any>): ImportRow {
  const mapped: any = {};
  for (const key of Object.keys(record)) {
    const nk = normalizeHeader(key);
    mapped[nk] = record[key];
  }
  return {
    name: (mapped["name"] ?? "").toString(),
    group: (mapped["group"] ?? undefined)?.toString(),
    municipality: (mapped["municipality"] ?? "").toString(),
    stadium: (mapped["stadium"] ?? "").toString(),
    venue: (mapped["venue"] ?? "").toString(),
  };
}

export default function ImportTeamsPage() {
  const { leagueId, groupId } = useParams<{ leagueId: string; groupId: string }>();

  const [file, setFile] = React.useState<File | null>(null);
  const [rows, setRows] = React.useState<PreviewRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState<ImportReport | null>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setRows([]);
    setReport(null);
    if (!f) return;

    try {
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (ext === "csv") {
        await parseCsv(f);
      } else if (ext === "xlsx" || ext === "xls") {
        await parseXlsx(f);
      } else {
        toast.error("Formato no soportado. Sube un CSV o Excel (.xlsx)");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Error al leer el archivo");
    }
  };

  const parseCsv = (f: File) =>
    new Promise<void>((resolve, reject) => {
      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = (results.data as Record<string, any>[]) ?? [];
          const mapped = data.map(mapHeaders);
          setRows(validateClient(mapped));
          resolve();
        },
        error: (error) => reject(error),
      });
    });

  const parseXlsx = async (f: File) => {
    const buffer = await f.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    const mapped = json.map(mapHeaders);
    setRows(validateClient(mapped));
  };

  const validateClient = (arr: ImportRow[]): PreviewRow[] => {
    return arr.map((r) => {
      const errors: string[] = [];
      if (!r.name || r.name.trim().length < 2) errors.push("Nombre requerido");
      // group opcional; si no viene, usaremos el groupId de la URL
      return { ...r, formErrors: errors.length ? errors : undefined };
    });
  };

  const onImport = async () => {
    if (rows.length === 0) {
      toast.error("No hay filas para importar.");
      return;
    }
    // Si todas las filas tienen errores, ni lo intentes
    const allBad = rows.every((r) => r.formErrors && r.formErrors.length > 0);
    if (allBad) {
      toast.error("Todas las filas tienen errores. Corrige el archivo e inténtalo de nuevo.");
      return;
    }

    try {
      setLoading(true);
      setReport(null);

      const cleanRows: ImportRow[] = rows
        .filter((r) => !r.formErrors || r.formErrors.length === 0)
        .map(({ formErrors: _omit, ...rr }) => rr);

      const res = await importTeamsAction({
        leagueId,
        fallbackGroupId: groupId, // si una fila no trae 'group', usamos el grupo actual
        rows: cleanRows,
      });

      if (!res.ok) {
        toast.error(res.message ?? "La importación falló");
        return;
      }

      setReport(res.data!);
      const { totals } = res.data!;
      toast.success(
        `Importación completa: ${totals.inserted} nuevas, ${totals.updated} actualizadas, ${totals.rejected} rechazadas.`,
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Error al importar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Importar equipos (CSV/Excel)</h1>
        <p className="text-muted-foreground text-sm">
          <span className="font-medium">{leagueId}</span> · <span className="font-medium">{groupId}</span>
        </p>
      </div>
      <Separator />

      {/* Subida de archivo */}
      <div className="flex items-center gap-3">
        <Input type="file" accept=".csv, .xlsx, .xls" onChange={onFileChange} />
        <Button variant="outline" disabled={!file} onClick={() => setFile(null)}>
          Limpiar
        </Button>
      </div>

      {/* Instrucciones */}
      <div className="text-muted-foreground text-sm">
        Columnas soportadas: <code>name</code>, <code>group</code>, <code>municipality</code>, <code>stadium</code>,{" "}
        <code>venue</code>. Si <code>group</code> no viene, se usará el grupo actual (<code>{groupId}</code>).
      </div>

      {/* Preview */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left [&>th]:px-4 [&>th]:py-3">
              <th>name</th>
              <th>group</th>
              <th>municipality</th>
              <th>stadium</th>
              <th>venue</th>
              <th>estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                  Sube un archivo para previsualizar.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-t [&>td]:px-4 [&>td]:py-2">
                  <td className="font-medium">{r.name}</td>
                  <td>{r.group ?? <span className="text-muted-foreground text-xs">(grupo actual)</span>}</td>
                  <td>{r.municipality}</td>
                  <td>{r.stadium}</td>
                  <td className="max-w-[420px] truncate">{r.venue}</td>
                  <td>
                    {r.formErrors?.length ? (
                      <span className="text-destructive text-xs">{r.formErrors.join(", ")}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">OK</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button onClick={onImport} disabled={loading || rows.length === 0}>
          {loading ? "Importando…" : "Importar"}
        </Button>
      </div>

      {/* Reporte final */}
      {report && (
        <div className="space-y-3">
          <Separator />
          <h2 className="text-lg font-semibold">Resultado</h2>
          <p className="text-muted-foreground text-sm">
            Recibidas: {report.totals.received} · Insertadas: {report.totals.inserted} · Actualizadas:{" "}
            {report.totals.updated} · Rechazadas: {report.totals.rejected}
          </p>

          {report.rejected.length > 0 && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left [&>th]:px-4 [&>th]:py-3">
                    <th>name</th>
                    <th>group</th>
                    <th>razón</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rejected.map((r, i) => (
                    <tr key={i} className="border-t [&>td]:px-4 [&>td]:py-2">
                      <td className="font-medium">{r.name}</td>
                      <td>{r.group ?? <span className="text-muted-foreground text-xs">(grupo actual)</span>}</td>
                      <td className="text-destructive">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
