// src/server/actions/delegate-cookie.actions.ts
"use server";
import "server-only";

import { cookies } from "next/headers";

const COOKIE_NAME = "activeDelegateId";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

/**
 * Guarda el activeDelegateId en una cookie.
 * Llamado desde DelegateSwitcher cuando SUPERUSUARIO cambia de delegado.
 */
export async function setActiveDelegateCookie(delegateId: string | null) {
  const cookieStore = await cookies();

  if (delegateId) {
    cookieStore.set(COOKIE_NAME, delegateId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: MAX_AGE,
      path: "/",
    });
  } else {
    cookieStore.delete(COOKIE_NAME);
  }
}

/**
 * Lee el activeDelegateId desde la cookie.
 * Usado por getDelegateContext cuando no se pasa parámetro.
 */
export async function getActiveDelegateCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}
