"use server";
import "server-only";

import { adminDb } from "@/server/admin/firebase-admin";

const teamsCol = (leagueId: string, groupId: string) =>
  adminDb.collection(`leagues/${leagueId}/groups/${groupId}/teams`);

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

type TeamBase = {
  name: string;
  municipality: string;
  stadium: string;
  venue: string;
  logoUrl?: string | null;
};

export type TeamCreateInput = TeamBase & {
  leagueId: string;
  groupId: string;
  delegateId?: string; // ✅ Multi-tenant
};

export type TeamUpdateInput = Partial<TeamBase> & {
  id: string;
  leagueId: string;
  groupId: string;
};

export type TeamRow = {
  id: string;
  name: string;
  municipality: string;
  stadium: string;
  venue: string;
  logoUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  name_lc: string;
  delegateId?: string;
};

// ========== API esperada por las actions ==========

// LIST
export async function list(leagueId: string, groupId: string): Promise<TeamRow[]> {
  const snap = await teamsCol(leagueId, groupId).orderBy("name_lc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TeamRow[];
}

// CREATE
export async function create(data: TeamCreateInput) {
  const name_lc = norm(data.name);

  const dup = await teamsCol(data.leagueId, data.groupId).where("name_lc", "==", name_lc).limit(1).get();
  if (!dup.empty) throw new Error("Ya existe un equipo con ese nombre en este grupo.");

  const ref = teamsCol(data.leagueId, data.groupId).doc();
  const now = new Date();

  const payload: Record<string, any> = {
    name: data.name,
    name_lc,
    municipality: data.municipality,
    stadium: data.stadium,
    venue: data.venue,
    logoUrl: data.logoUrl ?? null,
    createdAt: now,
    updatedAt: now,
  };

  // ✅ Guardar delegateId si está disponible
  if (data.delegateId) {
    payload.delegateId = data.delegateId;
  }

  await ref.set(payload);
  return { id: ref.id, ...payload };
}

// UPDATE
export async function update(data: TeamUpdateInput) {
  const ref = teamsCol(data.leagueId, data.groupId).doc(data.id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Equipo no encontrado.");

  // ⚠️ No permitir cambiar delegateId (ignorar si viene en data)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { delegateId: _ignoredDelegateId, ...safeData } = data as any;

  const updates: Record<string, any> = { updatedAt: new Date() };

  if (typeof safeData.name === "string") {
    updates.name = safeData.name;
    updates.name_lc = norm(safeData.name);
  }
  if (typeof safeData.municipality === "string") updates.municipality = safeData.municipality;
  if (typeof safeData.stadium === "string") updates.stadium = safeData.stadium;
  if (typeof safeData.venue === "string") updates.venue = safeData.venue;
  if (safeData.logoUrl !== undefined) updates.logoUrl = safeData.logoUrl ?? null;
  // ✅ delegateId se preserva del doc original (no se puede cambiar)

  await ref.update(updates);
  const after = await ref.get();
  return { id: data.id, ...(after.data() as any) };
}

// REMOVE
export async function remove(leagueId: string, groupId: string, id: string) {
  await teamsCol(leagueId, groupId).doc(id).delete();
  return { id };
}
