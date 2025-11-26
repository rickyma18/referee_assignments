// =====================================
// src/server/repositories/teams.repo.ts
// =====================================

import { TeamTierValues } from "@/domain/teams/team-tier";
import { normTeamName } from "@/domain/teams/team.normalizers";
import type { Team } from "@/domain/teams/team.types";
import type { TeamCreateInput, TeamUpdateInput } from "@/domain/teams/team.zod";
import { toPlain } from "@/lib/serialize";
import { adminDb, AdminFieldValue } from "@/server/admin/firebase-admin";

const COL = "teams";

type TeamTier = (typeof TeamTierValues)[number];

export type GetByGroupParams = {
  groupId: string;
  search?: string; // filtra por prefijo de name/name_lc
  pageSize?: number; // límite por página
  cursorId?: string; // id del último doc para paginar
};

export async function getById(id: string) {
  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toPlain<Team>({ id: snap.id, ...(snap.data() as any) });
}

/**
 * Lista equipos por grupo, con soporte de búsqueda (prefijo) y paginación por cursor.
 * - Ordena por name_lc para consistencia y para permitir startAt/endAt.
 * - Para cursor, resuelve el doc y usa su name_lc como startAfter.
 */
export async function getByGroup(params: GetByGroupParams) {
  const { groupId, search, pageSize = 20, cursorId } = params;

  if (!groupId) throw new Error("groupId is required");

  let q = adminDb.collection(COL).where("groupId", "==", groupId).orderBy("name_lc", "asc");

  // Búsqueda por prefijo sobre name_lc (startAt/endAt)
  if (search && search.trim().length > 0) {
    const s = normTeamName(search);
    const end = s + "\uf8ff";
    q = q.startAt(s).endAt(end);
  }

  // Cursor basado en el doc previo (usamos su name_lc para startAfter)
  if (cursorId) {
    const cursorSnap = await adminDb.collection(COL).doc(cursorId).get();
    if (cursorSnap.exists) {
      const data = cursorSnap.data() as any;
      const cursorNameLc = (data?.name_lc ?? "") as string;
      q = q.startAfter(cursorNameLc);
    }
  }

  const snaps = await q.limit(pageSize).get();
  const items = snaps.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Team[];
  const last = snaps.docs.at(-1);
  const nextCursorId = last?.id ?? null;

  return {
    items: items.map((x) => toPlain<Team>(x)),
    nextCursorId,
  };
}

/**
 * Verifica existencia de nombre (normalizado) dentro del mismo groupId.
 * - Si se pasa excludeId, lo excluye (para updates).
 */
export async function existsByNameInGroup(name: string, groupId: string, excludeId?: string) {
  const name_lc = normTeamName(name);

  const q = await adminDb
    .collection(COL)
    .where("groupId", "==", groupId)
    .where("name_lc", "==", name_lc)
    .limit(2)
    .get();

  if (q.empty) return false;

  // Excluir el propio doc (updates)
  const exists = q.docs.some((d) => d.id !== excludeId);
  return exists;
}

/**
 * Crea un equipo. Valida duplicado (name_lc + groupId).
 * Devuelve el documento creado en forma "plain".
 */
export async function create(input: TeamCreateInput) {
  const name_lc = normTeamName(input.name);

  // Evitar duplicados en el mismo grupo
  const dup = await existsByNameInGroup(input.name, input.groupId);
  if (dup) {
    const e = new Error("DUPLICATE_NAME_IN_GROUP");
    // @ts-expect-error attach code
    e.code = "DUPLICATE_NAME_IN_GROUP";
    throw e;
  }

  const nowServer = AdminFieldValue.serverTimestamp();

  const payload = {
    name: input.name.trim(),
    name_lc,
    groupId: input.groupId,
    municipality: (input.municipality ?? "").trim(),
    stadium: (input.stadium ?? "").trim(),
    venue: (input.venue ?? "").trim(),
    logoUrl: input.logoUrl ?? null,
    // 👇 nuevo campo tier (deja que Zod ponga default "REGULARES"
    tier: (input as any).tier ?? "REGULARES",
    createdAt: nowServer,
    updatedAt: nowServer,
  };

  const ref = await adminDb.collection(COL).add(payload);
  const snap = await ref.get();
  return toPlain<Team>({ id: ref.id, ...(snap.data() as any) });
}

/**
 * Actualiza un equipo. Recalcula name_lc si cambia name.
 * Valida duplicados dentro del mismo groupId.
 */
export async function update(id: string, input: Omit<TeamUpdateInput, "id">) {
  const ref = adminDb.collection(COL).doc(id);
  const before = await ref.get();
  if (!before.exists) throw new Error("NOT_FOUND");

  const prev = before.data() as any;

  // Si cambia el name o el groupId, validar duplicado
  const nameChanged = input.name && input.name.trim() !== (prev.name ?? "");
  const groupChanged = input.groupId && input.groupId !== (prev.groupId ?? "");

  const nextName = input.name?.trim() ?? prev.name ?? "";
  const nextGroup = input.groupId ?? prev.groupId ?? "";

  if (nameChanged || groupChanged) {
    const dup = await existsByNameInGroup(nextName, nextGroup, id);
    if (dup) {
      const e = new Error("DUPLICATE_NAME_IN_GROUP");
      // @ts-expect-error attach code
      e.code = "DUPLICATE_NAME_IN_GROUP";
      throw e;
    }
  }

  const patch: Record<string, any> = {
    groupId: input.groupId ?? prev.groupId ?? "",
    name: nextName,
    name_lc: nameChanged ? normTeamName(nextName) : (prev.name_lc ?? normTeamName(nextName)),
    municipality: input.municipality ?? prev.municipality ?? "",
    stadium: input.stadium ?? prev.stadium ?? "",
    venue: input.venue ?? prev.venue ?? "",
    logoUrl: input.logoUrl ?? prev.logoUrl ?? null,
    // 👇 mantener/actualizar tier
    tier: (input as any).tier ?? prev.tier ?? "REGULARES",
    updatedAt: AdminFieldValue.serverTimestamp(),
  };

  await ref.update(patch);
  const after = await ref.get();
  return toPlain<Team>({ id, ...(after.data() as any) });
}

/**
 * Elimina un equipo por id.
 * (Más adelante puedes validar referencias, p. ej. si hay partidos asociados.)
 */
export async function remove(id: string) {
  await adminDb.collection(COL).doc(id).delete();
  return { id };
}

/**
 * Cambia solo el tier del equipo (para el board drag-and-drop).
 */
export async function setTier(id: string, tier: TeamTier) {
  await adminDb.collection(COL).doc(id).set({ tier, updatedAt: AdminFieldValue.serverTimestamp() }, { merge: true });
  return { ok: true as const };
}
