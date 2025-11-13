// src/server/actions/referees.actions.ts
"use server";
import "server-only";
import { revalidatePath } from "next/cache";

import { z } from "zod";

import { RefereeCreateZ, RefereeUpdateZ, RefStatusZ, RefCategoryZ } from "@/domain/referees/referee.zod";
import { secureWrite } from "@/server/auth/secure-action";
import * as repo from "@/server/repositories/referees.repo";
import { getById } from "@/server/repositories/referees.repo";

import { serializeFirestore } from "./_utils";

type ActionResult<T = any> = { ok: true; data?: T } | { ok: false; message?: string };

type UiListParams = { q?: string; status?: string; category?: string; limit?: number };

// 🔎 Uniones fuertes para el repo
type RefStatus = z.infer<typeof RefStatusZ>; // "DISPONIBLE" | "DUDOSO" | "LESIONADO"
type RefCategory = z.infer<typeof RefCategoryZ>; // "TDP" | "LP"

// Helpers de narrowing (sin throw)
function pickStatus(v: unknown): RefStatus | undefined {
  return typeof v === "string" && (RefStatusZ.options as readonly string[]).includes(v) ? (v as RefStatus) : undefined;
}

function pickCategory(v: unknown): RefCategory | undefined {
  return typeof v === "string" && (RefCategoryZ.options as readonly string[]).includes(v)
    ? (v as RefCategory)
    : undefined;
}

/** Lista árbitros como POJOs serializables */
export async function listRefereesAction(params: UiListParams) {
  // Convierte a los tipos que el repo espera
  const repoParams: repo.ListParams = {
    q: params.q ?? undefined,
    status: pickStatus(params.status),
    category: pickCategory(params.category),
    limit: params.limit,
  };

  const rows = await repo.list(repoParams);

  // 🧭 Soporta ambas variantes del repo:
  // A) repo.list -> { items, nextCursor }
  // B) repo.list -> Array
  if (Array.isArray(rows)) {
    const items = rows.map((r: any) => serializeFirestore(r));
    return { items, nextCursor: null as null | string };
  } else {
    const items = (rows.items ?? []).map((r: any) => serializeFirestore(r));
    return { items, nextCursor: rows.nextCursor ?? null };
  }
}

export async function getRefereeAction(id: string) {
  const data = await getById(id);
  if (!data) return { ok: false as const, message: "No encontrado" };
  return { ok: true as const, data };
}

/** Crea y devuelve el árbitro creado (serializado) */
export async function createRefereeAction(input: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const data = RefereeCreateZ.parse(input);
    const res = await repo.create(data); // ideal: { ok: true, id } o { ok: true, data }

    if (!res?.ok) return { ok: false, message: (res as any)?.message ?? "Error al crear" };

    let created = (res as any).data;
    if (!created && (res as any).id) {
      created = await repo.getById((res as any).id);
    }

    revalidatePath("/dashboard/referees");
    return { ok: true, data: created ? serializeFirestore(created) : undefined };
  });
}

/** Actualiza y devuelve el árbitro actualizado (serializado) */
export async function updateRefereeAction(input: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const data = RefereeUpdateZ.parse(input);
    const res = await repo.update(data); // { ok: true } | { ok: true, data }

    if (!res?.ok) {
      return { ok: false, message: (res as any)?.message ?? "Error al actualizar" };
    }

    let updated = (res as any).data;
    // 👇 esto es lo que pide el linter
    updated ??= await repo.getById(data.id);

    revalidatePath("/dashboard/referees");

    return { ok: true, data: updated ? serializeFirestore(updated) : undefined };
  });
}

/** Cambia estatus y (opcional) devuelve el POJO actualizado */
export async function setRefereeStatusAction(id: string, status: unknown): Promise<ActionResult> {
  return secureWrite(async () => {
    const s = RefStatusZ.parse(status);
    const res = await repo.setStatus(id, s);
    if (!res?.ok) return { ok: false, message: (res as any)?.message ?? "No se pudo cambiar el estado" };

    const after = await repo.getById(id);
    revalidatePath("/dashboard/referees");
    return { ok: true, data: after ? serializeFirestore(after) : undefined };
  });
}

export async function deleteRefereeAction(id: string): Promise<ActionResult> {
  return secureWrite(async () => {
    const res = await repo.remove(id);
    if (!res?.ok) return { ok: false, message: (res as any)?.message ?? "No se pudo eliminar" };
    revalidatePath("/dashboard/referees");
    return { ok: true };
  });
}

export async function listAssessorsAction(params?: { q?: string }) {
  const rows = await repo.list({ q: params?.q, canAssessOnly: true, limit: 50 });
  const items = (rows.items ?? []).map((r: any) => serializeFirestore({ id: r.id, name: r.name }));
  return { items };
}
