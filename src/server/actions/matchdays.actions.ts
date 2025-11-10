"use server";
import "server-only";

import { revalidatePath } from "next/cache";

import { ZodError } from "zod";

import { MatchdayCreateSchema, MatchdayUpdateSchema, type MatchdayCreateInput } from "@/domain/matchdays/matchday.zod";
import { toPlain } from "@/lib/serialize";
import { getServerAuthUser } from "@/server/auth/get-server-auth-user";
import * as repo from "@/server/repositories/matchdays.repo";

// --- Tipos de ActionResult ---
type FieldErrors = Record<string, string[]>;
type ActionResult<T = any> = { ok: true; data?: T } | { ok: false; message?: string; fieldErrors?: FieldErrors };

// --- Helpers ---
const zodFields = (e: unknown): FieldErrors | undefined => {
  if (!(e instanceof ZodError)) return undefined;
  const raw = e.flatten().fieldErrors; // Record<string, string[] | undefined>
  const entries = Object.entries(raw)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k, v]) => [k, v as string[]]);
  return Object.fromEntries(entries);
};

const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

function rvdList(leagueId: string, groupId: string) {
  revalidatePath(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`);
}

// --- Actions ---
export async function listMatchdaysAction(params: repo.GetAllParams) {
  // Asegura POJO + fechas en ISO ANTES de cruzar al cliente
  const rows = await repo.getAll(params);
  return toPlain(rows);
}

export async function getMatchdayAction(leagueId: string, groupId: string, id: string) {
  const row = await repo.getById(leagueId, groupId, id);
  return toPlain(row);
}

export async function getNextMatchdayNumberAction(leagueId: string, groupId: string) {
  // Devuelve un número plano (no requiere serialize)
  return repo.getNextNumber(leagueId, groupId);
}

export async function createMatchdayAction(input: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const data = MatchdayCreateSchema.parse(input);
    const auth = await getServerAuthUser().catch(() => null);

    const res = await repo.create({
      ...data,
      createdBy: auth?.uid ?? undefined,
    });

    rvdList(data.leagueId, data.groupId);
    // res tipa { id, number } (ya plano). Si en tu repo incluyes fechas, envuélvelo con toPlain(res).
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: msg(e), fieldErrors: zodFields(e) };
  }
}

export async function updateMatchdayAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const data = MatchdayUpdateSchema.parse(input);
    const res = await repo.update(data);
    rvdList(data.leagueId, data.groupId);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: msg(e), fieldErrors: zodFields(e) };
  }
}

export async function deleteMatchdayAction(leagueId: string, groupId: string, id: string): Promise<ActionResult> {
  try {
    await repo.remove(leagueId, groupId, id);
    rvdList(leagueId, groupId);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}
