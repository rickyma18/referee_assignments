// scripts/backfill-match-logos.ts
//
// Backfill homeTeamLogoUrl / awayTeamLogoUrl on existing match docs.
//
// Usage:
//   npx ts-node --esm scripts/backfill-match-logos.ts                          # dry-run, ALL matches
//   npx ts-node --esm scripts/backfill-match-logos.ts --commit                 # write ALL
//   npx ts-node --esm scripts/backfill-match-logos.ts --leagueId=ABC           # filter by league
//   npx ts-node --esm scripts/backfill-match-logos.ts --leagueId=ABC --groupId=XYZ
//   npx ts-node --esm scripts/backfill-match-logos.ts --leagueId=ABC --groupId=XYZ --matchdayId=M1
//   npx ts-node --esm scripts/backfill-match-logos.ts --days=60                # only kickoff >= now-60d
//   npx ts-node --esm scripts/backfill-match-logos.ts --all                    # no kickoff filter (default)
//
// Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON.

import fs from "node:fs";
import path from "node:path";

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Firebase Admin init ─────────────────────────────────────────────────
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

// ── CLI args ────────────────────────────────────────────────────────────
const BATCH_SIZE = 499;
const DRY_RUN = !process.argv.includes("--commit");

function getArg(name: string): string | undefined {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag?.split("=")[1];
}

