// =====================================
// src/server/actions/teams.actions.ts
// =====================================
"use server";

import { revalidatePath } from "next/cache";

import { ZodError, z } from "zod";

import { TeamTierValues } from "@/domain/teams/team-tier";
import {
  TeamCreateSchema,
  TeamUpdateSchema,
  type TeamCreateInput,
  type TeamUpdateInput,
} from "@/domain/teams/team.zod";
import { adminDb, AdminFieldValue } from "@/server/admin/firebase-admin"; // 👈 agrega esto arriba
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import {
  assertDocBelongsToDelegate,
  assertGroupAccessByGroupId,
  assertEffectiveDelegateId,
} from "@/server/auth/require-delegate-access";
import * as repo from "@/server/repositories/teams.repo";

import { ForbiddenError } from "../auth/errors";
import { requireEditRole } from "../auth/require-role";

type ActionResult<T = any> =
  | { ok: true; data?: T }
  | { ok: false; message?: string; fieldErrors?: Record<string, string | string[]> };

const zodFields = (e: unknown) => (e instanceof ZodError ? e.flatten().fieldErrors : undefined);
const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

function revalidateTeamsList(leagueId: string, groupId: string) {
  revalidatePath(`/dashboard/leagues/${leagueId}/groups/${groupId}/teams`);
}

const TeamTierZ = z.enum(TeamTierValues);

// ------- Queries -------

/**
 * Lista equipos por groupId.
 *
 * Seguridad multi-tenant:
 * - Valida acceso al grupo (via league padre) antes de listar
 *
 * @param params - Parámetros del repositorio
 * @param options.activeDelegateId - Para SUPER, el delegado seleccionado en UI
 */
export async function listTeamsByGroupAction(
  params: repo.GetByGroupParams,
  options?: { activeDelegateId?: string | null },
) {
  const ctx = await getDelegateContext({ activeDelegateId: options?.activeDelegateId });

  // Validar acceso al grupo (valida via league padre)
  try {
    await assertGroupAccessByGroupId(params.groupId, ctx);
  } catch {
    // Sin acceso: devolver resultado vacío compatible
    return { items: [], nextCursorId: null };
  }

  return repo.getByGroup(params);
}

/**
 * Obtiene un equipo por id.
 *
 * Seguridad multi-tenant:
 * - Valida que el team tenga delegateId del delegado actual
 *
 * @param teamId - ID del equipo
 * @param options.activeDelegateId - Para SUPER, el delegado seleccionado en UI
 */
export async function getTeamAction(teamId: string, options?: { activeDelegateId?: string | null }) {
  if (!teamId || typeof teamId !== "string") {
    throw new Error("getTeamAction: teamId requerido");
  }

  const ctx = await getDelegateContext({ activeDelegateId: options?.activeDelegateId });
  const team = await repo.getById(teamId);

  if (!team) {
    return null;
  }

  // Validar ownership
  try {
    assertDocBelongsToDelegate(team as unknown as Record<string, unknown>, ctx);
  } catch {
    return null;
  }

  return team;
}

// ------- Commands (mantienen firma original) -------

/**
 * Crea un equipo.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida acceso al grupo
 * - Fuerza delegateId desde servidor
 */

export async function createTeamAction(input: TeamCreateInput & { leagueId?: string }): Promise<ActionResult> {
  const { leagueId, ...rest } = input;

  try {
    await requireEditRole();
    const ctx = await getDelegateContext();

    if (!leagueId) {
      return { ok: false, message: "leagueId requerido para crear equipo" };
    }

    const data = TeamCreateSchema.parse(rest);

    // Validar acceso al grupo (como ya lo haces)
    await assertGroupAccessByGroupId(data.groupId, ctx);

    // ✅ Resolver delegateId DESDE LA LIGA
    const leagueSnap = await adminDb.collection("leagues").doc(leagueId).get();
    if (!leagueSnap.exists) {
      return { ok: false, message: "Liga no encontrada" };
    }

    const leagueDelegateId = String((leagueSnap.data() as any)?.delegateId ?? "").trim();
    if (!leagueDelegateId) {
      return { ok: false, message: "La liga no tiene delegateId configurado" };
    }

    // (Opcional pero recomendado) Validar tenant: el usuario debe poder operar esa liga
    // Si tu assertDocBelongsToDelegate espera un doc con delegateId, puedes usarlo aquí:
    assertDocBelongsToDelegate({ delegateId: leagueDelegateId } as any, ctx);

    // Crear con delegateId forzado desde la liga + guardar leagueId en el team
    const created = await repo.create({
      ...data,
      leagueId,
      delegateId: leagueDelegateId,
    } as any);

    revalidateTeamsList(leagueId, data.groupId);
    return { ok: true, data: created };
  } catch (e: any) {
    const groupId = (rest as any)?.groupId ?? "";
    if (leagueId && groupId) revalidateTeamsList(leagueId, groupId);

    if (e instanceof ForbiddenError) return { ok: false, message: e.message };

    const duplicateMsg =
      e?.code === "DUPLICATE_NAME_IN_GROUP"
        ? "Ya existe un equipo con ese nombre en el grupo seleccionado."
        : undefined;

    return { ok: false, message: duplicateMsg ?? msg(e), fieldErrors: zodFields(e) as any };
  }
}

