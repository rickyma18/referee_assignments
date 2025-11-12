// ============================================
// src/server/actions/catalogs.actions.ts
// ============================================
"use server";
import "server-only";
import { getFirestore } from "firebase-admin/firestore";

// 🔹 Normalizador (quita acentos, mayúsculas y espacios)
function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function fixMojibake(s: string) {
  try {
    return Buffer.from(s, "latin1").toString("utf8");
  } catch {
    return s;
  }
}

// ==================================================
// Buscar equipo por nombre exacto o normalizado
// ==================================================
export async function findTeamIdByExactName(leagueId: string, groupId: string, name: string) {
  const db = getFirestore();
  const teamsSnap = await db.collection("teams").where("groupId", "==", groupId).get();

  const target = norm(name);
  for (const doc of teamsSnap.docs) {
    const teamName = String(doc.get("name") ?? "");
    if (norm(teamName) === target) return doc.id;
  }
  return null;
}

// ==================================================
// Buscar sede (venue) por nombre exacto o normalizado
// ==================================================
export async function findVenueByExactName(leagueId: string, groupId: string, venueName: string) {
  const db = getFirestore();
  const venuesSnap = await db.collection("venues").where("groupId", "==", groupId).get();

  const target = norm(venueName);
  for (const doc of venuesSnap.docs) {
    const name = String(doc.get("name") ?? "");
    if (norm(name) === target) {
      return { venueId: doc.id, venueName: name };
    }
  }
  return null;
}

// ==================================================
// Listado de equipos y sedes para los combos del form
// ==================================================
export async function listTeamsAndVenuesAction({ leagueId, groupId }: { leagueId: string; groupId: string }) {
  const db = getFirestore();
  const [teamsSnap, venuesSnap] = await Promise.all([
    db.collection("teams").where("groupId", "==", groupId).get(),
    db.collection("venues").where("groupId", "==", groupId).get(),
  ]);

  return {
    ok: true,
    teams: teamsSnap.docs.map((d) => ({
      id: d.id,
      name: String(d.get("name") ?? ""),
      stadium: String(d.get("stadium") ?? d.get("venue") ?? ""),
    })),
    venues: venuesSnap.docs.map((d) => ({
      id: d.id,
      name: String(d.get("name") ?? ""),
    })),
  };
}

// ==================================================
// Sembrar /venues automáticamente desde los equipos
// ==================================================
export async function upsertVenuesFromTeams(leagueId: string, groupId: string) {
  const db = getFirestore();
  const [teamsSnap, venuesSnap] = await Promise.all([
    db.collection("teams").where("groupId", "==", groupId).get(),
    db.collection("venues").where("groupId", "==", groupId).get(),
  ]);

  const existing = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  venuesSnap.forEach((d) => existing.set(norm(String(d.get("name") ?? "")), d));

  const batch = db.batch();
  let created = 0;

  for (const t of teamsSnap.docs) {
    const raw = String(t.get("stadium") ?? t.get("venue") ?? "").trim();
    if (!raw) continue;
    const fixed = fixMojibake(raw);
    const key = norm(fixed);
    if (existing.has(key)) continue;

    const ref = db.collection("venues").doc();
    batch.set(ref, {
      name: fixed,
      leagueId,
      groupId,
      name_lc: fixed.toLowerCase().trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    created++;
  }

  if (created > 0) await batch.commit();
  return { ok: true, created };
}
