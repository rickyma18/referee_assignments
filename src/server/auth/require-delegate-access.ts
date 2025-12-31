// src/server/auth/require-delegate-access.ts
import "server-only";

import { adminDb } from "../admin/firebase-admin";

import { ForbiddenError } from "./errors";
import { DelegateContext } from "./get-delegate-context";

/**
 * Asegura que el contexto tenga un effectiveDelegateId.
 * Lanza error si no existe (necesario para operaciones que requieren scope de delegado).
 */
export function assertEffectiveDelegateId(ctx: DelegateContext): string {
  if (!ctx.effectiveDelegateId) {
    if (ctx.role === "DELEGADO") {
      throw new ForbiddenError("Tu cuenta no tiene delegateId asignado. Contacta al administrador.");
    }
    throw new ForbiddenError("Se requiere seleccionar un delegado para esta operación.");
  }
  return ctx.effectiveDelegateId;
}

/**
 * Valida que un documento pertenezca al delegado actual.
 *
 * Reglas:
 * - Si docData.delegateId existe y no coincide con delegateId => throw
 * - Si docData.delegateId no existe (datos legacy):
 *   - SUPERUSUARIO: permite (modo global)
 *   - DELEGADO: deniega (evita fuga de datos hasta migración)
 */
export function assertDocBelongsToDelegate(
  docData: Record<string, unknown> | null | undefined,
  ctx: DelegateContext,
): void {
  if (!docData) {
    throw new ForbiddenError("Documento no encontrado.");
  }

  const docDelegateId = docData.delegateId;

  // Documento tiene delegateId
  if (typeof docDelegateId === "string" && docDelegateId) {
    // SUPERUSUARIO en modo global (sin activeDelegateId) puede ver todo
    if (ctx.isSuper && !ctx.effectiveDelegateId) {
      return; // OK - modo global
    }

    // Validar que coincida
    if (docDelegateId !== ctx.effectiveDelegateId) {
      throw new ForbiddenError("No tienes acceso a este recurso.");
    }
    return; // OK - coincide
  }

  // Documento NO tiene delegateId (legacy)
  if (ctx.isSuper) {
    return; // OK - super puede ver legacy
  }

  // DELEGADO no puede ver datos sin delegateId (evita fuga)
  throw new ForbiddenError("Este recurso aún no está asignado a ningún delegado.");
}

/**
 * Valida que una league pertenezca al delegado actual.
 * Carga la league y verifica ownership.
 */
export async function assertLeagueBelongsToDelegate(leagueId: string, ctx: DelegateContext): Promise<void> {
  const leagueSnap = await adminDb.collection("leagues").doc(leagueId).get();

  if (!leagueSnap.exists) {
    throw new ForbiddenError("Liga no encontrada.");
  }

  assertDocBelongsToDelegate(leagueSnap.data(), ctx);
}

/**
 * Valida acceso a un grupo validando la league padre.
 * Groups están anidados bajo leagues, heredan el delegateId de la league.
 */
export async function assertGroupBelongsToDelegate(
  leagueId: string,
  groupId: string,
  ctx: DelegateContext,
): Promise<void> {
  // Primero validar la league padre
  await assertLeagueBelongsToDelegate(leagueId, ctx);

  // Verificar que el grupo existe en esa league
  const groupSnap = await adminDb.collection("leagues").doc(leagueId).collection("groups").doc(groupId).get();

  if (!groupSnap.exists) {
    throw new ForbiddenError("Grupo no encontrado.");
  }
}

/**
 * Obtiene el leagueId de un grupo dado su groupId.
 * Útil cuando solo tenemos groupId y necesitamos validar por herencia.
 *
 * NOTA: Groups están en subcollection, así que necesitamos buscar
 * en todas las leagues. Esto es costoso pero necesario para colecciones
 * planas como teams que solo tienen groupId.
 */
export async function getLeagueIdFromGroup(groupId: string): Promise<string | null> {
  // Buscar en todas las leagues cuál tiene este grupo
  const leaguesSnap = await adminDb.collection("leagues").get();

  for (const leagueDoc of leaguesSnap.docs) {
    const groupSnap = await adminDb.collection("leagues").doc(leagueDoc.id).collection("groups").doc(groupId).get();

    if (groupSnap.exists) {
      return leagueDoc.id;
    }
  }

  return null;
}

/**
 * Valida acceso a recursos que dependen de un grupo (teams, venues, etc.)
 * Resuelve el leagueId del grupo y valida ownership.
 */
export async function assertGroupAccessByGroupId(groupId: string, ctx: DelegateContext): Promise<string> {
  const leagueId = await getLeagueIdFromGroup(groupId);

  if (!leagueId) {
    throw new ForbiddenError("Grupo no encontrado.");
  }

  await assertLeagueBelongsToDelegate(leagueId, ctx);

  return leagueId;
}

/**
 * Helper para verificar si el usuario puede editar (SUPERUSUARIO o DELEGADO).
 */
export function assertCanEdit(ctx: DelegateContext): void {
  const canEdit = ctx.role === "SUPERUSUARIO" || ctx.role === "DELEGADO";
  if (!canEdit) {
    throw new ForbiddenError("No tienes permisos para editar.");
  }
}

/**
 * Helper para verificar que solo SUPERUSUARIO puede ejecutar.
 */
export function assertIsSuperuser(ctx: DelegateContext): void {
  if (!ctx.isSuper) {
    throw new ForbiddenError("Requiere rol SUPERUSUARIO.");
  }
}
