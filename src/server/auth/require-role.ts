// src/server/auth/require-role.ts
import "server-only";

import { adminDb } from "@/server/admin/firebase-admin";

import { ForbiddenError } from "./errors";
import { getServerAuthUser } from "./get-server-auth-user";
import type { AppRole } from "./types";

async function getRoleByUid(uid: string): Promise<AppRole> {
  const snap = await adminDb.collection("users").doc(uid).get();
  return (snap.data()?.role as AppRole | undefined) ?? "DESCONOCIDO";
}

export async function requireEditRole(): Promise<{ uid: string; role: AppRole }> {
  // ✅ ahora valida usando la cookie __session internamente
  const { uid } = await getServerAuthUser().catch(() => {
    throw new ForbiddenError("No hay sesión activa.");
  });

  const role = await getRoleByUid(uid);
  const allowed = role === "SUPERUSUARIO" || role === "DELEGADO";
  if (!allowed) throw new ForbiddenError();

  return { uid, role };
}