const filterLeagueId = getArg("leagueId");
const filterGroupId = getArg("groupId");
const filterMatchdayId = getArg("matchdayId");
const daysArg = getArg("days");
const useAll = process.argv.includes("--all") || !daysArg;
const daysCutoff = daysArg ? parseInt(daysArg, 10) : null;

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "COMMIT"}`);
  if (filterLeagueId) console.log(`  Filter leagueId: ${filterLeagueId}`);
  if (filterGroupId) console.log(`  Filter groupId: ${filterGroupId}`);
  if (filterMatchdayId) console.log(`  Filter matchdayId: ${filterMatchdayId}`);
  if (daysCutoff) console.log(`  Kickoff cutoff: >= now - ${daysCutoff} days`);
  else console.log(`  Kickoff cutoff: NONE (all matches)`);

  let cutoff: Date | null = null;
  if (daysCutoff && daysCutoff > 0) {
    cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysCutoff);
  }

  // Team logo cache: "leagueId__teamId" → logoUrl | null
  const logoCache = new Map<string, string | null>();

  async function resolveLogoUrl(teamId: string, leagueId: string): Promise<string | null> {
    const cacheKey = `${leagueId}__${teamId}`;
    if (logoCache.has(cacheKey)) return logoCache.get(cacheKey)!;

    let logoUrl: string | null = null;

    // Priority 1: leagues/{leagueId}/teams/{teamId}
    try {
      const leagueTeamSnap = await db.collection("leagues").doc(leagueId).collection("teams").doc(teamId).get();
      if (leagueTeamSnap.exists) {
        const d = leagueTeamSnap.data()!;
        logoUrl = typeof d.logoUrl === "string" && d.logoUrl.trim() ? d.logoUrl.trim() : null;
      }
    } catch {
      /* noop */
    }

    // Priority 2: teams/{teamId}
    if (logoUrl == null) {
      try {
        const rootTeamSnap = await db.collection("teams").doc(teamId).get();
        if (rootTeamSnap.exists) {
          const d = rootTeamSnap.data()!;
          logoUrl = typeof d.logoUrl === "string" && d.logoUrl.trim() ? d.logoUrl.trim() : null;
        }
      } catch {
        /* noop */
      }
    }

    logoCache.set(cacheKey, logoUrl);
    return logoUrl;
  }

  // ── Traverse ────────────────────────────────────────────────────────
  let totalScanned = 0;
  let totalSkipped = 0;

  const pendingUpdates: Array<{
    ref: FirebaseFirestore.DocumentReference;
    data: Record<string, unknown>;
  }> = [];

  async function processMatchDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[], leagueId: string) {
    for (const matchDoc of docs) {
      totalScanned++;
      const data = matchDoc.data();
      const homeTeamId = data.homeTeamId as string | undefined;
      const awayTeamId = data.awayTeamId as string | undefined;

      if (!homeTeamId || !awayTeamId) {
        totalSkipped++;
        continue;
      }

      // Skip if already populated
      const hasHome = typeof data.homeTeamLogoUrl === "string";
      const hasAway = typeof data.awayTeamLogoUrl === "string";
      if (hasHome && hasAway) {
        totalSkipped++;
        continue;
      }

      const updates: Record<string, unknown> = {};

      if (!hasHome) {
        updates.homeTeamLogoUrl = await resolveLogoUrl(homeTeamId, leagueId);
      }
      if (!hasAway) {
        updates.awayTeamLogoUrl = await resolveLogoUrl(awayTeamId, leagueId);
      }

      if (Object.keys(updates).length > 0) {
        pendingUpdates.push({ ref: matchDoc.ref, data: updates });
      }
    }
  }

  // Resolve league list
  let leagueDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (filterLeagueId) {
    const snap = await db.collection("leagues").doc(filterLeagueId).get();
    if (!snap.exists) {
      console.error(`League ${filterLeagueId} not found.`);
      return;
    }
    leagueDocs = [snap as any];
  } else {
    leagueDocs = (await db.collection("leagues").get()).docs;
  }

  for (const leagueDoc of leagueDocs) {
    const leagueId = leagueDoc.id;

    let groupDocs: FirebaseFirestore.QueryDocumentSnapshot[];
    if (filterGroupId) {
      const snap = await db.collection("leagues").doc(leagueId).collection("groups").doc(filterGroupId).get();
      if (!snap.exists) continue;
      groupDocs = [snap as any];
    } else {
      groupDocs = (await db.collection("leagues").doc(leagueId).collection("groups").get()).docs;
    }

    for (const groupDoc of groupDocs) {
      const groupId = groupDoc.id;

      let matchdayDocs: FirebaseFirestore.QueryDocumentSnapshot[];
      if (filterMatchdayId) {
        const snap = await db
          .collection("leagues")
          .doc(leagueId)
          .collection("groups")
          .doc(groupId)
          .collection("matchdays")
          .doc(filterMatchdayId)
          .get();
        if (!snap.exists) continue;
        matchdayDocs = [snap as any];
      } else {
        matchdayDocs = (
          await db.collection("leagues").doc(leagueId).collection("groups").doc(groupId).collection("matchdays").get()
        ).docs;
      }

      for (const mdDoc of matchdayDocs) {
        const matchdayId = mdDoc.id;
        const matchesCol = db
          .collection("leagues")
          .doc(leagueId)
          .collection("groups")
          .doc(groupId)
          .collection("matchdays")
          .doc(matchdayId)
          .collection("matches");

        let query: FirebaseFirestore.Query = matchesCol;
        if (cutoff) {
          query = query.where("kickoff", ">=", cutoff);
        }

        const matchesSnap = await query.get();

        await processMatchDocs(matchesSnap.docs, leagueId);
      }
    }
  }

  console.log(
    `\nScanned: ${totalScanned}, to update: ${pendingUpdates.length}, skipped (already have logos): ${totalSkipped}`,
  );
  console.log(`Logo cache entries: ${logoCache.size}`);

  if (DRY_RUN) {
    console.log("\nDRY-RUN — no writes performed. Use --commit to write.");
    for (const u of pendingUpdates.slice(0, 10)) {
      console.log(`  ${u.ref.path} →`, u.data);
    }
    if (pendingUpdates.length > 10) {
      console.log(`  ... and ${pendingUpdates.length - 10} more`);
    }
    return;
  }

  // Batch writes (499 per batch)
  let totalUpdated = 0;
  for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
    const chunk = pendingUpdates.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const u of chunk) {
      batch.update(u.ref, u.data);
    }
    await batch.commit();
    totalUpdated += chunk.length;
    console.log(`  Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} docs)`);
  }

  console.log(`\nDone. Updated ${totalUpdated} matches.`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
