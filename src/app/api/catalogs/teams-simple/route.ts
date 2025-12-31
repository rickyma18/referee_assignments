// src/app/api/catalogs/teams-simple/route.ts
import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";
import "@/server/admin/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const delegateId = searchParams.get("delegateId");

    const db = getFirestore();

    // ✅ Multi-tenant: filtrar por delegateId si se proporciona
    let query: FirebaseFirestore.Query = db.collection("teams");
    if (delegateId) {
      query = query.where("delegateId", "==", delegateId);
    }

    const snap = await query.get();

    const collator = new Intl.Collator("es", {
      sensitivity: "base",
      ignorePunctuation: true,
      numeric: true,
    });

    const teams = snap.docs
      .map((d) => ({
        id: d.id,
        name: String(d.get("name") ?? ""),
      }))
      .filter((t) => t.name.trim().length > 0)
      .sort((a, b) => collator.compare(a.name, b.name));

    return NextResponse.json({
      ok: true,
      teams,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? "Error al obtener equipos" }, { status: 500 });
  }
}
