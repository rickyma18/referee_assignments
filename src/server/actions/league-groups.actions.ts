// =====================================
// src/server/actions/league-groups.actions.ts
// =====================================
"use server";

import { revalidatePath } from "next/cache";

import { ZodError } from "zod";

import { secureWrite } from "@/server/auth/secure-action";
import * as repo from "@/server/repositories/league-groups.repo";

type ActionResult<T = any> =
  | { ok: true; data?: T }
  | { ok: false; message?: string; fieldErrors?: Record<string, string | string[]> };

const zodFields = (e: unknown) => (e instanceof ZodError ? e.flatten().fieldErrors : undefined);
const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

// ------- Lecturas (no requieren rol) -------
export async function listLeagueGroupsAction(leagueId: string) {
  return repo.list(leagueId);
}

export async function getLeagueGroupAction(leagueId: string, groupId: string) {
  return repo.get(leagueId, groupId);
}

// ------- Escrituras (protegidas) -------
export async function createLeagueGroupAction(input: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    // Si tienes un schema Zod para league-group, valida aquí.
    const created = await repo.create(input);
    const leagueId = (input as { leagueId: string }).leagueId;
    if (leagueId) revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return created;
  });
}

export async function updateLeagueGroupAction(input: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const updated = await repo.update(input);
    const leagueId = (input as { leagueId: string }).leagueId;
    if (leagueId) revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return updated;
  });
}

export async function deleteLeagueGroupAction(leagueId: string, groupId: string): Promise<ActionResult> {
  return secureWrite(async () => {
    const res = await repo.remove(leagueId, groupId);
    revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return res;
  });
}
