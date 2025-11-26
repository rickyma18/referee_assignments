"use server";
import "server-only";

import { z } from "zod";

import { InternalRuleInputZ, type InternalRule } from "@/domain/referees/internal-rule.zod";
import { requireSuperuser } from "@/server/auth/require-role";
import {
  listInternalRulesByReferee,
  createInternalRuleForReferee,
  updateInternalRuleForReferee,
  deleteInternalRuleForReferee,
  toggleInternalRuleEnabled,
} from "@/server/services/internal-rules/internal-rules-repo";

type ActionResult<T = any> = { ok: true; data: T } | { ok: false; message: string };

const WithRefereeZ = z.object({
  refereeId: z.string().min(1),
});

const WithRuleZ = WithRefereeZ.extend({
  ruleId: z.string().min(1),
});

/**
 * Lista reglas internas de un árbitro.
 */
export async function listInternalRulesAction(input: unknown): Promise<ActionResult<InternalRule[]>> {
  await requireSuperuser();

  const parsed = WithRefereeZ.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Parámetros inválidos." };
  }

  try {
    const rules = await listInternalRulesByReferee(parsed.data.refereeId);
    return { ok: true, data: rules };
  } catch (e: any) {
    console.error("[listInternalRulesAction]", e);
    return { ok: false, message: "Error al cargar reglas internas." };
  }
}

/**
 * Crea una nueva regla RA-XX para un árbitro.
 */
export async function createInternalRuleAction(input: unknown): Promise<ActionResult<InternalRule>> {
  const { uid } = await requireSuperuser();

  const parsed = WithRefereeZ.extend({ rule: InternalRuleInputZ }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }

  try {
    const rule = await createInternalRuleForReferee({
      refereeId: parsed.data.refereeId,
      payload: parsed.data.rule,
      updatedBy: uid,
    });

    return { ok: true, data: rule };
  } catch (e: any) {
    console.error("[createInternalRuleAction]", e);
    return { ok: false, message: "No se pudo crear la regla." };
  }
}

/**
 * Actualiza una regla interna existente.
 */
export async function updateInternalRuleAction(input: unknown): Promise<ActionResult<InternalRule>> {
  const { uid } = await requireSuperuser();

  const schema = WithRuleZ.extend({ rule: InternalRuleInputZ });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }

  try {
    const rule = await updateInternalRuleForReferee({
      refereeId: parsed.data.refereeId,
      ruleId: parsed.data.ruleId,
      payload: parsed.data.rule,
      updatedBy: uid,
    });

    return { ok: true, data: rule };
  } catch (e: any) {
    console.error("[updateInternalRuleAction]", e);
    return { ok: false, message: "No se pudo actualizar la regla." };
  }
}

/**
 * Activa / desactiva una regla (toggle rápido desde UI).
 */
export async function toggleInternalRuleEnabledAction(input: unknown): Promise<ActionResult<InternalRule>> {
  const { uid } = await requireSuperuser();

  const schema = WithRuleZ.extend({
    enabled: z.boolean(),
    reason: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors[0]?.message ?? "Datos inválidos." };
  }

  try {
    const rule = await toggleInternalRuleEnabled({
      refereeId: parsed.data.refereeId,
      ruleId: parsed.data.ruleId,
      enabled: parsed.data.enabled,
      reason: parsed.data.reason,
      updatedBy: uid,
    });

    return { ok: true, data: rule };
  } catch (e: any) {
    console.error("[toggleInternalRuleEnabledAction]", e);
    return { ok: false, message: "No se pudo cambiar el estado de la regla." };
  }
}

/**
 * Elimina una regla.
 */
export async function deleteInternalRuleAction(input: unknown): Promise<ActionResult<null>> {
  await requireSuperuser();

  const parsed = WithRuleZ.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Parámetros inválidos." };
  }

  try {
    await deleteInternalRuleForReferee({
      refereeId: parsed.data.refereeId,
      ruleId: parsed.data.ruleId,
    });

    return { ok: true, data: null };
  } catch (e: any) {
    console.error("[deleteInternalRuleAction]", e);
    return { ok: false, message: "No se pudo eliminar la regla." };
  }
}
