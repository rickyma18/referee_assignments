// =============================
// src/server/repositories/groups.repo.ts
// =============================

import { FieldValue } from "firebase-admin/firestore";

import { toLc } from "@/domain/groups/group.normalizers";
import type { Group } from "@/domain/groups/group.types";
import { serialize } from "@/lib/serialize";
import { adminDb } from "@/server/admin/firebase-admin";

const leaguesCol = () => adminDb.collection("leagues");
const groupsCol = (leagueId: string) => leaguesCol().doc(leagueId).collection("groups");

export type GetAllParams = {
  leagueId: string;
  search?: string;
  season?: string;
  limit?: number;
  cursor?: string; // doc id para paginación simple
};

export async function getAll(params: GetAllParams) {
  const { leagueId, search, season, limit = 25, cursor } = params;

  let q: FirebaseFirestore.Query = groupsCol(leagueId).orderBy("season_lc").orderBy("name_lc").limit(limit);

  if (season) q = q.where("season_lc", "==", toLc(season));
  if (cursor) {
    const snap = await groupsCol(leagueId).doc(cursor).get();
    if (snap.exists) q = q.startAfter(snap.get("season_lc"), snap.get("name_lc"));
  }

  const snaps = await q.get();

  let items = snaps.docs.map((d) => serialize<Group>({ id: d.id, ...(d.data() as any) }));

  if (search && search.trim()) {
    const s = toLc(search);
    items = items.filter((g) => (g.name_lc ?? "").includes(s) || (g.season_lc ?? "").includes(s));
  }

  return items;
}

export async function getById(leagueId: string, id: string) {
  const snap = await groupsCol(leagueId).doc(id).get();
  if (!snap.exists) return null;
  return serialize<Group>({ id: snap.id, ...(snap.data() as any) });
}

export async function existsByNameAndSeason(leagueId: string, name: string, season: string, excludeId?: string) {
  const name_lc = toLc(name);
  const season_lc = toLc(season);
  const q = await groupsCol(leagueId)
    .where("name_lc", "==", name_lc)
    .where("season_lc", "==", season_lc)
    .limit(1)
    .get();
  const doc = q.docs[0];
  if (!doc) return false;
  if (excludeId && doc.id === excludeId) return false;
  return true;
}

export async function create(input: { leagueId: string; name: string; season: string; order?: number }) {
  const { leagueId, name, season } = input;
  const order = typeof input.order === "number" ? input.order : 0;

  if (await existsByNameAndSeason(leagueId, name, season)) {
    throw new Error("Ya existe un grupo con ese nombre en esa temporada en la liga");
  }

  const name_lc = toLc(name);
  const season_lc = toLc(season);
  const now = FieldValue.serverTimestamp();

  const docRef = await groupsCol(leagueId).add({
    leagueId,
    name,
    season,
    name_lc,
    season_lc,
    order, // 👈 persistimos order
    createdAt: now,
    updatedAt: now,
  });

  const snap = await docRef.get();
  return serialize<Group>({ id: snap.id, ...(snap.data() as any) });
}

export async function update(id: string, input: { leagueId: string; name: string; season: string; order?: number }) {
  const { leagueId, name, season } = input;
  const order = typeof input.order === "number" ? input.order : 0;

  if (await existsByNameAndSeason(leagueId, name, season, id)) {
    throw new Error("Ya existe un grupo con ese nombre en esa temporada en la liga");
  }

  const ref = groupsCol(leagueId).doc(id);
  await ref.update({
    name,
    season,
    name_lc: toLc(name),
    season_lc: toLc(season),
    order, // 👈 update order
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return serialize<Group>({ id: snap.id, ...(snap.data() as any) });
}

export async function remove(leagueId: string, id: string) {
  await groupsCol(leagueId).doc(id).delete();
  return { ok: true } as const;
}
