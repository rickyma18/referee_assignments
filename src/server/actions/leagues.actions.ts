// src/server/actions/leagues.actions.ts
"use server";
import { revalidatePath } from "next/cache";
import * as repo from "@/server/repositories/leagues.repo";
import type { GetLeaguesParams } from "@/server/repositories/leagues.repo";
import { LeagueCreateSchema, LeagueUpdateSchema } from "@/domain/leagues/league.zod";
import { ZodError } from "zod";

type ActionResult<T = any> =
  | { ok: true; data?: T }
  | { ok: false; message?: string; fieldErrors?: Record<string, string | string[]> };

function zodFieldErrors(err: unknown) {
  if (err instanceof ZodError) return err.flatten().fieldErrors as Record<string, string[]>;
  return undefined;
}
function errMessage(err: unknown) {
  return err instanceof Error ? err.message : "Error inesperado";
}

export async function listLeaguesAction(params: GetLeaguesParams) {
  // listado simple, sin envoltura (lo usas para tablas/filtros)
  return repo.getAll(params);
}

export async function getLeagueAction(id: string) {
  return repo.getById(id);
}

// Helpers de slug opcionalmente aquí, si quieres autogenerar en el action
function slugify(name: string, season: string) {
  return `${name}-${season}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createLeagueAction(input: unknown): Promise<ActionResult> {
  try {
    // valida
    const parsed = LeagueCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, fieldErrors: zodFieldErrors(parsed.error), message: "Revisa los campos." };
    }
    const data = parsed.data;
    // slug si no viene
    const payload = { ...data, slug: data.slug ?? slugify(data.name, data.season) };

    const created = await repo.create(payload);
    revalidatePath("/dashboard/leagues");
    return { ok: true, data: created };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

export async function updateLeagueAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = LeagueUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, fieldErrors: zodFieldErrors(parsed.error), message: "Revisa los campos." };
    }
    const data = parsed.data;
    const payload = {
      ...data,
      slug: data.slug ?? slugify(data.name, data.season),
    };

    const updated = await repo.update(payload);
    revalidatePath("/dashboard/leagues");
    return { ok: true, data: updated };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

export async function deleteLeagueAction(id: string): Promise<ActionResult> {
  try {
    const res = await repo.remove(id);
    revalidatePath("/dashboard/leagues");
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}
