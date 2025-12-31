// =============================
// src/server/actions/groups.actions.ts
// =============================
"use server";
import "server-only";

import { revalidatePath } from "next/cache";

import { GroupCreateSchema, GroupUpdateSchema } from "@/domain/groups/group.zod";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { assertCanEdit, assertLeagueBelongsToDelegate } from "@/server/auth/require-delegate-access";
import * as repo from "@/server/repositories/groups.repo";

import { ForbiddenError } from "../auth/errors";

// -------- Lecturas --------

/**
 * Lista grupos.
 *
 * Seguridad multi-tenant:
 * - Valida que la league pertenezca al delegado antes de listar sus grupos
 *
 * @param params - Parámetros del repositorio
 * @param options.activeDelegateId - Para SUPER, el delegado seleccionado en UI
 */
export async function listGroupsAction(params: repo.GetAllParams, options?: { activeDelegateId?: string | null }) {
  const ctx = await getDelegateContext({ activeDelegateId: options?.activeDelegateId });

  // Validar acceso a la league
  if (params.leagueId) {
    try {
      await assertLeagueBelongsToDelegate(params.leagueId, ctx);
    } catch {
      // Si no tiene acceso, devolver lista vacía
      return [];
    }
  }

  return repo.getAll(params);
}

/**
 * Lista grupos por liga.
 *
 * Seguridad multi-tenant:
 * - Valida que la league pertenezca al delegado
 *
 * @param leagueId - ID de la liga
 * @param options.activeDelegateId - Para SUPER, el delegado seleccionado en UI
 */
export async function listGroupsByLeagueAction(leagueId: string, options?: { activeDelegateId?: string | null }) {
  const ctx = await getDelegateContext({ activeDelegateId: options?.activeDelegateId });

  // Validar acceso a la league
  try {
    await assertLeagueBelongsToDelegate(leagueId, ctx);
  } catch {
    return [];
  }

  return repo.getAll({ leagueId });
}

/**
 * Obtiene un grupo por id.
 *
 * Seguridad multi-tenant:
 * - Valida acceso via league padre
 *
 * @param leagueId - ID de la liga
 * @param id - ID del grupo
 * @param options.activeDelegateId - Para SUPER, el delegado seleccionado en UI
 */
export async function getGroupAction(leagueId: string, id: string, options?: { activeDelegateId?: string | null }) {
  const ctx = await getDelegateContext({ activeDelegateId: options?.activeDelegateId });

  // Validar acceso a la league
  try {
    await assertLeagueBelongsToDelegate(leagueId, ctx);
  } catch {
    return null;
  }

  return repo.getById(leagueId, id);
}

// -------- Escrituras --------

/**
 * Crea un grupo.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida que la league pertenezca al delegado
 * - Inyecta delegateId desde el servidor
 */
export async function createGroupAction(input: unknown) {
  try {
    const ctx = await getDelegateContext();
    assertCanEdit(ctx);

    const data = GroupCreateSchema.parse(input);

    // Validar acceso a la league
    await assertLeagueBelongsToDelegate(data.leagueId, ctx);

    // ✅ Inyectar delegateId para guardarlo en el doc del grupo
    const created = await repo.create({
      ...data,
      delegateId: ctx.effectiveDelegateId ?? undefined,
    });
    revalidatePath(`/dashboard/leagues/${data.leagueId}/groups`);
    return created;
  } catch (e) {
    if (e instanceof ForbiddenError) {
      throw e;
    }
    throw e;
  }
}

/**
 * Actualiza un grupo.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida que la league pertenezca al delegado
 */
export async function updateGroupAction(input: unknown) {
  try {
    const ctx = await getDelegateContext();
    assertCanEdit(ctx);

    const data = GroupUpdateSchema.parse(input);
    const { id, ...rest } = data;

    // Validar acceso a la league
    await assertLeagueBelongsToDelegate(data.leagueId, ctx);

    const updated = await repo.update(id, rest);
    revalidatePath(`/dashboard/leagues/${data.leagueId}/groups`);
    return updated;
  } catch (e) {
    if (e instanceof ForbiddenError) {
      throw e;
    }
    throw e;
  }
}

/**
 * Elimina un grupo.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida que la league pertenezca al delegado
 */
export async function deleteGroupAction(leagueId: string, id: string) {
  try {
    const ctx = await getDelegateContext();
    assertCanEdit(ctx);

    // Validar acceso a la league
    await assertLeagueBelongsToDelegate(leagueId, ctx);

    const res = await repo.remove(leagueId, id);
    revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return res;
  } catch (e) {
    if (e instanceof ForbiddenError) {
      throw e;
    }
    throw e;
  }
}
