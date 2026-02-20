// src/server/actions/assignments.actions.ts
/* eslint-disable max-lines, complexity */
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
  findSameDayConflicts,
  evaluateCentralRcs,
  type Conflict,
  type ScheduleConflict,
  type SameDayConflict,
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
        | "SAME_DAY_CONFLICT"
        | "RCS_BELOW_THRESHOLD_BLOCK"
        | "RCS_BELOW_THRESHOLD_WARNING"
        | "DUPLICATE_REFEREES";
      error: string;
      conflicts?: Conflict[];
      unavailableRefs?: string[];
      scheduleConflicts?: ScheduleConflict[];
      sameDayConflicts?: SameDayConflict[];
      rcsEvaluation?: RcsEvaluation;
    };

/**
 * Helper: regresa string (trim) o null.
 * - FormData.get() puede ser null (key ausente)
 * - Puede venir "" si el input se envió vacío
 * En ambos casos lo tratamos como null.
 */
function fdStringOrNull(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v === null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

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

    // ✅ FIX ESLint: evitar `|| null` (prefer-nullish-coalescing)
    const centralRefereeId = fdStringOrNull(formData, "centralRefereeId");
    const aa1RefereeId = fdStringOrNull(formData, "aa1RefereeId");
    const aa2RefereeId = fdStringOrNull(formData, "aa2RefereeId");

    const centralExternalLabel = fdStringOrNull(formData, "centralExternalLabel");
    const aa1ExternalLabel = fdStringOrNull(formData, "aa1ExternalLabel");
    const aa2ExternalLabel = fdStringOrNull(formData, "aa2ExternalLabel");

    const centralRefereeName = formData.get("centralRefereeName");
    const aa1RefereeName = formData.get("aa1RefereeName");
    const aa2RefereeName = formData.get("aa2RefereeName");

    // Fourth y Assessor son opcionales.
    // formData.get() devuelve null si la clave NO fue enviada (→ conservar en DB)
    // devuelve "" si fue enviada vacía (→ el usuario borró el campo)
    // devuelve "id" si fue enviada con valor (→ guardar)
    const fourthRawId = formData.get("fourthRefereeId");
    const fourthRawName = formData.get("fourthRefereeName");

    // ✅ FIX ESLint: evitar `String(..) || null`
    const fourthExternalLabel = fdStringOrNull(formData, "fourthExternalLabel");

    const assessorRawId = formData.get("assessorRefereeId");
    const assessorRawName = formData.get("assessorRefereeName");

    // ✅ FIX ESLint: evitar `String(..) || null`
    const assessorExternalLabel = fdStringOrNull(formData, "assessorExternalLabel");

    // Si quieres guardar quién asignó, puedes mandar userId en el formData
    const updatedBy = formData.get("userId") ? String(formData.get("userId")) : null;

    // Cada rol necesita ID real o ExternalLabel
    const hasCentral = centralRefereeId ?? centralExternalLabel;
    const hasAa1 = aa1RefereeId ?? aa1ExternalLabel;
    const hasAa2 = aa2RefereeId ?? aa2ExternalLabel;

    if (!leagueId || !groupId || !matchdayId || !matchId || !hasCentral || !hasAa1 || !hasAa2) {
      return {
        code: "MISSING_PARAMS",
        error: "Faltan parámetros obligatorios para asignar la terna.",
      };
    }

    // Duplicados: solo entre IDs reales (labels externos como "FORANEO" pueden repetirse)
    const coreRealIds = [centralRefereeId, aa1RefereeId, aa2RefereeId].filter(Boolean) as string[];
    const uniqueCoreIds = new Set(coreRealIds);
    if (uniqueCoreIds.size !== coreRealIds.length) {
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

    // 2) Validar que los árbitros con ID real existan y estén DISPONIBLES
    //    (los ext:* NO se validan — no son docs de Firestore)
    const unavailableRefs: string[] = [];
    const refsCol = db.collection("referees");

    async function isAvailable(id: string): Promise<boolean> {
      const snap = await refsCol.doc(id).get();
      if (!snap.exists) return false;
      const data = snap.data() as any;
      const status = (data?.status ?? "").toString().toUpperCase();
      return status === "DISPONIBLE";
    }

    if (centralRefereeId && !(await isAvailable(centralRefereeId))) unavailableRefs.push(centralRefereeId);
    if (aa1RefereeId && !(await isAvailable(aa1RefereeId))) unavailableRefs.push(aa1RefereeId);
    if (aa2RefereeId && !(await isAvailable(aa2RefereeId))) unavailableRefs.push(aa2RefereeId);

    if (unavailableRefs.length > 0) {
      return {
        code: "REFEREE_NOT_AVAILABLE",
        error: "Uno o más árbitros no están disponibles.",
        unavailableRefs,
      };
    }

    const ignoreRecentTeamConflicts = String(formData.get("ignoreRecentTeamConflicts") ?? "").toLowerCase() === "true";

    // IDs reales para validaciones (ext:* se excluyen)
    const realCentralId = centralRefereeId ?? "";
    const realAa1Id = aa1RefereeId ?? "";
    const realAa2Id = aa2RefereeId ?? "";
    const realFourthId = fourthRawId !== null ? (String(fourthRawId) ? String(fourthRawId) : null) : null;
    const realAssessorId = assessorRawId !== null ? (String(assessorRawId) ? String(assessorRawId) : null) : null;

    // 3) Regla de las últimas 4 jornadas (NO RA-XX) – solo IDs reales
    const conflicts = await findRecentTeamConflicts({
      leagueId,
      groupId,
      currentMatchdayNumber: matchdayNumber,
      homeTeamId,
      awayTeamId,
      centralRefereeId: realCentralId,
      aa1RefereeId: realAa1Id,
      aa2RefereeId: realAa2Id,
      currentMatchId: matchId,
    });

    if (conflicts.length > 0 && !ignoreRecentTeamConflicts) {
      return {
        code: "RECENT_TEAM_CONFLICT",
        error: "Conflicto: algún árbitro ya arbitró a este equipo en < 4 jornadas.",
        conflicts,
      };
    }

    // 4) Regla de choque de horario (Choque) – solo IDs reales
    if (kickoff) {
      const scheduleConflicts = await findScheduleConflicts({
        leagueId,
        matchId,
        kickoff,
        centralRefereeId: realCentralId,
        aa1RefereeId: realAa1Id,
        aa2RefereeId: realAa2Id,
      });

      if (scheduleConflicts.length > 0) {
        return {
          code: "SCHEDULE_CONFLICT",
          error: "Choque de horario: algún árbitro ya tiene otro partido en la misma fecha/hora.",
          scheduleConflicts,
        };
      }
    }

    // 4.5) Regla de "mismo día" (soft-block) – solo IDs reales
    if (kickoff) {
      const ignoreSameDayConflicts = String(formData.get("ignoreSameDayConflicts") ?? "").toLowerCase() === "true";
      const sameDayConflicts = await findSameDayConflicts({
        leagueId,
        matchId,
        kickoff,
        centralRefereeId: realCentralId,
        aa1RefereeId: realAa1Id,
        aa2RefereeId: realAa2Id,
        fourthRefereeId: realFourthId,
        assessorRefereeId: realAssessorId,
      });

      if (sameDayConflicts.length > 0 && !ignoreSameDayConflicts) {
        return {
          code: "SAME_DAY_CONFLICT",
          error: "Algún árbitro ya tiene otro partido asignado el mismo día.",
          sameDayConflicts,
        };
      }
    }

    // 5) Evaluar MDS vs RCS_central (bloqueo/advertencia según temporada)
    //    Solo si el central es un ID real (ext no tiene RCS)
    const rcsEvaluation = centralRefereeId
      ? await evaluateCentralRcs({
          leagueId,
          groupId,
          matchdayId,
          matchId,
          centralRefereeId,
        })
      : { mds: null, rcsCentral: null, tolerance: 0, policy: "NONE" as const, belowThreshold: false };

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
    // Lógica: si hay ID real → guardar ID, limpiar label. Si hay label → guardar label, limpiar ID.
    const updateData: Record<string, unknown> = {
      centralRefereeId: centralRefereeId ?? null,
      centralExternalLabel: centralRefereeId ? null : (centralExternalLabel ?? null),
      aa1RefereeId: aa1RefereeId ?? null,
      aa1ExternalLabel: aa1RefereeId ? null : (aa1ExternalLabel ?? null),
      aa2RefereeId: aa2RefereeId ?? null,
      aa2ExternalLabel: aa2RefereeId ? null : (aa2ExternalLabel ?? null),
      centralRefereeName: centralRefereeName
        ? String(centralRefereeName)
        : (centralExternalLabel ?? match.centralRefereeName ?? null),
      aa1RefereeName: aa1RefereeName ? String(aa1RefereeName) : (aa1ExternalLabel ?? match.aa1RefereeName ?? null),
      aa2RefereeName: aa2RefereeName ? String(aa2RefereeName) : (aa2ExternalLabel ?? match.aa2RefereeName ?? null),
      updatedAt: now,
      updatedBy,
    };

    // Fourth: solo tocar si el key fue enviado en el FormData
    // - fourthRawId === null  → clave ausente → no incluimos el campo (Firestore lo conserva)
    // - fourthRawId === ""    → usuario borró (o ext label) → revisar label
    // - fourthRawId === "id"  → usuario seleccionó → guardar id + limpiar label
    if (fourthRawId !== null) {
      const fourthId = fourthRawId ? String(fourthRawId) : null;
      updateData.fourthRefereeId = fourthId ?? null;
      updateData.fourthExternalLabel = fourthId ? null : (fourthExternalLabel ?? null);
      const hasAny = fourthId ?? fourthExternalLabel;
      updateData.fourthRefereeName = hasAny
        ? fourthId
          ? fourthRawName !== null
            ? String(fourthRawName)
              ? String(fourthRawName)
              : null
            : (match.fourthRefereeName ?? null)
          : (fourthExternalLabel ?? null)
        : null;
    }

    // Assessor: mismo patrón
    if (assessorRawId !== null) {
      const assessorId = assessorRawId ? String(assessorRawId) : null;
      updateData.assessorRefereeId = assessorId ?? null;
      updateData.assessorExternalLabel = assessorId ? null : (assessorExternalLabel ?? null);
      const hasAny = assessorId ?? assessorExternalLabel;
      updateData.assessorRefereeName = hasAny
        ? assessorId
          ? assessorRawName !== null
            ? String(assessorRawName)
              ? String(assessorRawName)
              : null
            : (match.assessorRefereeName ?? null)
          : (assessorExternalLabel ?? null)
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
