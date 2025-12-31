// src/server/auth/get-delegate-context.ts
import "server-only";

import { cookies } from "next/headers";

import type { UserRole } from "@/types/roles";

import { adminAuth, adminDb } from "../admin/firebase-admin";

import { ForbiddenError } from "./errors";
import { getServerAuthUser } from "./get-server-auth-user";

const DELEGATE_COOKIE_NAME = "activeDelegateId";

/**
 * Lee role y delegateId desde custom claims o userDoc (fallback).
 * Prioridad: claims > userDoc
 */
async function getRoleAndDelegateId(uid: string): Promise<{
  role: UserRole;
  delegateId: string | null;
  source: "claims" | "userDoc";
}> {
  // 1. Intentar leer custom claims
  try {
    const userRecord = await adminAuth.getUser(uid);
    const claims = userRecord.customClaims;

    if (claims?.role) {
      // Claims existen: usarlos como fuente de verdad
      const role = (typeof claims.role === "string" ? claims.role.toUpperCase() : "ARBITRO") as UserRole;
      const delegateId = typeof claims.delegateId === "string" ? claims.delegateId : null;
      return { role, delegateId, source: "claims" };
    }
  } catch {
    // Error leyendo claims: continuar con fallback
  }

  // 2. Fallback: leer desde userDoc
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const userData = userSnap.data();

  if (!userData) {
    throw new ForbiddenError("Usuario no encontrado en base de datos.");
  }

  const rawRole = userData.role;
  const role: UserRole =
    typeof rawRole === "string" ? (rawRole.trim().toUpperCase() as UserRole) : ("ARBITRO" as UserRole);
  const delegateId: string | null = typeof userData.delegateId === "string" ? userData.delegateId : null;

  return { role, delegateId, source: "userDoc" };
}

/**
 * Contexto de delegado para server actions.
 * Determina qué delegateId usar para filtrar/validar datos.
 */
export type DelegateContext = {
  uid: string;
  role: UserRole;
  userDelegateId: string | null; // delegateId propio del usuario (para DELEGADO)
  effectiveDelegateId: string | null; // delegateId a usar para operaciones
  isSuper: boolean;
};

export type GetDelegateContextInput = {
  activeDelegateId?: string | null;
};

/**
 * Obtiene el contexto de delegado para la sesión actual.
 *
 * Prioridad para role/delegateId:
 * 1. Custom claims (si existen)
 * 2. userDoc en Firestore (fallback)
 *
 * - DELEGADO: effectiveDelegateId = userDelegateId (fijo, obligatorio)
 * - SUPERUSUARIO: effectiveDelegateId = activeDelegateId (del parámetro/cookie) o null (modo global)
 * - Otros roles: effectiveDelegateId = null
 * - Sin sesión: devuelve contexto vacío (para páginas estáticas)
 *
 * @param input.activeDelegateId - Para SUPERUSUARIO, el delegado seleccionado en UI
 */
export async function getDelegateContext(input?: GetDelegateContextInput): Promise<DelegateContext> {
  // 1. Obtener usuario autenticado
  let authUser;
  try {
    authUser = await getServerAuthUser();
  } catch {
    // Sin sesión: devolver contexto vacío (útil para páginas estáticas)
    return {
      uid: "",
      role: "ARBITRO" as UserRole,
      userDelegateId: null,
      effectiveDelegateId: null,
      isSuper: false,
    };
  }

  // 2. Obtener role y delegateId (prioriza claims, fallback userDoc)
  const { role, delegateId: userDelegateId } = await getRoleAndDelegateId(authUser.uid);

  const isSuper = role === "SUPERUSUARIO";

  // 4. Determinar effectiveDelegateId según el rol
  let effectiveDelegateId: string | null = null;

  if (role === "DELEGADO") {
    // DELEGADO: siempre usa su propio delegateId
    effectiveDelegateId = userDelegateId;
    // Nota: si userDelegateId es null, las validaciones posteriores lo manejarán
  } else if (isSuper) {
    // SUPERUSUARIO: usa activeDelegateId del parámetro, o lee de cookie si no se pasó
    if (input?.activeDelegateId !== undefined) {
      effectiveDelegateId = input.activeDelegateId;
    } else {
      // Leer de cookie (para server components que no pasan el param)
      try {
        const cookieStore = await cookies();
        effectiveDelegateId = cookieStore.get(DELEGATE_COOKIE_NAME)?.value ?? null;
      } catch {
        // Si falla la lectura de cookie, usar null (modo global)
        effectiveDelegateId = null;
      }
    }
  }
  // Otros roles (ASISTENTE, ARBITRO): effectiveDelegateId = null

  return {
    uid: authUser.uid,
    role,
    userDelegateId,
    effectiveDelegateId,
    isSuper,
  };
}

/**
 * Versión que requiere effectiveDelegateId.
 * Lanza error si el delegado no puede determinarse.
 */
export async function requireDelegateContext(input?: GetDelegateContextInput): Promise<DelegateContext> {
  const ctx = await getDelegateContext(input);

  // Para DELEGADO sin delegateId configurado
  if (ctx.role === "DELEGADO" && !ctx.effectiveDelegateId) {
    throw new ForbiddenError("Tu cuenta de delegado no tiene un delegateId asignado. Contacta al administrador.");
  }

  return ctx;
}
