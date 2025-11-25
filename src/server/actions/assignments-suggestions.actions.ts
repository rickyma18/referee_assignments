// src/server/actions/assignments-suggest.actions.ts
"use server";
import "server-only";

import { z, ZodError } from "zod";

import { suggestTernasForMatchesBalanced } from "@/server/services/assignments/terna-batch";
import type { SuggestedTerna, SuggestTernaForMatchParams } from "@/server/services/assignments/terna-types";

import { requireEditRole } from "../auth/require-role";

type ActionResult<T = any> = { ok: true; data?: T } | { ok: false; message?: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

const SuggestMatchesInputZ = z.object({
  matches: z
    .array(
      z.object({
        leagueId: z.string().min(1),
        groupId: z.string().min(1),
        matchdayId: z.string().min(1),
        matchId: z.string().min(1),
      }),
    )
    .min(1, "Debe haber al menos un partido para sugerir."),
});

export type SuggestMatchesInput = z.infer<typeof SuggestMatchesInputZ>;

/**
 * Genera sugerencias de ternas para una lista de partidos.
 *
 * Pensado para usarse desde el botón “Generar ternas sugeridas” en la UI.
 *
 * ⚠️ IMPORTANTE:
 * - NO guarda nada en Firestore.
 * - Solo puede ser llamado por usuarios con rol de edición (requireEditRole).
 * - Devuelve, por cada partido, el mismo shape que SuggestedTerna:
 *   {
 *     leagueId, groupId, matchdayId, matchId,
 *     centralRefereeId, aa1RefereeId, aa2RefereeId,
 *     hasSuggestion, reason, mds, rcsCentral, ...
 *   }
 *
 * Además:
 * - Intenta repartir a los árbitros dentro del lote de partidos
 *   evitando repetirlos hasta que sea necesario.
 * - No propone ternas para partidos que ya tienen terna en Firestore.
 */
export async function suggestAssignmentsForMatchesAction(rawInput: unknown): Promise<ActionResult<SuggestedTerna[]>> {
  try {
    await requireEditRole(); // 🔒 Sólo SUPERUSUARIO/DELEGADO (o lo que tengas en requireEditRole)

    const { matches } = SuggestMatchesInputZ.parse(rawInput);

    const params: SuggestTernaForMatchParams[] = matches;

    const results = await suggestTernasForMatchesBalanced(params);

    return { ok: true, data: results };
  } catch (e: any) {
    if (e instanceof ZodError) {
      return { ok: false, message: "Parámetros inválidos para generar sugerencias." };
    }

    if (e?.name === "ForbiddenError") {
      return { ok: false, message: e.message ?? "No tienes permisos para generar sugerencias." };
    }

    console.error("suggestAssignmentsForMatchesAction error:", e);
    return { ok: false, message: msg(e) };
  }
}
