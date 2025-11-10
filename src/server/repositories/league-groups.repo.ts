import { GroupCreateSchema, GroupUpdateSchema } from "@/domain/groups/group.zod";
import { serialize } from "@/lib/serialize";
import { adminDb, AdminFieldValue } from "@/server/admin/firebase-admin";

const leaguesCol = () => adminDb.collection("leagues");
const groupsCol = (leagueId: string) => leaguesCol().doc(leagueId).collection("groups");

export async function list(leagueId: string) {
  const snaps = await groupsCol(leagueId).get();
  return snaps.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
}

export async function get(leagueId: string, id: string) {
  const snap = await groupsCol(leagueId).doc(id).get();
  return snap.exists ? { id: snap.id, ...serialize(snap.data()) } : null;
}

export async function create(input: unknown) {
  const data = GroupCreateSchema.parse(input);

  const nameLc = data.name.trim().toLowerCase();
  const seasonLc = data.season.trim().toLowerCase();

  // Duplicado por nombre+temporada en la misma liga
  const dup = await groupsCol(data.leagueId)
    .where("name_lc", "==", nameLc)
    .where("season_lc", "==", seasonLc)
    .limit(1)
    .get();

  if (!dup.empty) throw new Error("Ya existe un grupo con ese nombre en esta temporada de la liga.");

  const ref = groupsCol(data.leagueId).doc();
  await ref.set({
    name: data.name,
    name_lc: nameLc,
    season: data.season,
    season_lc: seasonLc,
    order: data.order ?? 0,
    createdAt: AdminFieldValue.serverTimestamp(),
    updatedAt: AdminFieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return { id: ref.id, ...serialize(snap.data()) };
}

export async function update(input: unknown) {
  const data = GroupUpdateSchema.parse(input);
  const ref = groupsCol(data.leagueId).doc(data.id);

  const payload = {
    name: data.name,
    name_lc: data.name.trim().toLowerCase(),
    season: data.season,
    season_lc: data.season.trim().toLowerCase(),
    order: data.order ?? 0,
    updatedAt: AdminFieldValue.serverTimestamp(),
  };

  await ref.update(payload);

  const snap = await ref.get();
  return { id: ref.id, ...serialize(snap.data()) };
}

export async function remove(leagueId: string, id: string) {
  await groupsCol(leagueId).doc(id).delete();
  return { ok: true };
}
