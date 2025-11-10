// src/server/auth/secure-action.ts

import { ForbiddenError } from "./errors"; // 👈 importa la clase desde el archivo sin "use server"
import { requireEditRole } from "./require-role";

type ActionResult<T = any> =
  | { ok: true; data?: T }
  | { ok: false; message?: string; fieldErrors?: Record<string, string | string[]> };

const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

export async function secureWrite<R>(fn: () => Promise<R>): Promise<ActionResult<R>> {
  try {
    await requireEditRole();
    const data = await fn();
    return { ok: true, data };
  } catch (e: unknown) {
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message };
    }
    return { ok: false, message: msg(e) };
  }
}
