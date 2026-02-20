// src/server/actions/assignments.actions.ts
"use server";
import "server-only";

import { updateTag } from "next/cache";

import { getFirestore } from "firebase-admin/firestore";

import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { assertCanEdit, assertLeagueBelongsToDelegate } from "@/server/auth/require-delegate-access";
import { secureWrite } from "@/server/auth/secure-action";
import {
  findRecentTeamConflicts,
  findScheduleConflicts,
  evaluateCentralRcs,
  type Conflict,
  type ScheduleConflict,
  type RcsEvaluation,
} from "@/server/services/assignments/validation";

// Este es el "payload" que va dentro de `res.data` del ActionResult
export type AssignManualTernaData =
  | {
      code: "OK";
      rcsEvaluation?: RcsEvaluation;
    }
  | {
      code:
        | "MISSING_PARAMS"
        | "MATCH_NOT_FOUND"
        | "REFEREE_NOT_AVAILABLE"
        | "RECENT_TEAM_CONFLICT"
        | "SCHEDULE_CONFLICT"
        | "RCS_BELOW_THRESHOLD_BLOCK"
        | "RCS_BELOW_THRESHOLD_WARNING"
        | "DUPLICATE_REFEREES"; // 👈 NUEVO
      error: string;
      conflicts?: Conflict[];
      unavailableRefs?: string[];
      scheduleConflicts?: ScheduleConflict[];
      rcsEvaluation?: RcsEvaluation;
    };

/**
 * Acción para asignar terna MANUALMENTE a un partido.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO pueden asignar
 * - Valida que la league pertenezca al delegado actual
 *
 * - Aplica:
 *    - Regla de "no repetir equipo en últimas 4 jornadas" (bloqueo duro).
 *    - Regla de "Choque de horario" (bloqueo duro).
 *    - Evaluación MDS vs RCS_central (bloqueo o advertencia según temporada).
 * - NO aplica las reglas internas RA-XX (municipios, equipos, etc.).
 *
 * Devuelve un ActionResult<AssignManualTernaData>, es decir:
 * - res.ok        -> éxito de la acción (no explotó, pasó secureWrite)
 * - res.message   -> mensaje genérico si secureWrite falla
 * - res.data      -> { code: "...", error?, ... }
 */
