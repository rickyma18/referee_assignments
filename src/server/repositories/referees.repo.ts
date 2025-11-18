// src/server/repositories/referees.repo.ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import "@/server/admin/firebase-admin";
import { RefereeTierValues } from "@/domain/referees/referee-tier";
import { RefereeCreateZ, RefereeUpdateZ, RefereeZ, RefStatus, RefRole } from "@/domain/referees/referee.zod";
import { toPlain } from "@/lib/serialize"; // 👈 tu helper

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
  status?: "DISPONIBLE" | "DUDOSO" | "LESIONADO";
  category?: "TDP" | "LP";
  limit?: number;
  startAfterNameLc?: string;
  // 🔹 Nuevo: si quieres listar solo los que pueden evaluar (opcional)
  canAssessOnly?: boolean;
};

export async function create(input: unknown) {
  const data = RefereeCreateZ.parse(input);
  const name_lc = normalizeNameLc(data.name);

  const dup = await db.collection(COL).where("name_lc", "==", name_lc).limit(1).get();
  if (!dup.empty) {
    return { ok: false as const, message: "Ya existe un árbitro con ese nombre." };
  }

  const payload = {
    ...data, // incluye canAssess y tier
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

  const name_lc = rest.name ? normalizeNameLc(rest.name) : undefined;

  if (name_lc) {
    const dup = await db.collection(COL).where("name_lc", "==", name_lc).limit(1).get();
    if (!dup.empty && dup.docs[0].id !== id) {
      return { ok: false as const, message: "Ya existe un árbitro con ese nombre." };
    }
  }

  const patch = {
    ...rest, // incluye canAssess y tier
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

  // Valida con Zod (permite createdAt/updatedAt opcionales)
  const parsed = RefereeZ.parse(raw);

  // 🔥 Serializa a POJO (fechas => ISO)
  const plain = toPlain(parsed);

  // (Opcional) si tu form no usa estos campos, quítalos aquí:
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdAt, updatedAt, ...initialForForm } = plain;

  return initialForForm; // listo para pasarlo al Client Component
}

export async function remove(id: string) {
  await db.collection(COL).doc(id).delete();
  return { ok: true as const };
}

export async function setStatus(id: string, status: RefStatus) {
  await db.collection(COL).doc(id).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true as const };
}

/**
 * Cambia solo el tier del árbitro.
 * Usado por el board de drag & drop.
 */
export async function setTier(id: string, tier: RefTier) {
  await db.collection(COL).doc(id).set({ tier, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true as const };
}

export async function list(params: ListParams) {
  const { q, zones = [], roles = [], status, category, limit = 50, startAfterNameLc, canAssessOnly } = params;

  let query: FirebaseFirestore.Query = db.collection(COL);

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

// 🔹 Helper opcional (para pickers posteriores)
export async function listAssessorsSimple(search?: string) {
  const res = await list({ q: search, canAssessOnly: true, limit: 50 });
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
      // Borramos el campo para volver al comportamiento por defecto
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
