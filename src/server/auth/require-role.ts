"use server";

import { cookies } from "next/headers";

import { adminDb } from "@/server/admin/firebase-admin";

import { ForbiddenError } from "./errors";
import type { AppRole } from "./types";

// helpers internos (no exportes nada que no sea async function)
async function getUidFromSession(): Promise<string | null> {
  // Next 16: cookies() es async
  const store = await cookies();
  // Ajusta el nombre de tu cookie / sesión
  const uid = store.get("uid")?.value ?? null;
  return uid;
}

async function getRoleByUid(uid: string): Promise<AppRole> {
  // Ajusta a tu colección y estructura real
  const snap = await adminDb.collection("users").doc(uid).get();
  const role = (snap.data()?.role as AppRole | undefined) ?? "DESCONOCIDO";
  return role;
}

// exporta SOLO funciones async
export async function requireEditRole(): Promise<{ uid: string; role: AppRole }> {
  const uid = await getUidFromSession();
  if (!uid) throw new ForbiddenError("No hay sesión activa.");

  const role = await getRoleByUid(uid);
  const allowed = role === "SUPERUSUARIO" || role === "DELEGADO";
  if (!allowed) throw new ForbiddenError();

  return { uid, role };
}
