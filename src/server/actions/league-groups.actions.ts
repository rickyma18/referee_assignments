// src/server/actions/league-groups.actions.ts
"use server";
import { revalidatePath } from "next/cache";
import * as repo from "@/server/repositories/league-groups.repo";
import { ZodError } from "zod";

type ActionResult<T = any> =
  | { ok: true; data?: T }
  | { ok: false; message?: string; fieldErrors?: Record<string, string | string[]> };

const zodFields = (e: unknown) => (e instanceof ZodError ? e.flatten().fieldErrors : undefined);
const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

export async function listLeagueGroupsAction(leagueId: string) {
  return repo.list(leagueId);
}

export async function getLeagueGroupAction(leagueId: string, groupId: string) {
  return repo.get(leagueId, groupId);
}

export async function createLeagueGroupAction(input: unknown): Promise<ActionResult> {
  try {
    const created = await repo.create(input);
    const leagueId = (input as { leagueId: string }).leagueId;
    revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return { ok: true, data: created };
  } catch (e) {
    const leagueId = (input as any)?.leagueId ?? "";
    if (leagueId) revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return { ok: false, message: msg(e), fieldErrors: zodFields(e) as any };
  }
}

export async function updateLeagueGroupAction(input: unknown): Promise<ActionResult> {
  try {
    const updated = await repo.update(input);
    const leagueId = (input as { leagueId: string }).leagueId;
    revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return { ok: true, data: updated };
  } catch (e) {
    const leagueId = (input as any)?.leagueId ?? "";
    if (leagueId) revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return { ok: false, message: msg(e), fieldErrors: zodFields(e) as any };
  }
}

export async function deleteLeagueGroupAction(leagueId: string, groupId: string): Promise<ActionResult> {
  try {
    const res = await repo.remove(leagueId, groupId);
    revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}
