// src/data/delegates.ts
import { collection, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { DelegateDoc, DelegateOption } from "@/types/delegate";

/**
 * Obtiene las delegaciones activas de Firestore.
 * - Filtra por isActive !== false (si isActive no existe, se considera true)
 * - Ordena por order asc si existe, si no por name
 * - Devuelve array de opciones para Select
 */
export async function getActiveDelegates(): Promise<DelegateOption[]> {
  const snap = await getDocs(collection(db, "delegates"));

  const delegates = snap.docs
    .map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as DelegateDoc,
    )
    .filter((d) => d.isActive !== false); // isActive undefined = true

  // Ordenar: primero por order (si existe), luego por name
  delegates.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    if (a.order !== undefined) return -1;
    if (b.order !== undefined) return 1;
    return (a.name ?? a.id).localeCompare(b.name ?? b.id);
  });

  // Convertir a opciones para Select
  return delegates.map((d) => ({
    value: d.id,
    label: d.name ?? d.id,
  }));
}
