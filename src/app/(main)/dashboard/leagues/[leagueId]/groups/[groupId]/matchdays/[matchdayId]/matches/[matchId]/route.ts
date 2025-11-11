// src/app/api/leagues/[leagueId]/groups/[groupId]/matchdays/[matchdayId]/matches/[matchId]/route.ts
import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";
import "@/server/admin/firebase-admin";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ leagueId: string; groupId: string; matchdayId: string; matchId: string }> },
) {
  const { leagueId, groupId, matchdayId, matchId } = await ctx.params;
  const db = getFirestore();

  try {
    // 1) Intento directo por la ruta del URL
    const directRef = db
      .collection("leagues")
      .doc(leagueId)
      .collection("groups")
      .doc(groupId)
      .collection("matchdays")
      .doc(matchdayId)
      .collection("matches")
      .doc(matchId);

    const directSnap = await directRef.get();
    if (directSnap.exists) {
      await directRef.delete();
      return NextResponse.json({ ok: true, mode: "direct" });
    }

    // 2) Fallback: encontrar el doc por collectionGroup con los 3 IDs
    const q = await db
      .collectionGroup("matches")
      .where("leagueId", "==", leagueId)
      .where("groupId", "==", groupId)
      .where("matchdayId", "==", matchdayId)
      .get();

    const found = q.docs.find((d) => d.id === matchId);
    if (found) {
      await found.ref.delete();
      return NextResponse.json({ ok: true, mode: "fallback", path: found.ref.path });
    }

    // 3) Ultra fallback: buscar por id en todo collectionGroup (por si el matchday guardado difiere)
    const anyQ = await db.collectionGroup("matches").get();
    const anywhere = anyQ.docs.find((d) => d.id === matchId);
    if (anywhere) {
      console.warn("[DELETE match] Doc encontrado en otra ruta:", anywhere.ref.path);
      await anywhere.ref.delete();
      return NextResponse.json({ ok: true, mode: "anywhere", path: anywhere.ref.path });
    }

    return NextResponse.json({ ok: false, message: "El partido no existe." }, { status: 404 });
  } catch (err: any) {
    console.error("[DELETE match] error:", err);
    return NextResponse.json(
      { ok: false, message: err?.message ?? "No se pudo eliminar el partido." },
      { status: 500 },
    );
  }
}