export async function assignManualTernaAction(formData: FormData) {
  return secureWrite<AssignManualTernaData>(async () => {
    // ✅ Validar permisos multi-tenant
    const ctx = await getDelegateContext();
    assertCanEdit(ctx);

    const leagueId = String(formData.get("leagueId") ?? "");
    const groupId = String(formData.get("groupId") ?? "");
    const matchdayId = String(formData.get("matchdayId") ?? "");
    const matchId = String(formData.get("matchId") ?? "");

    const centralRefereeId = String(formData.get("centralRefereeId") ?? "");
    const aa1RefereeId = String(formData.get("aa1RefereeId") ?? "");
    const aa2RefereeId = String(formData.get("aa2RefereeId") ?? "");

    const centralRefereeName = formData.get("centralRefereeName");
    const aa1RefereeName = formData.get("aa1RefereeName");
    const aa2RefereeName = formData.get("aa2RefereeName");

    // Fourth y Assessor son opcionales.
    // formData.get() devuelve null si la clave NO fue enviada (→ conservar en DB)
    // devuelve "" si fue enviada vacía (→ el usuario borró el campo)
    // devuelve "id" si fue enviada con valor (→ guardar)
    const fourthRawId = formData.get("fourthRefereeId");
    const fourthRawName = formData.get("fourthRefereeName");
    const assessorRawId = formData.get("assessorRefereeId");
    const assessorRawName = formData.get("assessorRefereeName");

    // Si quieres guardar quién asignó, puedes mandar userId en el formData
    const updatedBy = formData.get("userId") ? String(formData.get("userId")) : null;

    if (!leagueId || !groupId || !matchdayId || !matchId || !centralRefereeId || !aa1RefereeId || !aa2RefereeId) {
      return {
        code: "MISSING_PARAMS",
        error: "Faltan parámetros obligatorios para asignar la terna.",
      };
    }

    if (centralRefereeId === aa1RefereeId || centralRefereeId === aa2RefereeId || aa1RefereeId === aa2RefereeId) {
      return {
        code: "DUPLICATE_REFEREES",
        error: "Un árbitro no puede repetirse como central y asistente en la misma terna.",
      };
    }

    const db = getFirestore();

    // 1) Cargar partido
    const matchRef = db
      .collection("leagues")
      .doc(leagueId)
      .collection("groups")
      .doc(groupId)
      .collection("matchdays")
      .doc(matchdayId)
      .collection("matches")
      .doc(matchId);

    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return {
        code: "MATCH_NOT_FOUND",
        error: "Partido no encontrado.",
      };
    }

    const match = matchSnap.data() as any;

    // ✅ Validar ownership usando leagueId REAL del documento (no del formData)
    const realLeagueId = match.leagueId as string | undefined;
    if (!realLeagueId) {
      return {
        code: "MATCH_NOT_FOUND",
        error: "Partido sin leagueId asociado.",
      };
    }
    await assertLeagueBelongsToDelegate(realLeagueId, ctx);

    const matchdayNumber: number = match.matchdayNumber ?? 0;
    const homeTeamId: string = match.homeTeamId;
    const awayTeamId: string = match.awayTeamId;

    // Kickoff como Date para chequeo de choques
    const kickoffRaw = match.kickoff ?? null;
    let kickoff: Date | null = null;
    if (kickoffRaw instanceof Date) {
      kickoff = kickoffRaw;
    } else if (kickoffRaw?.toDate) {
      try {
        kickoff = kickoffRaw.toDate();
      } catch {
        kickoff = null;
      }
    }

    // 2) Validar que los árbitros existan y estén DISPONIBLES
    const unavailableRefs: string[] = [];
    const refsCol = db.collection("referees");

    async function isAvailable(id: string): Promise<boolean> {
      const snap = await refsCol.doc(id).get();
      if (!snap.exists) return false;
      const data = snap.data() as any;
      const status = (data?.status ?? "").toString().toUpperCase();
      return status === "DISPONIBLE";
    }

    if (!(await isAvailable(centralRefereeId))) unavailableRefs.push(centralRefereeId);
    if (!(await isAvailable(aa1RefereeId))) unavailableRefs.push(aa1RefereeId);
    if (!(await isAvailable(aa2RefereeId))) unavailableRefs.push(aa2RefereeId);

    if (unavailableRefs.length > 0) {
      return {
        code: "REFEREE_NOT_AVAILABLE",
        error: "Uno o más árbitros no están disponibles.",
        unavailableRefs,
      };
    }

    const ignoreRecentTeamConflicts = String(formData.get("ignoreRecentTeamConflicts") ?? "").toLowerCase() === "true";

    // 3) Regla de las últimas 4 jornadas (NO RA-XX)
    const conflicts = await findRecentTeamConflicts({
      leagueId,
      groupId,
      currentMatchdayNumber: matchdayNumber,
      homeTeamId,
      awayTeamId,
      centralRefereeId,
      aa1RefereeId,
      aa2RefereeId,
      currentMatchId: matchId,
    });

    if (conflicts.length > 0 && !ignoreRecentTeamConflicts) {
      return {
        code: "RECENT_TEAM_CONFLICT",
        error: "Conflicto: algún árbitro ya arbitró a este equipo en < 4 jornadas.",
        conflicts,
      };
    }

    // 4) Regla de choque de horario (Choque) – esta sigue siendo bloqueo duro
    if (kickoff) {
      const scheduleConflicts = await findScheduleConflicts({
        leagueId,
        matchId,
        kickoff,
        centralRefereeId,
        aa1RefereeId,
        aa2RefereeId,
      });

      if (scheduleConflicts.length > 0) {
        return {
          code: "SCHEDULE_CONFLICT",
          error: "Choque de horario: algún árbitro ya tiene otro partido en la misma fecha/hora.",
          scheduleConflicts,
        };
      }
    }

    // 5) Evaluar MDS vs RCS_central (bloqueo/advertencia según temporada)
    const rcsEvaluation = await evaluateCentralRcs({
      leagueId,
      groupId,
      matchdayId,
      matchId,
      centralRefereeId,
    });

    if (rcsEvaluation.belowThreshold && rcsEvaluation.policy === "BLOCK") {
      // Bloqueo duro por parámetro de temporada
      return {
        code: "RCS_BELOW_THRESHOLD_BLOCK",
        error:
          "El RCS del central está por debajo del mínimo permitido para este partido (bloqueo por configuración de temporada).",
        rcsEvaluation,
      };
    }

    // 6) Si todo bien (o solo advertencia), actualizamos el partido con la terna
    const now = new Date();

    // Construimos el payload base (central/aa1/aa2 siempre se actualizan)
    const updateData: Record<string, unknown> = {
      centralRefereeId,
      aa1RefereeId,
      aa2RefereeId,
      centralRefereeName: centralRefereeName ? String(centralRefereeName) : (match.centralRefereeName ?? null),
      aa1RefereeName: aa1RefereeName ? String(aa1RefereeName) : (match.aa1RefereeName ?? null),
      aa2RefereeName: aa2RefereeName ? String(aa2RefereeName) : (match.aa2RefereeName ?? null),
      updatedAt: now,
      updatedBy,
    };

    // Fourth: solo tocar si el key fue enviado en el FormData
    // - fourthRawId === null  → clave ausente → no incluimos el campo (Firestore lo conserva)
    // - fourthRawId === ""    → usuario borró → guardar null + limpiar label y nombre
    // - fourthRawId === "id"  → usuario seleccionó → guardar id + limpiar label
    if (fourthRawId !== null) {
      const fourthRefereeId = String(fourthRawId) || null;
      updateData.fourthRefereeId = fourthRefereeId;
      updateData.fourthExternalLabel = null; // este flujo solo usa IDs
      updateData.fourthRefereeName = fourthRefereeId
        ? fourthRawName !== null
          ? String(fourthRawName) || null
          : (match.fourthRefereeName ?? null)
        : null; // si se borró el árbitro, también se limpia el nombre
    }

    // Assessor: mismo patrón
    if (assessorRawId !== null) {
      const assessorRefereeId = String(assessorRawId) || null;
      updateData.assessorRefereeId = assessorRefereeId;
      updateData.assessorExternalLabel = null;
      updateData.assessorRefereeName = assessorRefereeId
        ? assessorRawName !== null
          ? String(assessorRawName) || null
          : (match.assessorRefereeName ?? null)
        : null;
    }

    await matchRef.update(updateData);

    // ✅ Invalidar cache de assignments para que router.refresh reciba datos frescos
    const delegateKey = ctx.effectiveDelegateId ?? "global";
    updateTag(`assignments:${delegateKey}`);

    // 7) Respuesta lógica de la asignación
    if (rcsEvaluation.belowThreshold && rcsEvaluation.policy === "WARN") {
      return {
        code: "RCS_BELOW_THRESHOLD_WARNING",
        error: "Advertencia: el RCS del central está por debajo del MDS recomendado para este partido.",
        rcsEvaluation,
      };
    }

    // Sin problemas
    return {
      code: "OK",
      rcsEvaluation,
    };
  });
}

