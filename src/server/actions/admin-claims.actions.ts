// src/server/actions/admin-claims.actions.ts
"use server";
import "server-only";

import { z } from "zod";

import { adminAuth, adminDb } from "@/server/admin/firebase-admin";
import { ForbiddenError } from "@/server/auth/errors";
import { requireSuperuser } from "@/server/auth/require-role";

const VALID_ROLES = ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"] as const;
const RoleSchema = z.enum(VALID_ROLES);

type ActionResult = { ok: true; data?: unknown } | { ok: false; message: string };

export type UserClaimsData = {
  uid: string;
  email: string | null;
  displayName: string | null;
  customClaims: Record<string, unknown>;
  userDoc: {
    role: string | null;
    delegateId: string | null;
  };
};

/**
 * Busca un usuario por UID o Email y retorna sus claims + datos de userDoc.
 * Solo SUPERUSUARIO.
 *
 * @param uidOrEmail - Si contiene "@" busca por email, si no por UID
 */
export async function findUserAction(uidOrEmail: string): Promise<ActionResult> {
  try {
    await requireSuperuser();

    if (!uidOrEmail || typeof uidOrEmail !== "string") {
      return { ok: false, message: "UID o Email requerido" };
    }

    const trimmed = uidOrEmail.trim();

    // Determinar si es email o UID
    let user;
    if (trimmed.includes("@")) {
      user = await adminAuth.getUserByEmail(trimmed);
    } else {
      user = await adminAuth.getUser(trimmed);
    }

    // Cargar userDoc para fallback info
    const userDocSnap = await adminDb.collection("users").doc(user.uid).get();
    const userDocData = userDocSnap.data();

    const data: UserClaimsData = {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      customClaims: user.customClaims ?? {},
      userDoc: {
        role: userDocData?.role ?? null,
        delegateId: userDocData?.delegateId ?? null,
      },
    };

    return { ok: true, data };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    const msg = e instanceof Error ? e.message : "Error inesperado";
    // Mejorar mensaje para usuario no encontrado
    if (msg.includes("no user record") || msg.includes("user-not-found")) {
      return { ok: false, message: "Usuario no encontrado" };
    }
    return { ok: false, message: msg };
  }
}

/**
 * Obtiene los custom claims de un usuario.
 * Solo SUPERUSUARIO.
 * @deprecated Usa findUserAction en su lugar
 */
export async function getUserClaimsAction(uid: string): Promise<ActionResult> {
  try {
    await requireSuperuser();

    if (!uid || typeof uid !== "string") {
      return { ok: false, message: "UID requerido" };
    }

    const user = await adminAuth.getUser(uid);

    return {
      ok: true,
      data: {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        customClaims: user.customClaims ?? {},
      },
    };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado" };
  }
}

/**
 * Setea el role en custom claims de un usuario.
 * Solo SUPERUSUARIO.
 */
export async function setUserRoleClaimAction(input: { uid: string; role: string }): Promise<ActionResult> {
  try {
    await requireSuperuser();

    const uid = z.string().min(1, "UID requerido").parse(input.uid);
    const role = RoleSchema.parse(input.role);

    const user = await adminAuth.getUser(uid);
    const currentClaims = user.customClaims ?? {};

    const newClaims = {
      ...currentClaims,
      role,
    };

    await adminAuth.setCustomUserClaims(uid, newClaims);

    // Sincronizar con userDoc
    await adminDb.collection("users").doc(uid).update({ role });

    return { ok: true, data: newClaims };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    if (e instanceof z.ZodError) {
      return { ok: false, message: "Datos inválidos: " + e.errors.map((err) => err.message).join(", ") };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado" };
  }
}

/**
 * Setea el delegateId en custom claims de un usuario.
 * Solo SUPERUSUARIO.
 */
export async function setUserDelegateIdClaimAction(input: { uid: string; delegateId: string }): Promise<ActionResult> {
  try {
    await requireSuperuser();

    const uid = z.string().min(1, "UID requerido").parse(input.uid);
    const delegateId = z.string().min(1, "delegateId requerido").parse(input.delegateId);

    const user = await adminAuth.getUser(uid);
    const currentClaims = user.customClaims ?? {};

    const newClaims = {
      ...currentClaims,
      delegateId,
    };

    await adminAuth.setCustomUserClaims(uid, newClaims);

    // Sincronizar con userDoc
    await adminDb.collection("users").doc(uid).update({ delegateId });

    return { ok: true, data: newClaims };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    if (e instanceof z.ZodError) {
      return { ok: false, message: "Datos inválidos: " + e.errors.map((err) => err.message).join(", ") };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado" };
  }
}

/**
 * Setea role y delegateId en custom claims de un usuario.
 * Solo SUPERUSUARIO.
 */
export async function setUserClaimsAction(input: {
  uid: string;
  role: string;
  delegateId?: string | null;
}): Promise<ActionResult> {
  try {
    await requireSuperuser();

    const uid = z.string().min(1, "UID requerido").parse(input.uid);
    const role = RoleSchema.parse(input.role);
    const delegateId = input.delegateId ?? null;

    const user = await adminAuth.getUser(uid);
    const currentClaims = user.customClaims ?? {};

    const newClaims: Record<string, unknown> = {
      ...currentClaims,
      role,
    };

    if (delegateId) {
      newClaims.delegateId = delegateId;
    } else {
      // Si se pasa null o undefined, eliminar el claim
      delete newClaims.delegateId;
    }

    await adminAuth.setCustomUserClaims(uid, newClaims);

    // Sincronizar con userDoc
    const updates: Record<string, unknown> = { role };
    if (delegateId) {
      updates.delegateId = delegateId;
    }
    await adminDb.collection("users").doc(uid).update(updates);

    return { ok: true, data: newClaims };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    if (e instanceof z.ZodError) {
      return { ok: false, message: "Datos inválidos: " + e.errors.map((err) => err.message).join(", ") };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado" };
  }
}

/**
 * Limpia todos los custom claims de un usuario.
 * Solo SUPERUSUARIO.
 */
export async function clearUserClaimsAction(uid: string): Promise<ActionResult> {
  try {
    await requireSuperuser();

    if (!uid || typeof uid !== "string") {
      return { ok: false, message: "UID requerido" };
    }

    await adminAuth.setCustomUserClaims(uid, {});

    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Error inesperado" };
  }
}
