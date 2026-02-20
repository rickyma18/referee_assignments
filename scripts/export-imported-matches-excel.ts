// scripts/export-imported-matches-excel.ts
//
// Exporta partidos importados (source = fmf_excel_*) a Excel.
// Recomendado para comparar contra tu Excel FMF original.
//
// PowerShell:
//   $env:DELEGATE_ID="del_jalisco"
//   $env:SOURCE_PREFIX="fmf_excel"         # optional (default fmf_excel)
//   $env:IMPORT_BATCH_ID=""               # optional
//   npx tsx scripts/export-imported-matches-excel.ts
//
// Output:
//   exports/matches_imported_<delegateId>_<YYYY-MM-DD>.xlsx

import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import { getAdminDb } from "./_lib/firebase-admin"; // 👈 mismo init que usa export-teams-excel.ts

type MatchRow = {
  // ✅ para ordenar/leer similar a teams
  groupName: string;

  leagueId: string;
  groupId: string;

  matchdayNumber: number | null;

  kickoffAt: Date | null; // 👈 Excel date
  kickoffISO: string; // 👈 ISO para comparar / debug

  homeTeamName: string;
  awayTeamName: string;

  venueName: string;
  municipality: string;

  centralRefereeName: string;
  aa1RefereeName: string;
  aa2RefereeName: string;
  assessorsNames: string;

  status: string;
  source: string;
  importBatchId: string;

  matchdayId: string;
  homeTeamId: string;
  awayTeamId: string;
  venueId: string;

  createdAt: Date | null; // 👈 Excel date
  createdBy: string;

  compareKey: string;
};

