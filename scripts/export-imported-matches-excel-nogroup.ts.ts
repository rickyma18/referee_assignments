// scripts/export-imported-matches-excel-nogroup.ts
//
// Exporta matches importados SIN collectionGroup (evita índices).
//
// PowerShell:
//   $env:DELEGATE_ID="del_jalisco"
//   $env:SOURCE_PREFIX="fmf_excel"     # optional
//   $env:IMPORT_BATCH_ID=""           # optional
//   npx tsx scripts/export-imported-matches-excel-nogroup.ts
//
// Output:
//   exports/matches_imported_<delegateId>_<YYYY-MM-DD>.xlsx

import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { DateTime } from "luxon";

import { getAdminDb } from "./_lib/firebase-admin";

const ALLOWED_GROUPS = [
  { leagueId: "eoc6ubocSU9giuug8Yl6", groupId: "NAK2FN6ZgXi8MbhzSnAW", label: "LTDP GRUPO 13" },
  { leagueId: "eoc6ubocSU9giuug8Yl6", groupId: "C1ck0Sl8qOs6U0bFlV3B", label: "LTDP GRUPO 14" },
  { leagueId: "eoc6ubocSU9giuug8Yl6", groupId: "knIIB4rj611CsE2Z2YJq", label: "LTDP GRUPO 15" },
  { leagueId: "KYtzwc6qJ3zxBDlgnnUY", groupId: "BUXXff1MmrC0ALp5onKV", label: "LTDP FEMENIL GRUPO 4" },
] as const;

