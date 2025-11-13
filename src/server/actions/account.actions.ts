"use server";

import { adminDb } from "@/server/admin/firebase-admin";
import { getServerAuthUser } from "@/server/auth/get-server-auth-user";

export async function updateAccountAction(formData: FormData) {
  const uid = formData.get("uid")?.toString();
  if (!uid) return { ok: false, message: "UID faltante" };

  // Validar sesión: solo el mismo usuario puede editar
  let authUser;
  try {
    authUser = await getServerAuthUser();
  } catch {
    return { ok: false, message: "No autorizado" };
  }

  if (authUser.uid !== uid) {
    return { ok: false, message: "No tienes permiso para editar esta cuenta" };
  }

  // Campos a actualizar
  const displayName = formData.get("displayName")?.toString()?.trim() ?? "";
  const photoURL = formData.get("photoURL")?.toString()?.trim() ?? null;
  const scope = formData.get("scope")?.toString()?.trim() ?? null;

  const updatedAt = Date.now();

  await adminDb.collection("users").doc(uid).update({
    displayName,
    photoURL,
    scope,
    updatedAt,
  });

  return { ok: true };
}