/**
 * ✔ Acción para confirmar en lote las ternas sugeridas / editadas desde la tabla.
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO pueden confirmar
 * - Valida que TODAS las leagues pertenezcan al delegado actual
 *
 * - Recibe la lista de partidos con la terna que está actualmente en el UI.
 * - SOLO hace update de central/aa1/aa2 + nombres + updatedAt/updatedBy.
 * - No borra campos extra del partido.
 */
export async function confirmSuggestedAssignmentsAction(payload: {
  matches: {
    leagueId: string;
    groupId: string;
    matchdayId: string;
    matchId: string;
    centralRefereeId?: string | null;
    centralExternalLabel?: string | null;
    aa1RefereeId?: string | null;
    aa1ExternalLabel?: string | null;
    aa2RefereeId?: string | null;
    aa2ExternalLabel?: string | null;
    centralRefereeName?: string | null;
    aa1RefereeName?: string | null;
    aa2RefereeName?: string | null;
    // Nombres y IDs opcionales para 4to y Asesor
    fourthRefereeId?: string | null;
    fourthExternalLabel?: string | null;
    assessorRefereeId?: string | null;
    assessorExternalLabel?: string | null;
    fourthRefereeName?: string | null;
    assessorRefereeName?: string | null;
  }[];
  userId?: string | null;
}) {
  return secureWrite<{ updatedCount: number }>(async () => {
    // ✅ Validar permisos multi-tenant
    const ctx = await getDelegateContext();
    assertCanEdit(ctx);

    const { matches, userId } = payload;

    if (!matches || matches.length === 0) {
      return { updatedCount: 0 };
    }

    // ✅ Validar ownership de TODAS las leagues involucradas
    const uniqueLeagueIds = [...new Set(matches.map((m) => m.leagueId).filter(Boolean))];
    for (const leagueId of uniqueLeagueIds) {
      await assertLeagueBelongsToDelegate(leagueId, ctx);
    }

    const db = getFirestore();
    const batch = db.batch();
    const now = new Date();

    let updatedCount = 0;

    for (const m of matches) {
      // Validaciones mínimas
      if (!m.leagueId || !m.groupId || !m.matchdayId || !m.matchId) continue;

      // Central/AA1/AA2 requeridos (ID o ExternalLabel)
      const hasCentral = m.centralRefereeId ?? m.centralExternalLabel;
      const hasAa1 = m.aa1RefereeId ?? m.aa1ExternalLabel;
      const hasAa2 = m.aa2RefereeId ?? m.aa2ExternalLabel;

      if (!hasCentral || !hasAa1 || !hasAa2) continue;

      // Evitar ternas con árbitros duplicados (solo entre IDs reales)
      // Si son etiquetas externas, no validamos duplicidad (pueden ser "FORANEO" repetido)
      const ids = [m.centralRefereeId, m.aa1RefereeId, m.aa2RefereeId].filter(Boolean) as string[];
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        continue;
      }

      const matchRef = db
        .collection("leagues")
        .doc(m.leagueId)
        .collection("groups")
        .doc(m.groupId)
        .collection("matchdays")
        .doc(m.matchdayId)
        .collection("matches")
        .doc(m.matchId);

      // Lógica de limpieza: Si hay ID, label=undefined (se borra). Si hay Label, ID=null (se borra).
      // PERO al actualizar en Firestore, undefined se ignora, null borra.
      // Así que explícitamente mandamos null si no aplica.

      batch.update(matchRef, {
        centralRefereeId: m.centralRefereeId ?? null,
        centralExternalLabel: m.centralRefereeId ? null : (m.centralExternalLabel ?? null),

        aa1RefereeId: m.aa1RefereeId ?? null,
        aa1ExternalLabel: m.aa1RefereeId ? null : (m.aa1ExternalLabel ?? null),

        aa2RefereeId: m.aa2RefereeId ?? null,
        aa2ExternalLabel: m.aa2RefereeId ? null : (m.aa2ExternalLabel ?? null),

        centralRefereeName: m.centralRefereeName ?? null,
        aa1RefereeName: m.aa1RefereeName ?? null,
        aa2RefereeName: m.aa2RefereeName ?? null,

        // 4to y Asesor (opcionales)
        fourthRefereeId: m.fourthRefereeId ?? null,
        fourthExternalLabel: m.fourthRefereeId ? null : (m.fourthExternalLabel ?? null),

        assessorRefereeId: m.assessorRefereeId ?? null,
        assessorExternalLabel: m.assessorRefereeId ? null : (m.assessorExternalLabel ?? null),

        fourthRefereeName: m.fourthRefereeName ?? null,
        assessorRefereeName: m.assessorRefereeName ?? null,

        updatedAt: now,
        updatedBy: userId ?? null,
      });

      updatedCount += 1;
    }

    if (updatedCount === 0) {
      return { updatedCount: 0 };
    }

    await batch.commit();

    // ✅ Invalidar cache de assignments para que router.refresh reciba datos frescos
    const delegateKey = ctx.effectiveDelegateId ?? "global";
    updateTag(`assignments:${delegateKey}`);

    return { updatedCount };
  });
}
