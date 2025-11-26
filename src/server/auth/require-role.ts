// src/server/auth/require-role.ts
import "server-only";

import { adminDb } from "@/server/admin/firebase-admin";

import { ForbiddenError } from "./errors";
import { getServerAuthUser } from "./get-server-auth-user";
import type { AppRole } from "./types";

async function getRoleByUid(uid: string): Promise<AppRole> {
  const snap = await adminDb.collection("users").doc(uid).get();

  const rawRole = snap.data()?.role;

  // 🔧 Normaliza lo que venga de Firestore
  const normalized: AppRole =
    typeof rawRole === "string" ? (rawRole.trim().toUpperCase() as AppRole) : ("DESCONOCIDO" as AppRole);

  // 👇 debug temporal (si quieres ver en consola qué está pasando)
  // console.log("[getRoleByUid]", { uid, rawRole, normalized });

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

  // 👇 puedes dejar esto un rato para confirmar que te está leyendo bien:
  // console.log("[requireSuperuser] uid=", uid, "role=", role);

  const allowed = role === "SUPERUSUARIO";
  if (!allowed) throw new ForbiddenError("Requiere rol SUPERUSUARIO.");

  return { uid, role };
}