function toDateSafe(input: any): Date | null {
  if (!input) return null;
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

function normLite(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * compareKey: llave determinística para comparar vs Excel FMF.
 * Si luego agregas sourceRowKey/sourceFileId, usa eso y quitas esto.
 */
function buildCompareKey(r: {
  matchdayNumber: number | null;
  homeTeamName: string;
  awayTeamName: string;
  kickoffISO: string;
  groupId: string;
  leagueId: string;
}) {
  return [
    r.leagueId,
    r.groupId,
    String(r.matchdayNumber ?? ""),
    normLite(r.homeTeamName),
    normLite(r.awayTeamName),
    r.kickoffISO,
  ].join("|");
}

async function buildGroupMap(db: FirebaseFirestore.Firestore) {
  // Map: groupId -> group.name
  // ✅ Igual que export-teams-excel.ts: sin documentId filters
  const snap = await db.collectionGroup("groups").select("name").get();
  const map = new Map<string, string>();

  snap.forEach((doc) => {
    const data = doc.data() as any;
    map.set(doc.id, String(data?.name ?? doc.id));
  });

  return map;
}

async function exportToExcel(delegateId: string) {
  const db = getAdminDb();

  const sourcePrefix = (
    process.env.SOURCE_PREFIX?.trim() ? process.env.SOURCE_PREFIX.trim() : "fmf_excel"
  ).toLowerCase();
  const importBatchIdFilter = (process.env.IMPORT_BATCH_ID?.trim() ?? "").trim();

  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    "unknown";

  console.log(`📦 Project: ${projectId}`);
  console.log(`🎯 Exportando matches importados para delegateId=${delegateId}`);
  console.log(`🔎 sourcePrefix=${sourcePrefix}${importBatchIdFilter ? `, importBatchId=${importBatchIdFilter}` : ""}`);
  console.log("🧭 Cargando mapa de grupos (groupId -> name)...");

  const groupMap = await buildGroupMap(db);

  // ⚠️ Firestore: collectionGroup + where. Requiere índice si no existe.
  let q: FirebaseFirestore.Query = db.collectionGroup("matches").where("delegateId", "==", delegateId);

  if (importBatchIdFilter) {
    q = q.where("importBatchId", "==", importBatchIdFilter);
  }

  console.log("📚 Leyendo matches...");
  const snap = await q.get();
  console.log(`📦 Documentos leídos: ${snap.size}`);

  const rows: MatchRow[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as any;

    const source = String(d.source ?? "");
    if (!source.toLowerCase().startsWith(sourcePrefix)) continue;

    const kickoffAt = toDateSafe(d.kickoff);
    const kickoffISO = kickoffAt ? kickoffAt.toISOString() : "";

    const matchdayNumber =
      typeof d.matchdayNumber === "number" ? d.matchdayNumber : d.matchdayNumber ? Number(d.matchdayNumber) : null;

    const homeTeamName = String(d.homeTeamName ?? "");
    const awayTeamName = String(d.awayTeamName ?? "");

    const leagueId = String(d.leagueId ?? "");
    const groupId = String(d.groupId ?? "");
    const groupName = groupMap.get(groupId) ?? (groupId || "—");

    const compareKey = buildCompareKey({
      leagueId,
      groupId,
      matchdayNumber,
      homeTeamName,
      awayTeamName,
      kickoffISO,
    });

    rows.push({
      groupName,

      leagueId,
      groupId,

      matchdayNumber,

      kickoffAt,
      kickoffISO,

      homeTeamName,
      awayTeamName,

      venueName: String(d.venueName ?? ""),
      municipality: String(d.municipality ?? ""),

      centralRefereeName: String(d.centralRefereeName ?? ""),
      aa1RefereeName: String(d.aa1RefereeName ?? ""),
      aa2RefereeName: String(d.aa2RefereeName ?? ""),
      assessorsNames: Array.isArray(d.assessorsNames)
        ? d.assessorsNames.join(", ")
        : Array.isArray(d.assessors)
          ? d.assessors.join(", ")
          : String(d.assessorsNames ?? ""),

      status: String(d.status ?? ""),
      source,
      importBatchId: String(d.importBatchId ?? ""),

      matchdayId: String(d.matchdayId ?? ""),
      homeTeamId: String(d.homeTeamId ?? ""),
      awayTeamId: String(d.awayTeamId ?? ""),
      venueId: String(d.venueId ?? ""),

      createdAt: toDateSafe(d.createdAt),
      createdBy: String(d.createdBy ?? ""),

      compareKey,
    });
  }

  if (!rows.length) {
    console.log(`⚠️  No se encontraron matches con source startsWith "${sourcePrefix}".`);
    return;
  }

  // Orden “bonito” y estable
  rows.sort((a, b) => {
    const g = a.groupName.localeCompare(b.groupName, "es");
    if (g !== 0) return g;

    const A = `${String(a.matchdayNumber ?? 0).padStart(3, "0")}|${a.kickoffISO}|${a.homeTeamName}`;
    const B = `${String(b.matchdayNumber ?? 0).padStart(3, "0")}|${b.kickoffISO}|${b.homeTeamName}`;
    return A.localeCompare(B, "es");
  });

  console.log(`✅ Matches exportables: ${rows.length}`);
  console.log("📄 Generando Excel...");

  const wb = new ExcelJS.Workbook();
  wb.creator = "referee-assignments";
  wb.created = new Date();

  const ws = wb.addWorksheet("MatchesImportados", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { header: "Grupo", key: "groupName", width: 28 },
    { header: "groupId", key: "groupId", width: 22 },
    { header: "leagueId", key: "leagueId", width: 22 },

    { header: "Jornada", key: "matchdayNumber", width: 10 },
    { header: "Kickoff (Excel Date)", key: "kickoffAt", width: 20 },
    { header: "Kickoff (ISO)", key: "kickoffISO", width: 26 },

    { header: "Local", key: "homeTeamName", width: 28 },
    { header: "Visitante", key: "awayTeamName", width: 28 },
    { header: "venueName", key: "venueName", width: 26 },
    { header: "municipality", key: "municipality", width: 16 },

    { header: "Central", key: "centralRefereeName", width: 28 },
    { header: "AA1", key: "aa1RefereeName", width: 28 },
    { header: "AA2", key: "aa2RefereeName", width: 28 },
    { header: "Assessors", key: "assessorsNames", width: 28 },

    { header: "status", key: "status", width: 12 },
    { header: "source", key: "source", width: 16 },
    { header: "importBatchId", key: "importBatchId", width: 22 },

    { header: "matchdayId", key: "matchdayId", width: 22 },
    { header: "homeTeamId", key: "homeTeamId", width: 22 },
    { header: "awayTeamId", key: "awayTeamId", width: 22 },
    { header: "venueId", key: "venueId", width: 22 },

    { header: "createdAt", key: "createdAt", width: 20 },
    { header: "createdBy", key: "createdBy", width: 22 },

    { header: "compareKey", key: "compareKey", width: 60 },
  ];

  // Header
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.height = 18;

  rows.forEach((r) => ws.addRow(r));

  // Formatos tipo export-teams-excel.ts
  ws.getColumn("matchdayNumber").numFmt = "0";
  ws.getColumn("kickoffAt").numFmt = "yyyy-mm-dd hh:mm";
  ws.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm";

  // Bordes + wrap en columnas largas
  const WRAP_KEYS = new Set(["venueName", "assessorsNames", "compareKey"]);
  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "top" };
    });

    if (rowNumber > 1) {
      // wrap solo en celdas largas
      for (const key of WRAP_KEYS) {
        const col = ws.getColumn(key);
        if (col?.number) {
          row.getCell(col.number).alignment = { wrapText: true, vertical: "top" };
        }
      }
    }
  });

  const outDir = path.join(process.cwd(), "exports");
  fs.mkdirSync(outDir, { recursive: true });

  const yyyyMmDd = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `matches_imported_${delegateId}_${yyyyMmDd}.xlsx`);

  await wb.xlsx.writeFile(outFile);
  console.log(`✅ Excel creado: ${outFile}`);
}

async function main() {
  const delegateId = process.env.DELEGATE_ID?.trim();
  if (!delegateId) {
    console.error("❌ Falta DELEGATE_ID. Ejemplo en PowerShell:");
    console.error('   $env:DELEGATE_ID="del_jalisco"');
    console.error("   npx tsx scripts/export-imported-matches-excel.ts");
    process.exit(1);
  }

  await exportToExcel(delegateId);
}

main().catch((err) => {
  console.error("❌ Error exportando:", err);
  process.exit(1);
});
