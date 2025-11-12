// src/app/api/admin/seed-venues/route.ts
import { NextResponse } from "next/server";

import "@/server/admin/firebase-admin";
import { upsertVenuesFromTeams } from "@/server/actions/catalogs.actions";

// Opcional: limitar a Node.js runtime (no edge)
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { leagueId, groupId } = await req.json();

    if (!leagueId || !groupId) {
      return NextResponse.json({ ok: false, message: "leagueId y groupId requeridos" }, { status: 400 });
    }

    const res = await upsertVenuesFromTeams(leagueId, groupId);
    return NextResponse.json(res); // <- sin duplicar `ok`
    // o: const { ok, created } = res; return NextResponse.json({ ok, created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? "Error interno" }, { status: 500 });
  }
}
