// =====================================
// src/server/actions/teams-import.actions.ts
// =====================================
"use server";
import "server-only";

import { revalidatePath } from "next/cache"; // ⬅️ para revalidar al final

import { ZodError, z } from "zod";

import { normTeamName } from "@/domain/teams/team.normalizers";
import { adminDb, AdminFieldValue } from "@/server/admin/firebase-admin";
import { secureWrite } from "@/server/auth/secure-action";
import * as teamsRepo from "@/server/repositories/teams.repo";

type ActionResult<T = any> =
  | { ok: true; data?: T }
  | { ok: false; message?: string; fieldErrors?: Record<string, string | string[]> };

const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

const ImportRowSchema = z.object({
  name: z.string().trim().min(2, "Nombre requerido"),
  group: z.string().trim().optional(), // Nombre del grupo (opcional). Si no viene, se usa fallbackGroupId
  municipality: z.string().trim().optional().default(""),
  stadium: z.string().trim().optional().default(""),
  venue: z.string().trim().optional().default(""),
});

export type ImportRow = z.infer<typeof ImportRowSchema>;

export type ImportReport = {
  inserted: Array<{ id: string; name: string; groupId: string }>;
  updated: Array<{ id: string; name: string; groupId: string }>;
  rejected: Array<{ name: string; reason: string; group?: string }>;
  totals: { inserted: number; updated: number; rejected: number; received: number };
};

/** Busca el groupId por nombre dentro de la liga. */
async function resolveGroupIdByName(leagueId: string, groupName: string): Promise<string | null> {
  const name_lc = normTeamName(groupName);
  const q = await adminDb
    .collection("groups")
    .where("leagueId", "==", leagueId)
    .where("name_lc", "==", name_lc)
    .limit(1)
    .get();

  if (q.empty) return null;
  return q.docs[0].id;
}

/**
 * Importa equipos desde filas (CSV/Excel ya parseadas).
 * Política:
 *  - Si existe (name_lc, groupId): se ACTUALIZA (municipality/stadium/venue/logoUrl no se incluyen aquí).
 *  - Si no existe: se CREA.
 *  - Si el grupo por nombre no existe y tampoco hay fallback: se RECHAZA.
 */
export async function importTeamsAction(params: {
  leagueId: string;
  fallbackGroupId?: string; // groupId de la URL actual, si las filas no traen "group"
  rows: ImportRow[];
}): Promise<ActionResult<ImportReport>> {
  return secureWrite<ImportReport>(async () => {
    const { leagueId, fallbackGroupId, rows } = params;

    // Validación de entrada (lanza error para que secureWrite lo capture)
    if (!leagueId) throw new Error("leagueId requerido.");
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error("No hay filas para importar.");
    }

    const report: ImportReport = {
      inserted: [],
      updated: [],
      rejected: [],
      totals: { inserted: 0, updated: 0, rejected: 0, received: rows.length },
    };

    // Para revalidar solo lo necesario
    const touchedGroups = new Set<string>();

    // Procesamiento secuencial (claro y suficiente para imports normales)
    for (const raw of rows) {
      // Limpia/valida la fila
      let row: ImportRow;
      try {
        row = ImportRowSchema.parse(raw);
      } catch (e) {
        const reason =
          e instanceof ZodError ? Object.values(e.flatten().fieldErrors).flat().join(", ") : "Fila inválida";
        report.rejected.push({ name: raw?.name ?? "(sin nombre)", reason, group: raw?.group });
        continue;
      }

      // Determinar groupId
      let groupId = fallbackGroupId ?? null;
      if (row.group && row.group.trim().length > 0) {
        const resolved = await resolveGroupIdByName(leagueId, row.group);
        if (!resolved) {
          report.rejected.push({
            name: row.name,
            group: row.group,
            reason: `Grupo "${row.group}" no encontrado en la liga.`,
          });
          continue;
        }
        groupId = resolved;
      }
      if (!groupId) {
        report.rejected.push({
          name: row.name,
          reason: "No se pudo determinar el grupo (falta 'group' y no hay grupo por defecto).",
        });
        continue;
      }

      touchedGroups.add(groupId);

      // ¿Existe equipo con ese nombre en el grupo?
      const exists = await teamsRepo.existsByNameInGroup(row.name, groupId);
      const name_lc = normTeamName(row.name);

      if (exists) {
        // Actualiza campos de texto libre (no logo en import)
        const q = await adminDb
          .collection("teams")
          .where("groupId", "==", groupId)
          .where("name_lc", "==", name_lc)
          .limit(1)
          .get();

        if (q.empty) {
          report.rejected.push({
            name: row.name,
            group: row.group,
            reason: "Inconsistencia al actualizar (no se encontró el documento).",
          });
          continue;
        }

        const ref = q.docs[0].ref;
        const patch = {
          municipality: row.municipality ?? "",
          stadium: row.stadium ?? "",
          venue: row.venue ?? "",
          updatedAt: AdminFieldValue.serverTimestamp(),
        };
        await ref.update(patch);
        report.updated.push({ id: ref.id, name: row.name, groupId });
      } else {
        // Crear nuevo
        const payload = {
          name: row.name.trim(),
          name_lc,
          groupId,
          municipality: row.municipality ?? "",
          stadium: row.stadium ?? "",
          venue: row.venue ?? "",
          logoUrl: null,
          createdAt: AdminFieldValue.serverTimestamp(),
          updatedAt: AdminFieldValue.serverTimestamp(),
        };
        const ref = await adminDb.collection("teams").add(payload);
        report.inserted.push({ id: ref.id, name: row.name, groupId });
      }
    }

    report.totals.inserted = report.inserted.length;
    report.totals.updated = report.updated.length;
    report.totals.rejected = report.rejected.length;

    // 🔄 Revalidate de cada grupo tocado
    for (const gid of touchedGroups) {
      revalidatePath(`/dashboard/leagues/${leagueId}/groups/${gid}/teams`);
    }

    return report; // ⬅️ dato plano (secureWrite lo envolverá en { ok: true, data })
  });
}
