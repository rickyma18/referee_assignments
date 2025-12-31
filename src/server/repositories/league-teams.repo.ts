import { norm } from "@/domain/groups/group.normalizers"; // o donde tengas tu normalizador
import { adminDb } from "@/server/admin/firebase-admin";

// Helper: colección anidada por liga/grupo
const teamsCol = (leagueId: string, groupId: string) =>
  adminDb.collection(`leagues/${leagueId}/groups/${groupId}/teams`);

type TeamBase = {
  name: string;
  municipality: string;
  stadium: string;
  venue: string;
  logoUrl?: string;
};

export type TeamCreateInput = TeamBase & {
  leagueId: string;
  groupId: string;
};

export type TeamUpdateInput = Partial<TeamBase> & {
  id: string;
  leagueId: string;
  groupId: string;
};

export async function createTeam(data: TeamCreateInput & { delegateId?: string }) {
  const nameLc = norm(data.name);

  // ✅ data.leagueId ya existe en el tipo
  const dup = await teamsCol(data.leagueId, data.groupId).where("name_lc", "==", nameLc).limit(1).get();

  if (!dup.empty) {
    throw new Error("Ya existe un equipo con ese nombre en este grupo.");
  }

  const ref = teamsCol(data.leagueId, data.groupId).doc();

  const now = new Date();
  const payload: Record<string, any> = {
    name: data.name,
    name_lc: nameLc,
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

export async function updateTeam(data: TeamUpdateInput) {
  const ref = teamsCol(data.leagueId, data.groupId).doc(data.id);

  const snap = await ref.get();
  if (!snap.exists) throw new Error("Equipo no encontrado.");

  // ⚠️ No permitir cambiar delegateId (ignorar si viene en data)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { delegateId: _ignoredDelegateId, ...safeData } = data as any;

  const updates: Record<string, any> = {
    updatedAt: new Date(),
  };

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
  return { id: data.id, ...(await (await ref.get()).data()) };
}
