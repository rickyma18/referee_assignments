// =============================
// src/server/actions/groups.actions.ts
// =============================
"use server";

import { revalidatePath } from "next/cache";

import { GroupCreateSchema, GroupUpdateSchema } from "@/domain/groups/group.zod";
import { secureWrite } from "@/server/auth/secure-action"; // 🔒 protege writes (Delegado / Superusuario)
import * as repo from "@/server/repositories/groups.repo";

// -------- Lecturas (sin restricción de rol) --------
export async function listGroupsAction(params: repo.GetAllParams) {
  return repo.getAll(params);
}

export async function getGroupAction(leagueId: string, id: string) {
  return repo.getById(leagueId, id);
}

// -------- Escrituras (protegidas con secureWrite) --------
export async function createGroupAction(input: unknown) {
  return secureWrite(async () => {
    const data = GroupCreateSchema.parse(input); // incluye 'order' opcional
    const created = await repo.create(data);
    revalidatePath(`/dashboard/leagues/${data.leagueId}/groups`);
    return created;
  });
}

export async function updateGroupAction(input: unknown) {
  return secureWrite(async () => {
    const data = GroupUpdateSchema.parse(input); // incluye 'order' opcional
    const { id, ...rest } = data;
    const updated = await repo.update(id, rest);
    revalidatePath(`/dashboard/leagues/${data.leagueId}/groups`);
    return updated;
  });
}

export async function deleteGroupAction(leagueId: string, id: string) {
  return secureWrite(async () => {
    const res = await repo.remove(leagueId, id);
    revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
    return res;
  });
}
