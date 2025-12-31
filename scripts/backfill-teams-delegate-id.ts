// scripts/backfill-teams-delegate-id.ts
import fs from "node:fs";
import path from "node:path";

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Admin init (service account + projectId explícito)
// ─────────────────────────────────────────────────────────────────────────────
function initAdmin() {
  if (getApps().length) return;

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS");

  const abs = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);
  const serviceAccount = JSON.parse(fs.readFileSync(abs, "utf8"));

  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

initAdmin();
const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 500;
const DRY_RUN = !process.argv.includes("--commit");

// Puedes forzar el leagueId por CLI si tus teams NO lo traen:
// npx ts-node --esm scripts/backfill-teams-delegate-id.ts --leagueId=BSRI9gMKSuh8tkmhHAoJ
const forcedLeagueId = process.argv.find((a) => a.startsWith("--leagueId="))?.split("=")[1];

// Cache: `${leagueId}` → delegateId|null
const leagueDelegateCache = new Map<string, string | null>();

async function getDelegateIdFromLeague(leagueId: string): Promise<string | null> {
  if (leagueDelegateCache.has(leagueId)) return leagueDelegateCache.get(leagueId) ?? null;

  const snap = await db.collection("leagues").doc(leagueId).get();
  if (!snap.exists) {
    leagueDelegateCache.set(leagueId, null);
    return null;
  }

  const delegateId = (snap.data()?.delegateId as string | undefined) ?? null;
  leagueDelegateCache.set(leagueId, delegateId);
  return delegateId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  BACKFILL teams.delegateId desde /leagues/{leagueId}.delegateId");
  console.log(`  Modo: ${DRY_RUN ? "🔍 DRY-RUN (sin cambios)" : "⚠️  COMMIT (cambios reales)"}`);
  if (forcedLeagueId) console.log(`  leagueId forzado: ${forcedLeagueId}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("🔍 Buscando teams sin delegateId...");
  const teamsSnap = await db.collection("teams").get();

  const teamsToMigrate: { id: string; name: string; leagueId: string | null }[] = [];
  let teamsAlreadyHaveDelegateId = 0;
  let teamsWithoutLeagueId = 0;

  for (const doc of teamsSnap.docs) {
    const data = doc.data();

    if (typeof data.delegateId === "string" && data.delegateId.trim()) {
      teamsAlreadyHaveDelegateId++;
      continue;
    }

    const leagueId =
      (data.leagueId as string | undefined) ??
      (data.leagueID as string | undefined) ??
      (data.league_id as string | undefined) ??
      forcedLeagueId ??
      null;

    if (!leagueId) {
      teamsWithoutLeagueId++;
      continue;
    }

    teamsToMigrate.push({
      id: doc.id,
      name: (data.name as string) ?? "(sin nombre)",
      leagueId,
    });
  }

  console.log(`   Total teams: ${teamsSnap.size}`);
  console.log(`   Ya tenían delegateId: ${teamsAlreadyHaveDelegateId}`);
  console.log(`   Sin leagueId: ${teamsWithoutLeagueId}`);
  console.log(`   A migrar: ${teamsToMigrate.length}\n`);

  if (!teamsToMigrate.length) {
    console.log("✅ No hay teams que migrar.\n");
    return;
  }

  console.log("🧩 Resolviendo delegateId desde leagues...");
  let resolvables = 0;
  let leagueNotFound = 0;
  let leagueHasNoDelegate = 0;

  for (const t of teamsToMigrate) {
    const delegateId = await getDelegateIdFromLeague(t.leagueId!);

    if (delegateId === null) {
      leagueNotFound++;
      console.log(`   ❌ ${t.name} | team=${t.id} | /leagues/${t.leagueId} NO existe`);
      continue;
    }

    if (!delegateId.trim()) {
      leagueHasNoDelegate++;
      console.log(`   ⚠️ ${t.name} | team=${t.id} | /leagues/${t.leagueId} delegateId vacío`);
      continue;
    }

    resolvables++;
    console.log(`   ✅ ${t.name} | team=${t.id} | delegateId=${delegateId} (de /leagues/${t.leagueId})`);
  }

  console.log("\n📌 Resumen resolución:");
  console.log(`   ✅ con delegateId: ${resolvables}`);
  console.log(`   ❌ league no existe: ${leagueNotFound}`);
  console.log(`   ⚠️ league sin delegateId: ${leagueHasNoDelegate}\n`);

  // Migrar en batches
  let migrated = 0;

  for (let i = 0; i < teamsToMigrate.length; i += BATCH_SIZE) {
    const chunk = teamsToMigrate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    let ops = 0;

    for (const t of chunk) {
      const delegateId = await getDelegateIdFromLeague(t.leagueId!);
      if (!delegateId || !delegateId.trim()) continue;

      batch.update(db.collection("teams").doc(t.id), {
        delegateId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      ops++;
    }

    if (!ops) continue;

    if (DRY_RUN) {
      console.log(`   [DRY-RUN] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${ops} teams`);
    } else {
      await batch.commit();
      console.log(`   [COMMIT] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${ops} teams`);
    }

    migrated += ops;
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  RESUMEN FINAL");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ✅ Migrados: ${migrated}`);
  console.log(
    DRY_RUN ? "\n  🔍 DRY-RUN. Ejecuta con --commit para aplicar cambios.\n" : "\n  ✅ Migración completada.\n",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error en migración:", err);
    process.exit(1);
  });
