// src/server/actions/referees.actions.ts
"use server";
import "server-only";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { RefereeTierValues } from "@/domain/referees/referee-tier";
import { RefereeCreateZ, RefereeUpdateZ, RefStatusZ, RefCategoryZ } from "@/domain/referees/referee.zod";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { assertDocBelongsToDelegate, assertEffectiveDelegateId } from "@/server/auth/require-delegate-access";
import { requireSuperuser } from "@/server/auth/require-role";
import { secureWrite } from "@/server/auth/secure-action";
import * as repo from "@/server/repositories/referees.repo";
import { getById } from "@/server/repositories/referees.repo";

import { ForbiddenError } from "../auth/errors";

import { serializeFirestore } from "./_utils";

type ActionResult<T = any> = { ok: true; data?: T } | { ok: false; message?: string };

type UiListParams = { q?: string; status?: string; category?: string; limit?: number };

// Uniones fuertes para el repo
type RefStatus = z.infer<typeof RefStatusZ>;
type RefCategory = z.infer<typeof RefCategoryZ>;

const RefTierZ = z.enum(RefereeTierValues);

// Helpers de narrowing
function pickStatus(v: unknown): RefStatus | undefined {
  return typeof v === "string" && (RefStatusZ.options as readonly string[]).includes(v) ? (v as RefStatus) : undefined;
}

function pickCategory(v: unknown): RefCategory | undefined {
  return typeof v === "string" && (RefCategoryZ.options as readonly string[]).includes(v)
    ? (v as RefCategory)
    : undefined;
}

/**
 * Lista árbitros.
 *
 * Seguridad multi-tenant:
 * - DELEGADO: solo ve árbitros con su delegateId
 * - SUPERUSUARIO: ve todos (modo global) o filtra por selectedDelegateId
 * - ARBITRO/ASISTENTE: ve árbitros de selectedDelegateId (validado contra allowedDelegateIds)
 *
 * @param params - Parámetros de búsqueda
 * @param options.selectedDelegateId - El delegateId del query param ?delegateId=...
 */
export async function listRefereesAction(
  params: UiListParams,
  options?: { selectedDelegateId?: string | null; activeDelegateId?: string | null },
) {
  const ctx = await getDelegateContext({
    selectedDelegateId: options?.selectedDelegateId ?? options?.activeDelegateId,
  });

  // ✅ Multi-tenant: filtrar en Firestore (no en memoria)
  // - SUPER global (sin effectiveDelegateId): ve todos
  // - SUPER impersonando / DELEGADO / ARBITRO: filtra por delegateId
  const delegateIdFilter = ctx.effectiveDelegateId ?? undefined;

  // DELEGADO/ARBITRO sin delegateId asignado: devolver vacío
  if ((ctx.role === "DELEGADO" || ctx.role === "ARBITRO" || ctx.role === "ASISTENTE") && !delegateIdFilter) {
    return { items: [], nextCursor: null };
  }

  const repoParams: repo.ListParams = {
    q: params.q ?? undefined,
    status: pickStatus(params.status),
    category: pickCategory(params.category),
    limit: params.limit,
    delegateId: delegateIdFilter, // ✅ Filtro en Firestore
  };

  const rows = await repo.list(repoParams);

  // Soporta ambas variantes del repo
  let items: any[];
  if (Array.isArray(rows)) {
    items = rows;
  } else {
    items = rows.items ?? [];
  }

  const serialized = items.map((r: any) => serializeFirestore(r));

  return {
    items: serialized,
    nextCursor: Array.isArray(rows) ? null : ((rows as any).nextCursor ?? null),
  };
}

/**
 * Obtiene un árbitro por id.
 *
 * Seguridad multi-tenant:
 * - Valida ownership por delegateId
 *
 * @param id - ID del árbitro
 * @param options.activeDelegateId - Para SUPER, el delegado seleccionado en UI
 */
export async function getRefereeAction(id: string, options?: { activeDelegateId?: string | null }) {
  const ctx = await getDelegateContext(options);
  const data = await getById(id);

  if (!data) {
    return { ok: false as const, message: "No encontrado" };
  }

  // Validar ownership
  try {
    assertDocBelongsToDelegate(data as unknown as Record<string, unknown>, ctx);
  } catch {
    return { ok: false as const, message: "No tienes acceso a este árbitro" };
  }

  return { ok: true as const, data };
}

/**
 * Crea un árbitro.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Fuerza delegateId desde servidor
 */
export async function createRefereeAction(input: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const ctx = await getDelegateContext();

    // Requiere delegateId para asignar el árbitro
    const delegateId = assertEffectiveDelegateId(ctx);

    const data = RefereeCreateZ.parse(input);

    // Crear con delegateId forzado
    const res = await repo.create({
      ...data,
      delegateId,
    });

    if (!res?.ok) return { ok: false, message: (res as any)?.message ?? "Error al crear" };

    let created = (res as any).data;
    if (!created && (res as any).id) {
      created = await repo.getById((res as any).id);
    }

    revalidatePath("/dashboard/referees");
    return { ok: true, data: created ? serializeFirestore(created) : undefined };
  });
}

/**
 * Actualiza un árbitro.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida ownership del referee existente
 */
