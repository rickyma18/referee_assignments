// =============================
// src/server/actions/groups.actions.ts
// =============================
"use server";

import { revalidatePath } from "next/cache";
import { GroupCreateSchema, GroupUpdateSchema } from "@/domain/groups/group.zod";
import * as repo from "@/server/repositories/groups.repo";

export async function listGroupsAction(params: repo.GetAllParams) {
  return repo.getAll(params);
}

export async function getGroupAction(leagueId: string, id: string) {
  return repo.getById(leagueId, id);
}

export async function createGroupAction(input: unknown) {
  const data = GroupCreateSchema.parse(input); // incluye 'order' opcional
  const res = await repo.create(data);
  revalidatePath(`/dashboard/leagues/${data.leagueId}/groups`);
  return res;
}

export async function updateGroupAction(input: unknown) {
  const data = GroupUpdateSchema.parse(input); // incluye 'order' opcional
  const { id, ...rest } = data;
  const res = await repo.update(id, rest);
  revalidatePath(`/dashboard/leagues/${data.leagueId}/groups`);
  return res;
}

export async function deleteGroupAction(leagueId: string, id: string) {
  const res = await repo.remove(leagueId, id);
  revalidatePath(`/dashboard/leagues/${leagueId}/groups`);
  return res;
}
