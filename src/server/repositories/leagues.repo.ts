import type { League } from "@/domain/leagues/league.types";
import { LeagueCreateSchema, LeagueUpdateSchema } from "@/domain/leagues/league.zod";
import { serialize } from "@/lib/serialize";
import { adminDb, AdminFieldValue } from "@/server/admin/firebase-admin";

const leaguesCol = () => adminDb.collection("leagues");

export type GetLeaguesParams = { status?: "ACTIVE" | "ARCHIVED"; search?: string };

export async function getAll(params: GetLeaguesParams = {}) {
  const { status, search } = params;

  const snaps = await leaguesCol().get();
  let items = snaps.docs.map((d) => ({ id: d.id, ...serialize(d.data()) })) as League[];

  if (status) items = items.filter((x) => x.status === status);
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

  // Unicidad de slug
  const dup = await leaguesCol().where("slug", "==", data.slug).limit(1).get();
  if (!dup.empty) throw new Error("Slug ya existe");

  const ref = leaguesCol().doc();
  await ref.set({
    ...data,
    createdAt: AdminFieldValue.serverTimestamp(),
    updatedAt: AdminFieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return { id: ref.id, ...(serialize(snap.data()) as any) } as League;
}

export async function update(input: unknown) {
  const data = LeagueUpdateSchema.parse(input);
  const ref = leaguesCol().doc(data.id);

  await ref.update({
    ...data,
    updatedAt: AdminFieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return { id: ref.id, ...(serialize(snap.data()) as any) } as League;
}

export async function remove(id: string) {
  await leaguesCol().doc(id).delete();
  return { ok: true };
}

export async function findBySlug(slug: string) {
  const q = await leaguesCol().where("slug", "==", slug).limit(1).get();
  if (q.empty) return null;
  const d = q.docs[0];
  return { id: d.id, ...(serialize(d.data()) as any) } as League;
}
