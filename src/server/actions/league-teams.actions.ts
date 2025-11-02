// src/server/actions/league-teams.actions.ts
"use server";
import { revalidatePath } from "next/cache";
import * as repo from "@/server/repositories/league-teams.repo";
import { ZodError } from "zod";

type ActionResult<T = any> =
  | { ok: true; data?: T }
  | { ok: false; message?: string; fieldErrors?: Record<string, string | string[]> };

const zodFields = (e: unknown) => (e instanceof ZodError ? e.flatten().fieldErrors : undefined);
const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

export async function listLeagueTeamsAction(leagueId: string, groupId: string) {
  return repo.list(leagueId, groupId);
}

export async function createLeagueTeamAction(input: unknown): Promise<ActionResult> {
  try {
    const created = await repo.create(input); // valida en repo o usa tu zod aquí si lo tienes
    revalidatePath(`/dashboard/leagues`);
    return { ok: true, data: created };
  } catch (e) {
    return { ok: false, message: msg(e), fieldErrors: zodFields(e) as any };
  }
}

export async function updateLeagueTeamAction(input: unknown): Promise<ActionResult> {
  try {
    const updated = await repo.update(input);
    revalidatePath(`/dashboard/leagues`);
    return { ok: true, data: updated };
  } catch (e) {
    return { ok: false, message: msg(e), fieldErrors: zodFields(e) as any };
  }
}

export async function deleteLeagueTeamAction(leagueId: string, groupId: string, id: string): Promise<ActionResult> {
  try {
    const res = await repo.remove(leagueId, groupId, id);
    revalidatePath(`/dashboard/leagues`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}
