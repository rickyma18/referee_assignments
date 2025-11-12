// src/app/api/catalogs/venues/seed/route.ts
import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";
import "@/server/admin/firebase-admin";

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(req: Request) {
  try {
    const { leagueId, groupId } = await req.json();
    if (!leagueId || !groupId) {
      return NextResponse.json({ ok: false, message: "leagueId y groupId requeridos" }, { status: 400 });
    }
    const db = getFirestore();

    const teamsSnap = await db.collection("teams").where("groupId", "==", groupId).get();

    // nombres únicos (por case/trim) -> id por slug
    const byName = new Map<string, { name: string }>();
    for (const d of teamsSnap.docs) {
      const raw = (d.get("stadium") ?? d.get("venue") ?? "").toString().trim();
      if (!raw) continue;
      const key = raw.toLowerCase().trim();
      if (!byName.has(key)) byName.set(key, { name: raw });
    }

    const batch = db.batch();
    let created = 0;

    for (const { name } of byName.values()) {
      const id = slugify(`${groupId}-${name}`).slice(0, 200);
      const ref = db.collection("venues").doc(id);
      const snap = await ref.get();
      if (snap.exists) continue;
      batch.set(ref, {
        name,
        groupId,
        leagueId, // útil si quieres reforzar rules
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      created++;
    }

    if (created > 0) await batch.commit();
    return NextResponse.json({ ok: true, created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? "Error interno" }, { status: 500 });
  }
}