type OutRow = {
  categoryLabel: string;
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchdayNumber: number | null;

  homeTeamName: string;
  awayTeamName: string;

  kickoffLocal: string;
  kickoffISO: string;

  venueName: string;
  municipality: string;

  centralRefereeName: string;
  aa1RefereeName: string;
  aa2RefereeName: string;
  assessors: string;

  status: string;
  source: string;
  importBatchId: string;

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

function buildCompareKey(r: {
  leagueId: string;
  groupId: string;
  matchdayNumber: number | null;
  homeTeamName: string;
  awayTeamName: string;
  kickoffISO: string;
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

async function main() {
  const delegateId = process.env.DELEGATE_ID?.trim();
  if (!delegateId) {
    console.error('❌ Falta DELEGATE_ID. Ej: $env:DELEGATE_ID="del_jalisco"');
    process.exit(1);
  }

  const sourcePrefix = (
    process.env.SOURCE_PREFIX?.trim() ? process.env.SOURCE_PREFIX.trim() : "fmf_excel"
  ).toLowerCase();
  const importBatchIdFilter = (process.env.IMPORT_BATCH_ID?.trim() ?? "").trim();

  const db = getAdminDb();

  console.log(`🎯 Exportando matches importados para delegateId=${delegateId}`);
  console.log(`🔎 sourcePrefix=${sourcePrefix}${importBatchIdFilter ? `, importBatchId=${importBatchIdFilter}` : ""}`);
  console.log(`🧭 Recorriendo ${ALLOWED_GROUPS.length} grupos (sin collectionGroup)...`);

  const rows: OutRow[] = [];

  for (const g of ALLOWED_GROUPS) {
    console.log(`\n📌 ${g.label}  leagueId=${g.leagueId} groupId=${g.groupId}`);

    const matchdaysRef = db.collection(`leagues/${g.leagueId}/groups/${g.groupId}/matchdays`);
    const mdSnap = await matchdaysRef.get();
    console.log(`  - matchdays: ${mdSnap.size}`);

    for (const mdDoc of mdSnap.docs) {
      const mdData = mdDoc.data() as any;
      const matchdayNumber =
        typeof mdData.number === "number" ? mdData.number : mdData.number ? Number(mdData.number) : null;

      const matchesRef = mdDoc.ref.collection("matches");
      const matchesSnap = await matchesRef.get();

      for (const mDoc of matchesSnap.docs) {
        const d = mDoc.data() as any;

        // filtros en memoria (sin índices)
        if (String(d.delegateId ?? "") !== delegateId) continue;

        const source = String(d.source ?? "");
        if (!source.toLowerCase().startsWith(sourcePrefix)) continue;

        if (importBatchIdFilter && String(d.importBatchId ?? "") !== importBatchIdFilter) continue;

        const kickoffDate = toDateSafe(d.kickoff);
        const kickoffISO = kickoffDate ? kickoffDate.toISOString() : "";
        const kickoffLocal = kickoffDate
          ? DateTime.fromJSDate(kickoffDate, { zone: "America/Mexico_City" }).toFormat("dd-MM-yyyy HH:mm")
          : "";

        const homeTeamName = String(d.homeTeamName ?? "");
        const awayTeamName = String(d.awayTeamName ?? "");

        const compareKey = buildCompareKey({
          leagueId: g.leagueId,
          groupId: g.groupId,
          matchdayNumber,
          homeTeamName,
          awayTeamName,
          kickoffISO,
        });

        rows.push({
          categoryLabel: g.label,
          leagueId: g.leagueId,
          groupId: g.groupId,
          matchdayId: mdDoc.id,
          matchdayNumber,

          homeTeamName,
          awayTeamName,

          kickoffLocal,
          kickoffISO,

          venueName: String(d.venueName ?? ""),
          municipality: String(d.municipality ?? ""),

          centralRefereeName: String(d.centralRefereeName ?? ""),
          aa1RefereeName: String(d.aa1RefereeName ?? ""),
          aa2RefereeName: String(d.aa2RefereeName ?? ""),
          assessors: Array.isArray(d.assessorsNames)
            ? d.assessorsNames.join(", ")
            : Array.isArray(d.assessors)
              ? d.assessors.join(", ")
              : String(d.assessorsNames ?? ""),

          status: String(d.status ?? ""),
          source,
          importBatchId: String(d.importBatchId ?? ""),

          compareKey,
        });
      }
    }
  }

  rows.sort((a, b) => {
    const A = `${a.leagueId}|${a.groupId}|${String(a.matchdayNumber ?? 0).padStart(3, "0")}|${a.kickoffISO}|${a.homeTeamName}`;
    const B = `${b.leagueId}|${b.groupId}|${String(b.matchdayNumber ?? 0).padStart(3, "0")}|${b.kickoffISO}|${b.homeTeamName}`;
    return A.localeCompare(B, "es");
  });

  console.log(`\n✅ Matches exportables: ${rows.length}`);

  const wb = new ExcelJS.Workbook();
  wb.creator = "referee-assignments";
  wb.created = new Date();

  const ws = wb.addWorksheet("MatchesImportados", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { header: "Categoría", key: "categoryLabel", width: 20 },
    { header: "matchdayNumber", key: "matchdayNumber", width: 14 },
    { header: "kickoff (MX)", key: "kickoffLocal", width: 18 },
    { header: "kickoff (ISO)", key: "kickoffISO", width: 26 },

    { header: "Local", key: "homeTeamName", width: 28 },
    { header: "Visitante", key: "awayTeamName", width: 28 },
    { header: "venueName", key: "venueName", width: 26 },
    { header: "municipality", key: "municipality", width: 16 },

    { header: "Central", key: "centralRefereeName", width: 28 },
    { header: "AA1", key: "aa1RefereeName", width: 28 },
    { header: "AA2", key: "aa2RefereeName", width: 28 },
    { header: "Assessors", key: "assessors", width: 28 },

    { header: "status", key: "status", width: 12 },
    { header: "source", key: "source", width: 16 },
    { header: "importBatchId", key: "importBatchId", width: 22 },

    { header: "leagueId", key: "leagueId", width: 22 },
    { header: "groupId", key: "groupId", width: 22 },
    { header: "matchdayId", key: "matchdayId", width: 22 },

    { header: "compareKey", key: "compareKey", width: 60 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.height = 18;

  for (const r of rows) ws.addRow(r);

  ws.eachRow((row, idx) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "top", wrapText: idx > 1 };
    });
  });

  const outDir = path.join(process.cwd(), "exports");
  fs.mkdirSync(outDir, { recursive: true });

  const yyyyMmDd = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `matches_imported_${delegateId}_${yyyyMmDd}.xlsx`);

  await wb.xlsx.writeFile(outFile);
  console.log(`✅ Excel creado: ${outFile}`);
}

main().catch((err) => {
  console.error("❌ Error exportando:", err);
  process.exit(1);
});
