import type { League } from "@/domain/leagues/league.types";
import { LeagueCreateSchema, LeagueUpdateSchema } from "@/domain/leagues/league.zod";
import { serialize } from "@/lib/serialize";
import { adminDb, AdminFieldValue } from "@/server/admin/firebase-admin";

const leaguesCol = () => adminDb.collection("leagues");

export type GetLeaguesParams = {
  status?: "ACTIVE" | "ARCHIVED";
  search?: string;
  // ✅ multi-tenant: filtrar por delegateId en Firestore query
  delegateId?: string;
};

export async function getAll(params: GetLeaguesParams = {}) {
  const { status, search, delegateId } = params;

  // ✅ Filtrar en Firestore query cuando hay delegateId (más eficiente)
  let query: FirebaseFirestore.Query = leaguesCol();
  if (delegateId) {
    query = query.where("delegateId", "==", delegateId);
  }
  if (status) {
    query = query.where("status", "==", status);
  }

  const snaps = await query.get();
  let items = snaps.docs.map((d) => ({ id: d.id, ...serialize(d.data()) })) as League[];

  // Filtro en memoria solo para búsqueda de texto (no indexable)
  if (search) {
    const s = search.toLowerCase();
    items = items.filter(
      (x) =>
        (x.name ?? "").toLowerCase().includes(s) ||
        (x.slug ?? "").toLowerCase().includes(s) ||
        (x.season ?? "").toLowerCase().includes(s),
    );
  }
  return items;
}

export async function getById(id: string) {
  const ref = leaguesCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(serialize(snap.data()) as any) } as League;
}

export async function create(input: unknown) {
  const data = LeagueCreateSchema.parse(input);

  // ✅ delegateId debe venir del server action (inyectado)
  const delegateId = (data as any).delegateId as string | undefined;
  if (!delegateId) {
    throw new Error("Falta delegateId (server).");
  }

  // ✅ Unicidad de slug POR DELEGADO (no global)
  // Índice requerido: delegateId + slug
  const dup = await leaguesCol().where("delegateId", "==", delegateId).where("slug", "==", data.slug).limit(1).get();
  if (!dup.empty) throw new Error("Slug ya existe para este delegado.");

  const ref = leaguesCol().doc();
  await ref.set({
    ...data,
    delegateId, // ✅ guardado en Firestore
    createdAt: AdminFieldValue.serverTimestamp(),
    updatedAt: AdminFieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return { id: ref.id, ...(serialize(snap.data()) as any) } as League;
}

export async function update(input: unknown) {
  const data = LeagueUpdateSchema.parse(input);
  const ref = leaguesCol().doc(data.id);

  // Cargar el doc actual para obtener su delegateId
  const currentSnap = await ref.get();
  if (!currentSnap.exists) {
    throw new Error("Liga no encontrada.");
  }
  const currentData = currentSnap.data() as any;
  const delegateId = currentData?.delegateId as string | undefined;

  // ⚠️ No permitir cambiar delegateId (ignorar si viene en input)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { delegateId: _ignoredDelegateId, ...safeData } = data as any;

  // ✅ Si cambia el slug, validar unicidad POR DELEGADO
  if (safeData.slug && safeData.slug !== currentData.slug && delegateId) {
    const dup = await leaguesCol()
      .where("delegateId", "==", delegateId)
      .where("slug", "==", safeData.slug)
      .limit(2)
      .get();
    const hasDuplicate = dup.docs.some((d) => d.id !== data.id);
    if (hasDuplicate) {
      throw new Error("Slug ya existe para este delegado.");
    }
  }

  await ref.update({
    ...safeData,
    updatedAt: AdminFieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return { id: ref.id, ...(serialize(snap.data()) as any) } as League;
}

export async function remove(id: string) {
  await leaguesCol().doc(id).delete();
  return { ok: true };
}

/**
 * Busca liga por slug.
 * @param slug - El slug a buscar
 * @param delegateId - Si se pasa, busca solo dentro del scope del delegado
 */
export async function findBySlug(slug: string, delegateId?: string) {
  let query: FirebaseFirestore.Query = leaguesCol().where("slug", "==", slug);

  // ✅ Filtrar por delegateId si se proporciona
  if (delegateId) {
    query = query.where("delegateId", "==", delegateId);
  }

  const q = await query.limit(1).get();
  if (q.empty) return null;
  const d = q.docs[0];
  return { id: d.id, ...(serialize(d.data()) as any) } as League;
}
