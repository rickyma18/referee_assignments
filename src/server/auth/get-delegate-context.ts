// src/server/auth/get-delegate-context.ts
import "server-only";

import { cookies } from "next/headers";

import type { UserRole } from "@/types/roles";

import { adminAuth, adminDb } from "../admin/firebase-admin";

import { ForbiddenError } from "./errors";
import { getServerAuthUser } from "./get-server-auth-user";

const DELEGATE_COOKIE_NAME = "activeDelegateId";

/**
 * Lee role, delegateId y allowedDelegateIds desde custom claims o userDoc (fallback).
 * Prioridad: claims > userDoc
 */
async function getRoleAndDelegateId(uid: string): Promise<{
  role: UserRole;
  delegateId: string | null;
  allowedDelegateIds: string[] | null;
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
      const allowedDelegateIds = Array.isArray(claims.allowedDelegateIds) ? claims.allowedDelegateIds : null;
      return { role, delegateId, allowedDelegateIds, source: "claims" };
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
  const allowedDelegateIds: string[] | null = Array.isArray(userData.allowedDelegateIds)
    ? userData.allowedDelegateIds
    : null;

  return { role, delegateId, allowedDelegateIds, source: "userDoc" };
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
  allowedDelegateIds: string[]; // lista de delegateIds permitidos
  isSuper: boolean;
};

export type GetDelegateContextInput = {
  /** delegateId seleccionado (del query param ?delegateId=...) */
  selectedDelegateId?: string | null;
  /** @deprecated Usar selectedDelegateId en su lugar */
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
 * - SUPERUSUARIO: effectiveDelegateId = selectedDelegateId (del query param) o cookie/null
 * - ARBITRO/ASISTENTE: effectiveDelegateId = selectedDelegateId si está en allowedDelegateIds
 * - Sin sesión: devuelve contexto vacío (para páginas estáticas)
 *
 * @param input.selectedDelegateId - El delegateId seleccionado (del query param ?delegateId=...)
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
      allowedDelegateIds: [],
      isSuper: false,
    };
  }

  // 2. Obtener role, delegateId y allowedDelegateIds (prioriza claims, fallback userDoc)
  const { role, delegateId: userDelegateId, allowedDelegateIds: rawAllowed } = await getRoleAndDelegateId(authUser.uid);

  const isSuper = role === "SUPERUSUARIO";

  // 3. Calcular allowedDelegateIds según rol
  // Si no hay allowedDelegateIds explícito, tratar como [userDelegateId] (si existe)
  let allowedDelegateIds: string[];
  if (isSuper) {
    // SUPERUSUARIO: puede ver todo (array vacío = sin restricción)
    allowedDelegateIds = [];
  } else if (role === "DELEGADO") {
    // DELEGADO: solo su delegación
    allowedDelegateIds = userDelegateId ? [userDelegateId] : [];
  } else {
    // ARBITRO/ASISTENTE: usar allowedDelegateIds o fallback a [userDelegateId]
    allowedDelegateIds = rawAllowed && rawAllowed.length > 0 ? rawAllowed : userDelegateId ? [userDelegateId] : [];
  }

  // 4. Resolver selectedDelegateId (soportar ambos nombres por compatibilidad)
  const selectedDelegateId = input?.selectedDelegateId ?? input?.activeDelegateId ?? undefined;

  // 5. Determinar effectiveDelegateId según el rol
  let effectiveDelegateId: string | null = null;

  if (role === "DELEGADO") {
    // DELEGADO: siempre usa su propio delegateId (ignora selección)
    effectiveDelegateId = userDelegateId;
  } else if (isSuper) {
    // SUPERUSUARIO: usa selectedDelegateId del parámetro, o lee de cookie si no se pasó
    if (selectedDelegateId !== undefined) {
      effectiveDelegateId = selectedDelegateId;
    } else {
      // Fallback: leer de cookie (para server components que no pasan el param)
      try {
        const cookieStore = await cookies();
        effectiveDelegateId = cookieStore.get(DELEGATE_COOKIE_NAME)?.value ?? null;
      } catch {
        effectiveDelegateId = null;
      }
    }
  } else {
    // ARBITRO/ASISTENTE: usa selectedDelegateId si está en allowedDelegateIds
    if (selectedDelegateId && allowedDelegateIds.includes(selectedDelegateId)) {
      effectiveDelegateId = selectedDelegateId;
    } else {
      // Fallback: primer delegateId permitido o userDelegateId
      effectiveDelegateId = allowedDelegateIds[0] ?? userDelegateId;
    }
  }

  return {
    uid: authUser.uid,
    role,
    userDelegateId,
    effectiveDelegateId,
    allowedDelegateIds,
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
