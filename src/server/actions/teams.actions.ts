// =====================================
// src/server/actions/teams.actions.ts
// =====================================
"use server";

import { revalidatePath } from "next/cache";

import { ZodError } from "zod";

import {
  TeamCreateSchema,
  TeamUpdateSchema,
  type TeamCreateInput,
  type TeamUpdateInput,
} from "@/domain/teams/team.zod";
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

// ------- Queries (sin ActionResult para mantener consistencia con tu patrón) -------

/** Lista equipos por groupId, con búsqueda y paginación (usa repo.getByGroup) */
export async function listTeamsByGroupAction(params: repo.GetByGroupParams) {
  // params: { groupId, search?, pageSize?, cursorId? }
  return repo.getByGroup(params);
}

/** Obtiene un equipo por id */
export async function getTeamAction(teamId: string) {
  if (!teamId || typeof teamId !== "string") {
    throw new Error("getTeamAction: teamId requerido");
  }
  return repo.getById(teamId);
}

// ------- Commands (con ActionResult) -------

/**
 * Crea un equipo.
 * - Espera que 'input' incluya al menos: { name, groupId, ... }
 * - Además recibimos 'leagueId' (no está en Zod) para revalidar la ruta anidada.
 */
export async function createTeamAction(input: TeamCreateInput & { leagueId?: string }): Promise<ActionResult> {
  const { leagueId, ...rest } = input;

  try {
    await requireEditRole(); // 🔒 Guard de rol

    const data = TeamCreateSchema.parse(rest);
    const created = await repo.create(data);

    if (leagueId) revalidateTeamsList(leagueId, data.groupId);
    else revalidatePath("/dashboard");

    return { ok: true, data: created };
  } catch (e: any) {
    const groupId = (rest as any)?.groupId ?? "";
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
 * Actualiza un equipo.
 * Solo SUPERUSUARIO o DELEGADO pueden ejecutar esta acción.
 */
export async function updateTeamAction(input: TeamUpdateInput & { leagueId?: string }): Promise<ActionResult> {
  const { leagueId, id, ...patch } = input;

  try {
    await requireEditRole(); // 🔒 Guard de rol

    const data = TeamUpdateSchema.parse({ id, ...patch });
    const { id: _id, ...rest } = data;

    const updated = await repo.update(_id, rest);

    const nextGroupId = (rest as any)?.groupId ?? updated.groupId;
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
 * Solo SUPERUSUARIO o DELEGADO pueden ejecutar esta acción.
 */
export async function deleteTeamAction(leagueId: string, groupId: string, teamId: string): Promise<ActionResult> {
  try {
    await requireEditRole(); // 🔒 Guard de rol

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
