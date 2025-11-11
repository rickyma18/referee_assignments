"use client";

import * as React from "react";

import { useParams } from "next/navigation";

import { Upload, FileSpreadsheet, Eraser, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { EntityHeader } from "@/components/entity-header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getGroupAction } from "@/server/actions/groups.actions";
import { getLeagueAction } from "@/server/actions/leagues.actions";
import { importTeamsAction, type ImportRow, type ImportReport } from "@/server/actions/teams-import.actions";

type PreviewRow = ImportRow & {
  formErrors?: string[];
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

  // meta para EntityHeader
  const [metaLoading, setMetaLoading] = React.useState(true);
  const [league, setLeague] = React.useState<any | null>(null);
  const [group, setGroup] = React.useState<any | null>(null);

  const hiddenInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setMetaLoading(true);
        const [lg, grp] = await Promise.all([
          getLeagueAction(String(leagueId)),
          getGroupAction(String(leagueId), String(groupId)),
        ]);
        if (!mounted) return;
        setLeague(lg ?? null);
        setGroup(grp ?? null);
      } catch {
        if (mounted) {
          setLeague(null);
          setGroup(null);
        }
      } finally {
        if (mounted) setMetaLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [leagueId, groupId]);

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
      return { ...r, formErrors: errors.length ? errors : undefined };
    });
  };

  const onImport = async () => {
    if (rows.length === 0) {
      toast.error("No hay filas para importar.");
      return;
    }
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
        fallbackGroupId: groupId,
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

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      if (hiddenInputRef.current) hiddenInputRef.current.files = dt.files;
      void onFileChange({ target: hiddenInputRef.current! } as any);
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function clearAll() {
    setFile(null);
    setRows([]);
    setReport(null);
    if (hiddenInputRef.current) hiddenInputRef.current.value = "";
  }

  function downloadTemplate() {
    const header = ["name", "group", "municipality", "stadium", "venue"];
    const example = ["Tapatíos FC", "", "Guadalajara", "Campo Tapatío", "Av. Patria #1800, Guadalajara"];
    const csv = [header.join(","), example.map((c) => `"${c}"`).join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teams_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header reutilizable con liga/grupo */}
      {metaLoading ? (
        <EntityHeader.Skeleton />
      ) : (
        <EntityHeader
          loading={false}
          logoUrl={league?.logoUrl ?? null}
          title={league?.name ?? "—"}
          subtitle={
            <span className="block">
              {league?.season ? <>Temporada {league.season} · </> : null}
              <span className="font-medium">{group?.name ?? groupId}</span>
            </span>
          }
          colorHex={league?.color ?? null}
          backHref={`/dashboard/leagues/${leagueId}/groups/${groupId}/teams`}
          backText="Volver a equipos"
          rightExtra={
            <div className="flex gap-2">
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Descargar plantilla
              </Button>
              <Button variant="ghost" onClick={clearAll} disabled={!file && rows.length === 0}>
                <Eraser className="mr-2 h-4 w-4" />
                Limpiar
              </Button>
            </div>
          }
        />
      )}

      {/* Instrucciones */}
      <div className="rounded-lg border p-4 md:p-5">
        <div className="text-sm">
          Columnas soportadas: <code>name</code>, <code>group</code>, <code>municipality</code>, <code>stadium</code>,{" "}
          <code>venue</code>. Si <code>group</code> no viene, se usará el grupo actual (<code>{groupId}</code>).
        </div>
      </div>

      {/* Dropzone */}
      <div
        className="group hover:bg-muted/40 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition"
        onClick={() => hiddenInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && hiddenInputRef.current?.click()}
      >
        <Upload className="mx-auto mb-2 h-6 w-6 opacity-70 group-hover:opacity-100" />
        <p className="text-sm">
          Arrastra tu archivo aquí o <span className="underline">haz clic para seleccionar</span>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">Formatos: .csv, .xlsx, .xls</p>

        {file ? (
          <div className="bg-background mx-auto mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="font-medium">{file.name}</span>
          </div>
        ) : null}
      </div>

      <input ref={hiddenInputRef} type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={onFileChange} />

      {/* Preview */}
      <div className="overflow-x-auto rounded-lg border">
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
                      <span className="text-destructive inline-flex items-center gap-1 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        {r.formErrors.join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Acción final */}
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
            <div className="overflow-x-auto rounded-lg border">
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
