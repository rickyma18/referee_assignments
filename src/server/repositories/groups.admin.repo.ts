import { norm } from "@/domain/groups/group.normalizers";
import type { Group } from "@/domain/groups/group.types";
import { toPlain } from "@/lib/serialize";
import { adminDb } from "@/server/admin/firebase-admin";

const COL = "groups";

export type GetAllParams = {
  search?: string;
  season?: string;
  pageSize?: number;
  cursorId?: string; // id del último doc
};

export async function getById(id: string) {
  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  // 🔑 Serializa para que sea “plain object” y fechas en ms
  return toPlain<Group>({ id: snap.id, ...(snap.data() as any) });
}

export async function existsByNameAndSeason(name: string, season: string): Promise<boolean> {
  const name_lc = norm(name);
  const season_lc = norm(season);
  const snap = await adminDb
    .collection(COL)
    .where("name_lc", "==", name_lc)
    .where("season_lc", "==", season_lc)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function getAll(params: GetAllParams = {}) {
  const { search, season, pageSize = 20, cursorId } = params;

  let q = adminDb.collection(COL).orderBy("season_lc", "asc").orderBy("name_lc", "asc");

  if (season) q = q.where("season_lc", "==", norm(season));
  if (pageSize) q = q.limit(pageSize);

  if (cursorId) {
    const last = await adminDb.collection(COL).doc(cursorId).get();
    if (last.exists) q = q.startAfter(last);
  }

  const snap = await q.get();

  let items = snap.docs.map((d) => toPlain<Group>({ id: d.id, ...(d.data() as any) }));

  if (search?.trim()) {
    const s = norm(search);
    items = items.filter((g) => g.name_lc.includes(s));
  }

  const nextCursorId = snap.docs.length ? snap.docs[snap.docs.length - 1].id : undefined;
  return { items, nextCursorId };
}

export async function create(data: { name: string; season: string }) {
  const name_lc = norm(data.name);
  const season_lc = norm(data.season);

  if (await existsByNameAndSeason(data.name, data.season)) {
    throw new Error("Ya existe un grupo con ese nombre en esa temporada.");
  }

  const ref = await adminDb.collection(COL).add({
    name: data.name,
    season: data.season,
    name_lc,
    season_lc,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { id: ref.id };
}

export async function update(id: string, data: { name: string; season: string }) {
  const name_lc = norm(data.name);
  const season_lc = norm(data.season);

  if (await existsByNameAndSeason(data.name, data.season)) {
    const dup = await adminDb
      .collection(COL)
      .where("name_lc", "==", name_lc)
      .where("season_lc", "==", season_lc)
      .limit(1)
      .get();

    if (!dup.empty && dup.docs[0].id !== id) {
      throw new Error("Ya existe un grupo con ese nombre en esa temporada.");
    }
  }

  await adminDb.collection(COL).doc(id).update({
    name: data.name,
    season: data.season,
    name_lc,
    season_lc,
    updatedAt: Date.now(),
  });

  return { id };
}

export async function remove(id: string) {
  await adminDb.collection(COL).doc(id).delete();
  return { id };
}
