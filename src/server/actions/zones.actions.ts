"use server";

import { getFirestore } from "firebase-admin/firestore";
import "@/server/admin/firebase-admin";

export async function getZonesAction() {
  const db = getFirestore();
  const snapshot = await db.collection("zones").where("active", "==", true).orderBy("order").get();

  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
