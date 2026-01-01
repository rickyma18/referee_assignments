// src/server/auth/require-role.ts
import "server-only";

import { adminAuth, adminDb } from "@/server/admin/firebase-admin";

import { ForbiddenError } from "./errors";
import { getServerAuthUser } from "./get-server-auth-user";
import type { AppRole } from "./types";

/**
 * Obtiene el rol de un usuario.
 * Prioridad: custom claims > userDoc
 */
async function getRoleByUid(uid: string): Promise<AppRole> {
  // 1. Intentar leer desde custom claims
  try {
    const userRecord = await adminAuth.getUser(uid);
    const claims = userRecord.customClaims;

    if (claims?.role) {
      const normalized = (
        typeof claims.role === "string" ? claims.role.trim().toUpperCase() : "DESCONOCIDO"
      ) as AppRole;
      return normalized;
    }
  } catch {
    // Error leyendo claims: continuar con fallback
  }

  // 2. Fallback: leer desde userDoc
  const snap = await adminDb.collection("users").doc(uid).get();
  const rawRole = snap.data()?.role;

  const normalized: AppRole =
    typeof rawRole === "string" ? (rawRole.trim().toUpperCase() as AppRole) : ("DESCONOCIDO" as AppRole);

  return normalized;
}

/**
 * Rol para acciones de edición normales:
 * SUPERUSUARIO y DELEGADO.
 */
export async function requireEditRole(): Promise<{ uid: string; role: AppRole }> {
  const { uid } = await getServerAuthUser().catch(() => {
    throw new ForbiddenError("No hay sesión activa.");
  });

  const role = await getRoleByUid(uid);
  const allowed = role === "SUPERUSUARIO" || role === "DELEGADO";
  if (!allowed) throw new ForbiddenError();

  return { uid, role };
}

/**
 * 🔒 Solo SUPERUSUARIO.
 * Úsalo para vistas y acciones “ocultas” como el ajuste de RCS.
 */
export async function requireSuperuser(): Promise<{ uid: string; role: AppRole }> {
  const { uid } = await getServerAuthUser().catch(() => {
    throw new ForbiddenError("No hay sesión activa.");
  });

  const role = await getRoleByUid(uid);

  const allowed = role === "SUPERUSUARIO";
  if (!allowed) throw new ForbiddenError("Requiere rol SUPERUSUARIO.");

  return { uid, role };
}
