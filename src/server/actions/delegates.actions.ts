// =====================================
// src/server/actions/delegates.actions.ts
// =====================================
"use server";
import "server-only";

import { adminDb } from "@/server/admin/firebase-admin";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { assertIsSuperuser } from "@/server/auth/require-delegate-access";

import { ForbiddenError } from "../auth/errors";

/**
 * Información mínima de un delegado para el selector.
 */
export type DelegateInfo = {
  uid: string;
  displayName: string | null;
  email: string;
  delegateId: string; // uid como fallback si no tiene delegateId
};

/**
 * Lista todos los usuarios con rol DELEGADO.
 *
 * Solo SUPERUSUARIO puede ejecutar esta acción.
 *
 * Nota: Si el usuario no tiene delegateId en su doc, usa uid como fallback.
 * Esto es temporal hasta la migración completa.
 */
export async function listDelegatesAction(): Promise<DelegateInfo[]> {
  try {
    const ctx = await getDelegateContext();
    assertIsSuperuser(ctx);

    // Buscar usuarios con rol DELEGADO
    const usersSnap = await adminDb.collection("users").where("role", "==", "DELEGADO").get();

    const delegates: DelegateInfo[] = usersSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        displayName: data.displayName ?? null,
        email: data.email ?? "",
        // Usar delegateId si existe, si no usar uid como fallback
        delegateId: data.delegateId ?? doc.id,
      };
    });

    // Ordenar por displayName o email
    delegates.sort((a, b) => {
      const nameA = a.displayName ?? a.email;
      const nameB = b.displayName ?? b.email;
      return nameA.localeCompare(nameB);
    });

    return delegates;
  } catch (e) {
    if (e instanceof ForbiddenError) {
      throw e;
    }
    console.error("Error listing delegates:", e);
    return [];
  }
}

/**
 * Lista delegados por IDs específicos.
 *
 * Usado por ARBITRO/ASISTENTE para cargar solo sus delegaciones permitidas.
 * No requiere SUPERUSUARIO porque solo devuelve info de delegados por IDs dados.
 */
export async function listDelegatesByIdsAction(delegateIds: string[]): Promise<DelegateInfo[]> {
  try {
    if (!delegateIds || delegateIds.length === 0) {
      return [];
    }

    // Buscar usuarios con rol DELEGADO que tengan estos delegateIds
    const usersSnap = await adminDb.collection("users").where("role", "==", "DELEGADO").get();

    const delegates: DelegateInfo[] = [];

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const docDelegateId = data.delegateId ?? doc.id;

      // Solo incluir si el delegateId está en la lista solicitada
      if (delegateIds.includes(docDelegateId)) {
        delegates.push({
          uid: doc.id,
          displayName: data.displayName ?? null,
          email: data.email ?? "",
          delegateId: docDelegateId,
        });
      }
    }

    // Si algunos delegateIds no tienen usuario DELEGADO asociado, crear entradas placeholder
    for (const delegateId of delegateIds) {
      if (!delegates.some((d) => d.delegateId === delegateId)) {
        delegates.push({
          uid: delegateId,
          displayName: null,
          email: "",
          delegateId,
        });
      }
    }

    // Ordenar por displayName o email o delegateId
    delegates.sort((a, b) => {
      const nameA = a.displayName ?? a.email ?? a.delegateId;
      const nameB = b.displayName ?? b.email ?? b.delegateId;
      return nameA.localeCompare(nameB);
    });

    return delegates;
  } catch (e) {
    console.error("Error listing delegates by IDs:", e);
    return [];
  }
}
