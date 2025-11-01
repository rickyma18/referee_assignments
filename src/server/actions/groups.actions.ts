// src/server/actions/groups.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { GroupCreateSchema, GroupUpdateSchema } from "@/domain/groups/group.zod";
import * as repo from "@/server/repositories/groups.admin.repo";

// (Opcional) función de autorización básica
async function assertCanWrite(role: string | null) {
  if (role !== "SUPERUSUARIO" && role !== "DELEGADO") {
    throw new Error("No autorizado");
  }
}

export async function listGroupsAction(params: repo.GetAllParams) {
  return repo.getAll(params);
}

export async function getGroupAction(id: unknown) {
  if (typeof id !== "string" || !id) throw new Error("ID inválido");
  return repo.getById(id);
}

export async function createGroupAction(input: unknown, role?: string | null) {
  await assertCanWrite(role ?? null); // pásalo desde el cliente si quieres
  const data = GroupCreateSchema.parse(input);
  const res = await repo.create(data);
  revalidatePath("/dashboard/groups");
  return res;
}

export async function updateGroupAction(input: unknown, role?: string | null) {
  await assertCanWrite(role ?? null);
  const data = GroupUpdateSchema.parse(input);
  const { id, ...rest } = data;
  const res = await repo.update(id, rest);
  revalidatePath("/dashboard/groups");
  return res;
}

export async function deleteGroupAction(id: string, role?: string | null) {
  await assertCanWrite(role ?? null);
  const res = await repo.remove(id);
  revalidatePath("/dashboard/groups");
  return res;
}
