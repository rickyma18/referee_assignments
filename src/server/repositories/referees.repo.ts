// src/server/repositories/referees.repo.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { RefereeTierValues } from "@/domain/referees/referee-tier";
import { RefereeCreateZ, RefereeUpdateZ, RefereeZ, RefStatus, RefRole } from "@/domain/referees/referee.zod";
import { toPlain } from "@/lib/serialize";

const COL = "referees";
const db = getFirestore();

type RefTier = (typeof RefereeTierValues)[number];

function normalizeNameLc(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export type ListParams = {
  q?: string;
  zones?: string[];
  roles?: RefRole[];
  status?: "DISPONIBLE" | "LESIONADO" | "INACTIVO";
  category?: "TDP" | "LP";
  limit?: number;
  startAfterNameLc?: string;
  canAssessOnly?: boolean;

  // ✅ multi-tenant
  delegateId?: string;
};

export async function create(input: unknown) {
  const data = RefereeCreateZ.parse(input);
  const name_lc = normalizeNameLc(data.name);

  // ✅ delegateId debe venir del server action (inyectado)
  const delegateId = data.delegateId as string | undefined;
  if (!delegateId) {
    return { ok: false as const, message: "Falta delegateId (server)." };
  }

  // ✅ Check duplicado POR DELEGADO (no global)
  // Índice requerido: delegateId + name_lc
  const dup = await db
    .collection(COL)
    .where("delegateId", "==", delegateId)
    .where("name_lc", "==", name_lc)
    .limit(1)
    .get();
  if (!dup.empty) {
    return { ok: false as const, message: "Ya existe un árbitro con ese nombre." };
  }

  const payload = {
    ...data,
    delegateId, // ✅ guardado en Firestore
    name_lc,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection(COL).add(payload);
  const snap = await ref.get();
  return { ok: true as const, data: { id: ref.id, ...(snap.data() as any) } };
}

export async function update(input: unknown) {
  const data = RefereeUpdateZ.parse(input);
  const { id, ...rest } = data;

  // ⚠️ no queremos que cambien delegateId por update desde UI
  // pero si te llega en rest por algún motivo, lo ignoramos.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { delegateId: _ignoredDelegateId, ...safeRest } = rest;

  // Cargar el doc actual para obtener su delegateId (necesario para check unicidad)
  const currentSnap = await db.collection(COL).doc(id).get();
  if (!currentSnap.exists) {
    return { ok: false as const, message: "Árbitro no encontrado." };
  }
  const currentData = currentSnap.data() as any;
  const delegateId = currentData?.delegateId as string | undefined;

  const name_lc = safeRest.name ? normalizeNameLc(safeRest.name) : undefined;

  if (name_lc) {
    // ✅ Check duplicado POR DELEGADO (no global)
    // Índice requerido: delegateId + name_lc
    let dupQuery = db.collection(COL).where("name_lc", "==", name_lc);
    if (delegateId) {
      dupQuery = dupQuery.where("delegateId", "==", delegateId);
    }
    const dup = await dupQuery.limit(2).get();
    const hasDuplicate = dup.docs.some((d) => d.id !== id);
    if (hasDuplicate) {
      return { ok: false as const, message: "Ya existe un árbitro con ese nombre." };
    }
  }

  const patch = {
    ...safeRest,
    ...(name_lc ? { name_lc } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection(COL).doc(id).set(patch, { merge: true });
  const snap = await db.collection(COL).doc(id).get();
  return { ok: true as const, data: { id, ...(snap.data() as any) } };
}

export async function getById(id: string) {
  if (!id?.trim()) return null;

  const snap = await db.collection(COL).doc(id).get();
  if (!snap.exists) return null;

  const raw = { id: snap.id, ...(snap.data() as any) };

  // Valida con Zod
  const parsed = RefereeZ.parse(raw);

  // Serializa a POJO (fechas => ISO)
  const plain = toPlain(parsed);

  // (Opcional) si tu form no usa estos campos, quítalos aquí:
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdAt, updatedAt, ...initialForForm } = plain;

  return initialForForm;
}

export async function remove(id: string) {
  await db.collection(COL).doc(id).delete();
  return { ok: true as const };
}

export async function setStatus(id: string, status: RefStatus) {
  await db.collection(COL).doc(id).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true as const };
}

export async function setTier(id: string, tier: RefTier) {
  await db.collection(COL).doc(id).set({ tier, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true as const };
}

export async function list(params: ListParams) {
  const {
    q,
    zones = [],
    roles = [],
    status,
    category,
    limit = 50,
    startAfterNameLc,
    canAssessOnly,
    delegateId,
  } = params;

  let query: FirebaseFirestore.Query = db.collection(COL);

  // ✅ multi-tenant scope
  if (delegateId) query = query.where("delegateId", "==", delegateId);

  if (typeof canAssessOnly === "boolean") query = query.where("canAssess", "==", canAssessOnly);
  if (status) query = query.where("status", "==", status);
  if (category) query = query.where("category", "==", category);
  if (zones.length === 1) query = query.where("zones", "array-contains", zones[0]);
  if (roles.length === 1) query = query.where("rolesAllowed", "array-contains", roles[0]);

  if (q) {
    const needle = normalizeNameLc(q);
    query = query
      .orderBy("name_lc")
      .startAt(needle)
      .endAt(needle + "\uf8ff");
  } else {
    query = query.orderBy("name_lc");
  }

  if (startAfterNameLc) query = query.startAfter(startAfterNameLc);

  const snap = await query.limit(limit).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const nextCursor = items.length ? items[items.length - 1].name_lc : undefined;

  return { items, nextCursor };
}

// Helper opcional (para pickers)
export async function listAssessorsSimple(search?: string, delegateId?: string) {
  const res = await list({ q: search, canAssessOnly: true, limit: 50, delegateId });
  return res.items.map((r: any) => ({ id: r.id, name: r.name ?? "—" }));
}

export async function setRcsOverride(
  id: string,
  rcsOverrideCentral: number | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const patch: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (rcsOverrideCentral == null) {
      patch.rcsOverrideCentral = FieldValue.delete();
    } else {
      patch.rcsOverrideCentral = rcsOverrideCentral;
    }

    await db.collection(COL).doc(id).set(patch, { merge: true });

    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar override de RCS";
    return { ok: false as const, message: msg };
  }
}
