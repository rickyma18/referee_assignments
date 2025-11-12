// src/app/api/firestore/delete-by-path/route.ts
import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";
import "@/server/admin/firebase-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { path } = await req.json();
    if (typeof path !== "string" || !path.includes("/")) {
      return NextResponse.json({ ok: false, message: "Path inválido." }, { status: 400 });
    }

    const db = getFirestore();
    const ref = db.doc(path);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, message: "El documento no existe." }, { status: 404 });
    }

    await ref.delete();
    return NextResponse.json({ ok: true, path });
  } catch (e: any) {
    console.error("[delete-by-path] error:", e);
    return NextResponse.json({ ok: false, message: e?.message ?? "Error al eliminar por path." }, { status: 500 });
  }
}