/**
 * Actualiza un equipo.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida ownership del team existente
 */
export async function updateTeamAction(input: TeamUpdateInput & { leagueId?: string }): Promise<ActionResult> {
  const { leagueId, id, ...patch } = input;

  try {
    await requireEditRole();
    const ctx = await getDelegateContext();

    // 1) Cargar team existente y validar ownership
    const existing = await repo.getById(id);
    if (!existing) {
      return { ok: false, message: "Equipo no encontrado" };
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    // 2) Validar payload con Zod
    const data = TeamUpdateSchema.parse({ id, ...patch });
    const { id: _id, ...rest } = data;

    // 3) delegateId: preservar siempre.
    //    Si el team es legacy (no tiene delegateId), lo resolvemos desde la liga y lo guardamos.
    const existingDelegateId = String((existing as any)?.delegateId ?? "").trim();

    if (!existingDelegateId) {
      if (!leagueId) {
        return {
          ok: false,
          message: "leagueId requerido para actualizar este equipo (equipo legacy sin delegateId)",
        };
      }

      const leagueSnap = await adminDb.collection("leagues").doc(leagueId).get();
      if (!leagueSnap.exists) {
        return { ok: false, message: "Liga no encontrada" };
      }

      const leagueDelegateId = String((leagueSnap.data() as any)?.delegateId ?? "").trim();
      if (!leagueDelegateId) {
        return { ok: false, message: "La liga no tiene delegateId configurado" };
      }

      // Validar que el usuario pueda operar esa liga (multi-tenant)
      assertDocBelongsToDelegate({ delegateId: leagueDelegateId } as any, ctx);

      // 🔧 Auto-fix legacy: como repo.update ignora delegateId, lo parchamos directo aquí.
      await adminDb.collection("teams").doc(_id).update({
        delegateId: leagueDelegateId,
        updatedAt: AdminFieldValue.serverTimestamp(),
      });
    }

    // 4) Actualizar el resto de campos (repo.update ignora delegateId por seguridad)
    const updated = await repo.update(_id, rest as any);

    // 5) Revalidate
    const nextGroupId = (rest as any)?.groupId ?? (updated as any).groupId;
    if (leagueId && nextGroupId) revalidateTeamsList(leagueId, nextGroupId);
    else revalidatePath("/dashboard");

    return { ok: true, data: updated };
  } catch (e: any) {
    const groupId = (patch as any)?.groupId ?? "";
    if (leagueId && groupId) revalidateTeamsList(leagueId, groupId);

    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }

    const duplicateMsg =
      e?.code === "DUPLICATE_NAME_IN_GROUP"
        ? "Ya existe un equipo con ese nombre en el grupo seleccionado."
        : undefined;

    return { ok: false, message: duplicateMsg ?? msg(e), fieldErrors: zodFields(e) as any };
  }
}

/**
 * Elimina un equipo.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida ownership del team
 */
export async function deleteTeamAction(leagueId: string, groupId: string, teamId: string): Promise<ActionResult> {
  try {
    await requireEditRole();
    const ctx = await getDelegateContext();

    // Cargar team y validar ownership
    const existing = await repo.getById(teamId);
    if (!existing) {
      return { ok: false, message: "Equipo no encontrado" };
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    const res = await repo.remove(teamId);

    if (leagueId && groupId) revalidateTeamsList(leagueId, groupId);
    else revalidatePath("/dashboard");

    return { ok: true, data: res };
  } catch (e: any) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: msg(e) };
  }
}

/**
 * Cambia el tier del equipo.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida ownership del team
 */
export async function setTeamTierAction(params: {
  teamId: string;
  tier: unknown;
  leagueId: string;
  groupId: string;
}): Promise<ActionResult> {
  const { teamId, tier, leagueId, groupId } = params;

  try {
    await requireEditRole();
    const ctx = await getDelegateContext();

    // Cargar team y validar ownership
    const existing = await repo.getById(teamId);
    if (!existing) {
      return { ok: false, message: "Equipo no encontrado" };
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    const t = TeamTierZ.parse(tier);
    const res = await repo.setTier(teamId, t);

    if (!res?.ok) {
      return { ok: false, message: (res as any)?.message ?? "No se pudo cambiar el tier del equipo" };
    }

    const after = await repo.getById(teamId);

    revalidatePath(`/dashboard/leagues/${leagueId}/groups/${groupId}/teams/tiers`);

    return { ok: true, data: after ?? undefined };
  } catch (e: any) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: msg(e) };
  }
}
