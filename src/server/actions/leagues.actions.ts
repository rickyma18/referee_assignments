// =====================================
// src/server/actions/leagues.actions.ts
// =====================================
"use server";
import "server-only";

import { revalidatePath } from "next/cache";

import { ZodError } from "zod";

import { LeagueCreateSchema, LeagueUpdateSchema } from "@/domain/leagues/league.zod";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import {
  assertCanEdit,
  assertDocBelongsToDelegate,
  assertEffectiveDelegateId,
} from "@/server/auth/require-delegate-access";
import * as repo from "@/server/repositories/leagues.repo";
import type { GetLeaguesParams } from "@/server/repositories/leagues.repo";

import { ForbiddenError } from "../auth/errors";

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
 * Lista ligas.
 *
 * Seguridad multi-tenant:
 * - SUPERUSUARIO: puede ver todas (modo global) o filtrar por selectedDelegateId
 * - DELEGADO: solo ve ligas con su delegateId
 * - ARBITRO/ASISTENTE: ve ligas de selectedDelegateId (validado contra allowedDelegateIds)
 *
 * @param params - Parámetros del repositorio
 * @param options.selectedDelegateId - El delegateId del query param ?delegateId=...
 */
export async function listLeaguesAction(
  params: GetLeaguesParams,
  options?: { selectedDelegateId?: string | null; activeDelegateId?: string | null },
) {
  const ctx = await getDelegateContext({
    selectedDelegateId: options?.selectedDelegateId ?? options?.activeDelegateId,
  });

  // ✅ Determinar delegateId para filtrar en Firestore
  let filterDelegateId: string | undefined;

  if (ctx.role === "DELEGADO") {
    if (!ctx.effectiveDelegateId) {
      return [];
    }
    filterDelegateId = ctx.effectiveDelegateId;
  } else if (ctx.role === "ARBITRO" || ctx.role === "ASISTENTE") {
    // ARBITRO/ASISTENTE: usar effectiveDelegateId (ya validado en getDelegateContext)
    if (!ctx.effectiveDelegateId) {
      return [];
    }
    filterDelegateId = ctx.effectiveDelegateId;
  } else if (ctx.isSuper && ctx.effectiveDelegateId) {
    // SUPER impersonando: filtrar por el delegado seleccionado
    filterDelegateId = ctx.effectiveDelegateId;
  }
  // SUPERUSUARIO sin selección: ve todas (filterDelegateId = undefined)

  // ✅ Pasar delegateId al repo para filtrar en Firestore query
  const items = await repo.getAll({
    ...params,
    delegateId: filterDelegateId,
  });

  return items;
}

/**
 * Obtiene una liga por id.
 *
 * Seguridad multi-tenant:
 * - Valida que la liga pertenezca al delegado actual (si aplica)
 *
 * @param id - ID de la liga
 * @param options.activeDelegateId - Para SUPER, el delegado seleccionado en UI
 */
export async function getLeagueAction(id: string, options?: { activeDelegateId?: string | null }) {
  const ctx = await getDelegateContext(options);
  const league = await repo.getById(id);

  if (!league) {
    return null;
  }

  // Validar ownership (lanza error si no tiene acceso)
  try {
    assertDocBelongsToDelegate(league as unknown as Record<string, unknown>, ctx);
  } catch {
    // Si no tiene acceso, devolver null (como si no existiera)
    return null;
  }

  return league;
}

/**
 * Crea una liga.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO pueden crear
 * - Fuerza delegateId desde el servidor (no confiar en cliente)
 */
export async function createLeagueAction(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await getDelegateContext();
    assertCanEdit(ctx);

    // Requiere effectiveDelegateId para asignar la liga
    const delegateId = assertEffectiveDelegateId(ctx);

    const parsed = LeagueCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: "Revisa los campos del formulario.", fieldErrors: zodFieldErrors(parsed.error) };
    }

    const data = parsed.data;
    const payload = {
      ...data,
      slug: data.slug ?? slugify(data.name, data.season),
      delegateId, // Forzar delegateId desde servidor
    };

    const created = await repo.create(payload);
    revalidatePath("/dashboard/leagues");
    return { ok: true, data: created };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: errMessage(e), fieldErrors: zodFieldErrors(e) };
  }
}

/**
 * Actualiza una liga existente.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO pueden actualizar
 * - Valida que la liga pertenezca al delegado actual
 * - No permite cambiar el delegateId (a menos que sea SUPER)
 */
export async function updateLeagueAction(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await getDelegateContext();
    assertCanEdit(ctx);

    const parsed = LeagueUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: "Revisa los campos del formulario.", fieldErrors: zodFieldErrors(parsed.error) };
    }

    const data = parsed.data;

    // Cargar liga existente y validar ownership
    const existing = await repo.getById(data.id);
    if (!existing) {
      return { ok: false, message: "Liga no encontrada" };
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    // Preparar payload (preservar delegateId existente o asignar uno nuevo si no tenía)
    const existingDelegateId = (existing as any).delegateId;
    const payload = {
      ...data,
      slug: data.slug ?? slugify(data.name, data.season),
      // Mantener delegateId existente, o asignar el del contexto si no tenía
      delegateId: existingDelegateId ?? ctx.effectiveDelegateId,
    };

    const updated = await repo.update(payload);
    revalidatePath("/dashboard/leagues");
    return { ok: true, data: updated };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: errMessage(e), fieldErrors: zodFieldErrors(e) };
  }
}

/**
 * Elimina una liga.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO pueden eliminar
 * - Valida que la liga pertenezca al delegado actual
 */
export async function deleteLeagueAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await getDelegateContext();
    assertCanEdit(ctx);

    // Cargar liga y validar ownership
    const existing = await repo.getById(id);
    if (!existing) {
      return { ok: false, message: "Liga no encontrada" };
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    const res = await repo.remove(id);
    revalidatePath("/dashboard/leagues");
    return { ok: true, data: res };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: errMessage(e) };
  }
}