export async function updateRefereeAction(input: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const ctx = await getDelegateContext();
    const data = RefereeUpdateZ.parse(input);

    // Cargar árbitro existente y validar ownership
    const existing = await repo.getById(data.id);
    if (!existing) {
      throw new ForbiddenError("Árbitro no encontrado");
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    // Preservar delegateId existente o asignar nuevo
    const existingDelegateId = existing.delegateId;
    const res = await repo.update({
      ...data,
      delegateId: existingDelegateId ?? ctx.effectiveDelegateId,
    });

    if (!res?.ok) {
      throw new Error((res as any)?.message ?? "Error al actualizar");
    }

    let updated = (res as any).data;
    updated ??= await repo.getById(data.id);

    revalidatePath("/dashboard/referees");

    return { ok: true, data: updated ? serializeFirestore(updated) : undefined };
  });
}

/**
 * Cambia estatus de un árbitro.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida ownership
 */
export async function setRefereeStatusAction(id: string, status: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const ctx = await getDelegateContext();

    // Cargar árbitro y validar ownership
    const existing = await repo.getById(id);
    if (!existing) {
      throw new ForbiddenError("Árbitro no encontrado");
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    const s = RefStatusZ.parse(status);
    const res = await repo.setStatus(id, s);
    if (!res?.ok) throw new Error((res as any)?.message ?? "No se pudo cambiar el estado");

    const after = await repo.getById(id);
    revalidatePath("/dashboard/referees");
    return { ok: true, data: after ? serializeFirestore(after) : undefined };
  });
}

/**
 * Elimina un árbitro.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida ownership
 */
export async function deleteRefereeAction(id: string): Promise<ActionResult> {
  return secureWrite(async () => {
    const ctx = await getDelegateContext();

    // Cargar árbitro y validar ownership
    const existing = await repo.getById(id);
    if (!existing) {
      throw new ForbiddenError("Árbitro no encontrado");
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    const res = await repo.remove(id);
    if (!res?.ok) throw new Error((res as any)?.message ?? "No se pudo eliminar");

    revalidatePath("/dashboard/referees");
    return { ok: true };
  });
}

/**
 * Lista assessors (árbitros que pueden evaluar).
 *
 * Seguridad multi-tenant:
 * - Misma lógica que listRefereesAction
 */
export async function listAssessorsAction(params?: { q?: string }, options?: { activeDelegateId?: string | null }) {
  const ctx = await getDelegateContext(options);

  // ✅ Multi-tenant: filtrar en Firestore (no en memoria)
  const delegateIdFilter = ctx.effectiveDelegateId ?? undefined;

  // DELEGADO sin delegateId asignado: devolver vacío
  if (ctx.role === "DELEGADO" && !delegateIdFilter) {
    return { items: [] };
  }

  const rows = await repo.list({
    q: params?.q,
    canAssessOnly: true,
    limit: 50,
    delegateId: delegateIdFilter, // ✅ Filtro en Firestore
  });

  const items = rows.items ?? [];
  const serialized = items.map((r: any) => serializeFirestore({ id: r.id, name: r.name }));
  return { items: serialized };
}

/**
 * Cambia el tier del árbitro.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO
 * - Valida ownership
 */
export async function setRefereeTierAction(id: string, tier: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const ctx = await getDelegateContext();

    // Cargar árbitro y validar ownership
    const existing = await repo.getById(id);
    if (!existing) {
      throw new ForbiddenError("Árbitro no encontrado");
    }

    assertDocBelongsToDelegate(existing as unknown as Record<string, unknown>, ctx);

    const t = RefTierZ.parse(tier);
    const res = await repo.setTier(id, t);
    if (!res?.ok) {
      throw new Error((res as any)?.message ?? "No se pudo cambiar el tier");
    }

    const after = await repo.getById(id);
    return { ok: true, data: after ? serializeFirestore(after) : undefined };
  });
}

/**
 * Establece override de RCS para un árbitro.
 *
 * Seguridad:
 * - Solo SUPERUSUARIO (sin restricción de delegateId - es una función administrativa global)
 */
export async function setRefereeRcsOverrideAction(input: { id: unknown; rcsOverride: unknown }): Promise<ActionResult> {
  try {
    await requireSuperuser();

    const id = z.string().min(1, "ID requerido").parse(input.id);

    const raw = input.rcsOverride;
    let value: number | null = null;

    if (raw === null || typeof raw === "undefined" || (typeof raw === "string" && raw.trim() === "")) {
      value = null;
    } else if (typeof raw === "number") {
      value = raw;
    } else if (typeof raw === "string") {
      const normalized = raw.replace(",", ".").trim();
      const n = Number(normalized);
      if (Number.isNaN(n)) {
        throw new Error("Valor de RCS inválido");
      }
      value = n;
    } else {
      throw new Error("Valor de RCS inválido");
    }

    if (value != null) {
      if (!Number.isFinite(value)) {
        throw new Error("Valor de RCS inválido");
      }
      if (value < 0 || value > 10) {
        throw new Error("El RCS debe estar entre 0 y 10");
      }
    }

    const res = await repo.setRcsOverride(id, value);
    if (!res.ok) {
      return { ok: false, message: res.message ?? "No se pudo actualizar el RCS" };
    }

    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    const message = e instanceof Error ? e.message : "Error inesperado";
    return { ok: false, message };
  }
}
