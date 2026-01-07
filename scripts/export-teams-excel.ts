// scripts/export-teams-excel.ts
//
// Exporta equipos de un delegateId a Excel ordenado por grupo.
//
// PowerShell:
//   $env:DELEGATE_ID="del_jalisco"
//   npx tsx scripts/export-teams-excel.ts
//
// Output:
//   exports/teams_<delegateId>_<YYYY-MM-DD>.xlsx

import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import { getAdminDb } from "./_lib/firebase-admin"; // 👈 usa tu init que lee .env.local

type TeamRow = {
  groupName: string;
  groupId: string;
  teamName: string;
  stadium: string;
  municipality: string;
  venue: string;
  tier: string;
  travelKm: number | null;
  travelCarMin: number | null;
  travelPublicMin: number | null;
  travelSource: string | null;
  travelUpdatedAt: Date | null;
  updatedAt: Date | null;
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

async function buildGroupMap(db: FirebaseFirestore.Firestore) {
  // Map: groupId -> group.name
  // ✅ No documentId() filters. Solo recorremos todos los groups.
  const snap = await db.collectionGroup("groups").select("name").get();
  const map = new Map<string, string>();

  snap.forEach((doc) => {
    const data = doc.data() as any;
    map.set(doc.id, String(data?.name ?? doc.id));
  });

  return map;
}

async function fetchTeamsByDelegate(db: FirebaseFirestore.Firestore, delegateId: string) {
  const snap = await db.collection("teams").where("delegateId", "==", delegateId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

async function exportToExcel(delegateId: string) {
  const db = getAdminDb();

  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    "unknown";

  console.log(`📦 Project: ${projectId}`);
  console.log(`🎯 Exportando teams del delegateId=${delegateId}`);
  console.log("🧭 Cargando mapa de grupos (groupId -> name)...");

  const groupMap = await buildGroupMap(db);

  console.log("🏟️  Cargando equipos...");
  const teams = await fetchTeamsByDelegate(db, delegateId);

  if (!teams.length) {
    console.log("⚠️  No se encontraron equipos para ese delegateId.");
    return;
  }

  const rows: TeamRow[] = teams
    .map((t: any) => {
      const groupId = String(t.groupId ?? "");
      const groupName = groupMap.get(groupId) ?? (groupId || "—");

      return {
        groupName,
        groupId,
        teamName: String(t.name ?? ""),
        stadium: String(t.stadium ?? ""),
        municipality: String(t.municipality ?? ""),
        venue: String(t.venue ?? ""),
        tier: String(t.tier ?? ""),
        travelKm: typeof t.travelKmToLopezMateos === "number" ? t.travelKmToLopezMateos : null,
        travelCarMin: typeof t.travelCarMaxMinToLopezMateos === "number" ? t.travelCarMaxMinToLopezMateos : null,
        travelPublicMin:
          typeof t.travelPublicMaxMinToLopezMateos === "number" ? t.travelPublicMaxMinToLopezMateos : null,
        travelSource: t.travelSource ?? null,
        travelUpdatedAt: toDateSafe(t.travelUpdatedAt),
        updatedAt: toDateSafe(t.updatedAt),
      };
    })
    .sort((a, b) => {
      const g = a.groupName.localeCompare(b.groupName, "es");
      if (g !== 0) return g;
      return a.teamName.localeCompare(b.teamName, "es");
    });

  console.log("📄 Generando Excel...");

  const wb = new ExcelJS.Workbook();
  wb.creator = "referee-assignments";
  wb.created = new Date();

  const ws = wb.addWorksheet("Teams", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { header: "Grupo", key: "groupName", width: 28 },
    { header: "Group ID", key: "groupId", width: 22 },
    { header: "Equipo", key: "teamName", width: 30 },
    { header: "Estadio", key: "stadium", width: 34 },
    { header: "Municipio", key: "municipality", width: 18 },
    { header: "Dirección (venue)", key: "venue", width: 40 },
    { header: "Tier", key: "tier", width: 14 },
    { header: "Km a López Mateos", key: "travelKm", width: 18 },
    { header: "Car max min a López Mateos", key: "travelCarMin", width: 26 },
    { header: "Public max min a López Mateos", key: "travelPublicMin", width: 28 },
    { header: "Travel source", key: "travelSource", width: 22 },
    { header: "Travel updated at", key: "travelUpdatedAt", width: 20 },
    { header: "Updated at", key: "updatedAt", width: 20 },
  ];

  // Header
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.height = 18;

  rows.forEach((r) => ws.addRow(r));

  // formatos
  ws.getColumn("travelKm").numFmt = "0";
  ws.getColumn("travelCarMin").numFmt = "0";
  ws.getColumn("travelPublicMin").numFmt = "0";
  ws.getColumn("travelUpdatedAt").numFmt = "yyyy-mm-dd hh:mm";
  ws.getColumn("updatedAt").numFmt = "yyyy-mm-dd hh:mm";

  // wrap venue + bordes
  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "top" };
    });

    if (rowNumber > 1) {
      row.getCell("venue").alignment = { wrapText: true, vertical: "top" };
    }
  });

  const outDir = path.join(process.cwd(), "exports");
  fs.mkdirSync(outDir, { recursive: true });

  const yyyyMmDd = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `teams_${delegateId}_${yyyyMmDd}.xlsx`);

  await wb.xlsx.writeFile(outFile);

  console.log(`✅ Excel creado: ${outFile}`);
}

async function main() {
  const delegateId = process.env.DELEGATE_ID?.trim();
  if (!delegateId) {
    console.error("❌ Falta DELEGATE_ID. Ejemplo en PowerShell:");
    console.error('   $env:DELEGATE_ID="del_jalisco"');
    console.error("   npx tsx scripts/export-teams-excel.ts");
    process.exit(1);
  }

  await exportToExcel(delegateId);
}

main().catch((err) => {
  console.error("❌ Error exportando:", err);
  process.exit(1);
});
