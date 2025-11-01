export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { adminDb } from "@/server/admin/firebase-admin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seasonParam = (searchParams.get("season") ?? "").trim().toLowerCase();
    const searchParam = (searchParams.get("search") ?? "").trim().toLowerCase();

    let q = adminDb.collection("groups").orderBy("season_lc", "asc").orderBy("name_lc", "asc").limit(100);

    if (seasonParam) {
      q = adminDb.collection("groups").where("season_lc", "==", seasonParam).orderBy("name_lc", "asc").limit(100);
    }

    const snap = await q.get();
    let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    if (searchParam) {
      items = items.filter((g) => (g.name_lc ?? "").includes(searchParam));
    }

    const reduced = items.map((g) => ({
      id: g.id,
      name: g.name,
      season: g.season,
    }));

    return NextResponse.json(reduced, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/groups error:", err);
    return NextResponse.json({ error: err?.message ?? "Error al obtener grupos" }, { status: 500 });
  }
}
