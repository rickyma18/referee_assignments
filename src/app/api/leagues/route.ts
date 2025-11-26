import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";

export async function GET(_req: Request) {
  try {
    const db = getFirestore();
    const snap = await db.collection("leagues").get();

    const leagues = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name ?? "Sin nombre",
      };
    });

    return NextResponse.json({ ok: true, leagues });
  } catch (e: any) {
    console.error("Error loading leagues:", e);
    return NextResponse.json({ ok: false, message: "Error fetching leagues" }, { status: 500 });
  }
}
