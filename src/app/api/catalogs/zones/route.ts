// src/app/api/catalogs/zones/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getFirestore } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { DEFAULT_ZONES } from "@/config/zones.constants";

/**
 * GET /api/catalogs/zones?active=true&q=tla&limit=100&orderBy=order
 * - Si existen docs en /zones => responde {id,name}
 * - Si no existen => responde DEFAULT_ZONES (solo {id,name})
 * - Opcional: ?seed=true para escribir DEFAULT_ZONES en Firestore si está vacío
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const activeParam = searchParams.get("active");
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const limitParam = parseInt(searchParams.get("limit") ?? "200", 10);
    const orderBy = searchParams.get("orderBy"); // "order"
    const seed = searchParams.get("seed") === "true";

    const db = getFirestore();
    let query: FirebaseFirestore.Query = db.collection("zones");

    if (activeParam === "true" || activeParam === "false") {
      query = query.where("active", "==", activeParam === "true");
    }
    if (orderBy === "order") {
      query = query.orderBy("order", "asc");
    }
    query = query.limit(Math.min(Math.max(limitParam, 1), 500));

    const snap = await query.get();

    // Si NO hay documentos en Firestore
    if (snap.empty) {
      // Semillado opcional (puedes protegerlo con un token o rol)
      if (seed) {
        const batch = db.batch();
        for (const z of DEFAULT_ZONES) {
          const ref = db.collection("zones").doc(z.id);
          batch.set(ref, { name: z.name, order: z.order, active: z.active, name_lc: z.name.toLowerCase() });
        }
        await batch.commit();
      }

      // Fallback: responde la constante
      let rows = DEFAULT_ZONES.map(({ id, name }) => ({ id, name }));
      if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
      return NextResponse.json(rows, { status: 200 });
    }

    // Hay documentos: responder Firestore
    let rows = snap.docs.map((d) => {
      const data = d.data() || {};
      return { id: d.id, name: (data.name as string) || "" };
    });

    if (q) {
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }

    return NextResponse.json(rows, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message ?? "Error al obtener zonas" }, { status: 500 });
  }
}
