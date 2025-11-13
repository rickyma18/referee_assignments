"use server";
import "server-only";
import { RefereeCreateZ } from "@/domain/referees/referee.zod";
import { secureWrite } from "@/server/auth/secure-action";
import * as repo from "@/server/repositories/referees.repo";

export async function validateRefereesDryRun(rows: any[]) {
  // Devuelve shape { ok: boolean, rows: [{ errors: string[], normalized?: any }] }
  return { ok: true, rows: rows.map(() => ({ errors: [] })) };
}

export async function confirmRefereesImport({ rows }: { rows: any[] }) {
  return secureWrite(async () => {
    let created = 0;
    const errors: string[] = [];

    for (const r of rows) {
      try {
        const parsed = RefereeCreateZ.parse(r);
        const res = await repo.create(parsed);
        if (res.ok) created++;
        else errors.push(res.message ?? "Error desconocido");
      } catch (e: any) {
        errors.push(e?.message ?? "Error");
      }
    }
    return { ok: errors.length === 0, created, errors };
  });
}
