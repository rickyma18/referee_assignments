"use server";

import { adminDb, AdminFieldValue } from "@/server/admin/firebase-admin";
import { TeamCreateSchema, TeamUpdateSchema } from "@/domain/teams/team.zod";
import { serialize } from "@/lib/serialize";

const leaguesCol = () => adminDb.collection("leagues");
const groupsCol = (leagueId: string) => leaguesCol().doc(leagueId).collection("groups");
const teamsCol = (leagueId: string, groupId: string) => groupsCol(leagueId).doc(groupId).collection("teams");

export async function list(leagueId: string, groupId: string) {
  const snaps = await teamsCol(leagueId, groupId).get();
  return snaps.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
}

export async function get(leagueId: string, groupId: string, id: string) {
  const snap = await teamsCol(leagueId, groupId).doc(id).get();
  return snap.exists ? { id: snap.id, ...serialize(snap.data()) } : null;
}

export async function create(input: unknown) {
  const data = TeamCreateSchema.parse(input);

  const nameLc = data.name.trim().toLowerCase();

  // Validación: no duplicar nombre dentro del grupo
  const dup = await teamsCol(data.leagueId, data.groupId).where("name_lc", "==", nameLc).limit(1).get();

  if (!dup.empty) throw new Error("Ya existe un equipo con ese nombre en este grupo.");

  const ref = teamsCol(data.leagueId, data.groupId).doc();
  await ref.set({
    name: data.name,
    name_lc: nameLc,
    municipality: data.municipality ?? null,
    stadium: data.stadium ?? null,
    venue: data.venue ?? null,
    createdAt: AdminFieldValue.serverTimestamp(),
    updatedAt: AdminFieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  return { id: ref.id, ...serialize(snap.data()) };
}

export async function update(input: unknown) {
  const data = TeamUpdateSchema.parse(input);
  const ref = teamsCol(data.leagueId, data.groupId).doc(data.id);

  const payload = {
    name: data.name,
    name_lc: data.name.trim().toLowerCase(),
    municipality: data.municipality ?? null,
    stadium: data.stadium ?? null,
    venue: data.venue ?? null,
    updatedAt: AdminFieldValue.serverTimestamp(),
  };

  await ref.update(payload);

  const snap = await ref.get();
  return { id: ref.id, ...serialize(snap.data()) };
}

export async function remove(leagueId: string, groupId: string, id: string) {
  await teamsCol(leagueId, groupId).doc(id).delete();
  return { ok: true };
}
