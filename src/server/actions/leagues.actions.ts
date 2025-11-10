// =====================================
// src/server/actions/leagues.actions.ts
// =====================================
"use server";
import "server-only";

import { revalidatePath } from "next/cache";

import { ZodError } from "zod";

import { LeagueCreateSchema, LeagueUpdateSchema } from "@/domain/leagues/league.zod";
import { secureWrite } from "@/server/auth/secure-action"; // 🔒 Guard centralizado para proteger writes
import * as repo from "@/server/repositories/leagues.repo";
import type { GetLeaguesParams } from "@/server/repositories/leagues.repo";

// ---------- Tipos base ----------
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

// ---------- Helpers ----------
function slugify(name: string, season: string) {
  return `${name}-${season}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------- Actions ----------
/**
 * Lista todas las ligas (lectura pública)
 */
export async function listLeaguesAction(params: GetLeaguesParams) {
  return repo.getAll(params);
}

/**
 * Obtiene una liga por id (lectura pública)
 */
export async function getLeagueAction(id: string) {
  return repo.getById(id);
}

/**
 * Crea una liga
 * 🔒 Solo SUPERUSUARIO o DELEGADO pueden hacerlo
 */
export async function createLeagueAction(input: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const parsed = LeagueCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Revisa los campos del formulario."); // secureWrite atrapará y devolverá { ok:false, message }
    }

    const data = parsed.data;
    const payload = { ...data, slug: data.slug ?? slugify(data.name, data.season) };

    const created = await repo.create(payload);
    revalidatePath("/dashboard/leagues");
    return created;
  });
}

/**
 * Actualiza una liga existente
 * 🔒 Solo SUPERUSUARIO o DELEGADO pueden hacerlo
 */
export async function updateLeagueAction(input: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const parsed = LeagueUpdateSchema.safeParse(input);
    if (!parsed.success) throw new Error("Revisa los campos del formulario.");

    const data = parsed.data;
    const payload = {
      ...data,
      slug: data.slug ?? slugify(data.name, data.season),
    };

    const updated = await repo.update(payload);
    revalidatePath("/dashboard/leagues");
    return updated;
  });
}

/**
 * Elimina una liga
 * 🔒 Solo SUPERUSUARIO o DELEGADO pueden hacerlo
 */
export async function deleteLeagueAction(id: string): Promise<ActionResult> {
  return secureWrite(async () => {
    const res = await repo.remove(id);
    revalidatePath("/dashboard/leagues");
    return res;
  });
}
