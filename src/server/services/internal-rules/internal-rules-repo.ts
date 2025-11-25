"use server";
import "server-only";

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import "@/server/admin/firebase-admin";

import {
  InternalRuleInputZ,
  InternalRuleZ,
  type InternalRule,
  type InternalRuleInput,
} from "@/domain/referees/internal-rule.zod";

const db = getFirestore();

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Normaliza updatedAt para que sea serializable (string ISO) */
function normalizeUpdatedAt(raw: any): string | null {
  if (!raw) return null;

  // Timestamp de Firestore (admin)
  if (typeof raw.toDate === "function") {
    return raw.toDate().toISOString();
  }

  // Date normal
  if (raw instanceof Date) {
    return raw.toISOString();
  }

  // Cualquier otra cosa (por si algún día guardas string directo)
  try {
    return new Date(raw).toISOString();
  } catch {
    return String(raw);
  }
}

/** Ensambla un InternalRule a partir de lo guardado en Firestore */
function mapStoredToInternalRule(refereeId: string, id: string, stored: any): InternalRule {
  const updatedAt = normalizeUpdatedAt(stored.updatedAt);

  return InternalRuleZ.parse({
    id,
    refereeId,
    ...stored,
    updatedAt,
  });
}

/* ------------------------------------------------------------------ */
/* Listar reglas                                                      */
/* ------------------------------------------------------------------ */

/**
 * Lista todas las reglas internas de un árbitro.
 */
export async function listInternalRulesByReferee(refereeId: string): Promise<InternalRule[]> {
  const snap = await db
    .collection("referees")
    .doc(refereeId)
    .collection("internal_rules")
    .orderBy("updatedAt", "desc")
    .get();

  const items: InternalRule[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as any;

    try {
      const rule = mapStoredToInternalRule(refereeId, doc.id, data);
      items.push(rule);
    } catch {
      // Si hay basura vieja, simplemente la ignoramos por ahora
      // console.warn("[listInternalRulesByReferee] invalid rule", doc.id, err);
    }
  }

  return items;
}

/* ------------------------------------------------------------------ */
/* Crear regla                                                        */
/* ------------------------------------------------------------------ */

/**
 * Crea una nueva regla interna para un árbitro.
 */
export async function createInternalRuleForReferee(options: {
  refereeId: string;
  payload: unknown;
  updatedBy: string;
}): Promise<InternalRule> {
  const { refereeId, payload, updatedBy } = options;

  const parsed: InternalRuleInput = InternalRuleInputZ.parse(payload);

  const ref = db.collection("referees").doc(refereeId).collection("internal_rules").doc();

  const docData = {
    type: parsed.type,
    params: parsed.params,
    enabled: parsed.enabled,
    updatedBy,
    updatedAt: FieldValue.serverTimestamp(),
    // reason es string | null | undefined en el input; guardamos null si no hay
    reason: parsed.reason ?? null,
  };

  await ref.set(docData);

  const snap = await ref.get();
  const stored = snap.data() as any;

  return mapStoredToInternalRule(refereeId, ref.id, stored);
}

/* ------------------------------------------------------------------ */
/* Actualizar regla                                                   */
/* ------------------------------------------------------------------ */

/**
 * Actualiza parcialmente una regla existente.
 */
export async function updateInternalRuleForReferee(options: {
  refereeId: string;
  ruleId: string;
  payload: unknown;
  updatedBy: string;
}): Promise<InternalRule> {
  const { refereeId, ruleId, payload, updatedBy } = options;

  const parsed: InternalRuleInput = InternalRuleInputZ.parse(payload);

  const ref = db.collection("referees").doc(refereeId).collection("internal_rules").doc(ruleId);

  await ref.set(
    {
      type: parsed.type,
      params: parsed.params,
      enabled: parsed.enabled,
      updatedBy,
      updatedAt: FieldValue.serverTimestamp(),
      reason: parsed.reason ?? null,
    },
    { merge: true },
  );

  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("RULE_NOT_FOUND");
  }

  const stored = snap.data() as any;

  return mapStoredToInternalRule(refereeId, ruleId, stored);
}

/* ------------------------------------------------------------------ */
/* Toggle enabled                                                     */
/* ------------------------------------------------------------------ */

/**
 * Activa/desactiva una regla (toggle rápido).
 */
export async function toggleInternalRuleEnabled(options: {
  refereeId: string;
  ruleId: string;
  enabled: boolean;
  reason?: string;
  updatedBy: string;
}): Promise<InternalRule> {
  const { refereeId, ruleId, enabled, reason, updatedBy } = options;

  const ref = db.collection("referees").doc(refereeId).collection("internal_rules").doc(ruleId);

  await ref.update({
    enabled,
    updatedBy,
    updatedAt: FieldValue.serverTimestamp(),
    reason: reason ?? null,
  });

  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("RULE_NOT_FOUND");
  }

  const stored = snap.data() as any;

  return mapStoredToInternalRule(refereeId, ruleId, stored);
}

/* ------------------------------------------------------------------ */
/* Eliminar regla                                                     */
/* ------------------------------------------------------------------ */

/**
 * Elimina una regla interna.
 */
export async function deleteInternalRuleForReferee(options: { refereeId: string; ruleId: string }): Promise<void> {
  const { refereeId, ruleId } = options;

  const ref = db.collection("referees").doc(refereeId).collection("internal_rules").doc(ruleId);
  await ref.delete();
}
