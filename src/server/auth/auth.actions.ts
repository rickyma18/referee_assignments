"use server";

import { cookies } from "next/headers";

import { adminAuth } from "@/server/admin/firebase-admin";

/**
 * Intercambia un ID token (cliente) por una Session Cookie httpOnly (__session)
 */
export async function createSessionAction(idToken: string) {
  if (!idToken) throw new Error("ID token requerido");

  // 5 días, ajusta a tu gusto
  const expiresIn = 5 * 24 * 60 * 60 * 1000; // ms
  const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

  const cookieStore = await cookies();
  cookieStore.set("__session", sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // en dev debe ir false si usas http
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(expiresIn / 1000),
  });

  return { ok: true };
}

/** Limpia la cookie de sesión */
export async function clearSessionAction() {
  const cookieStore = await cookies();
  cookieStore.set("__session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return { ok: true };
}
