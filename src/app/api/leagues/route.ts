import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const delegateId = searchParams.get("delegateId");

    const db = getFirestore();

    // ✅ Multi-tenant: filtrar por delegateId si se proporciona
    let query: FirebaseFirestore.Query = db.collection("leagues");
    if (delegateId) {
      query = query.where("delegateId", "==", delegateId);
    }

    const snap = await query.get();

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
