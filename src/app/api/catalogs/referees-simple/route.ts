import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";

export async function GET() {
  try {
    const db = getFirestore();
    const snap = await db.collection("referees").get();

    const referees = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name ?? "Sin nombre",
      };
    });

    return NextResponse.json({ ok: true, referees });
  } catch (e) {
    console.error("Error loading referees:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
