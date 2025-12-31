// =====================================
// src/server/repositories/matchdays.repo.ts
// =====================================
import { Timestamp } from "firebase-admin/firestore"; // úsalo directo de firebase-admin

import { type Matchday, type MatchdayCreateInput, type MatchdayUpdateInput } from "@/domain/matchdays/matchday.zod";
import { adminDb, AdminFieldValue } from "@/server/admin/firebase-admin";
// Si prefieres, también puedes re-exportar Timestamp en tu admin y traerlo de ahí.

const colPath = (leagueId: string, groupId: string) => `leagues/${leagueId}/groups/${groupId}/matchdays`;

export type GetAllParams = {
  leagueId: string;
  groupId: string;
  limit?: number;
};

export async function getAll(params: GetAllParams): Promise<Matchday[]> {
  const { leagueId, groupId, limit = 100 } = params;

  const snap = await adminDb.collection(colPath(leagueId, groupId)).orderBy("startDate", "asc").limit(limit).get();

  return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({
    id: d.id,
    ...(d.data() as Omit<Matchday, "id">),
  }));
}

export async function getById(leagueId: string, groupId: string, id: string): Promise<Matchday | null> {
  const ref = adminDb.doc(`leagues/${leagueId}/groups/${groupId}/matchdays/${id}`);
  const doc = await ref.get();
  if (!doc.exists) return null;

  const data = doc.data() as Omit<Matchday, "id">;

  // 🔹 Convierte los Firestore Timestamp a ISO (o a .getTime() si prefieres)
  const start =
    data.startDate && typeof (data.startDate as any).toDate === "function"
      ? (data.startDate as any).toDate().toISOString()
      : (data.startDate ?? null);

  const end =
    data.endDate && typeof (data.endDate as any).toDate === "function"
      ? (data.endDate as any).toDate().toISOString()
      : (data.endDate ?? null);

  return {
    id: doc.id,
    ...data,
    startDate: start,
    endDate: end,
  };
}

// Siguiente número autoincremental dentro del grupo
export async function getNextNumber(leagueId: string, groupId: string): Promise<number> {
  const snap = await adminDb.collection(colPath(leagueId, groupId)).orderBy("number", "desc").limit(1).get();

  if (snap.empty) return 1;
  const top = snap.docs[0].data() as { number?: number };
  return (top?.number ?? 0) + 1;
}

// Crear con transacción (unicidad de `number`)
export async function create(
  input: MatchdayCreateInput & { createdBy?: string; delegateId?: string },
): Promise<{ id: string; number: number }> {
  const { leagueId, groupId, startDate, endDate, createdBy, delegateId } = input;

  return await adminDb.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
    // 1) calcular siguiente número
    const nextNumberSnap = await tx.get(
      adminDb.collection(colPath(leagueId, groupId)).orderBy("number", "desc").limit(1),
    );

    const nextNumber = nextNumberSnap.empty
      ? 1
      : ((nextNumberSnap.docs[0].data() as { number?: number })?.number ?? 0) + 1;

    // 2) crear doc
    const ref = adminDb.collection(colPath(leagueId, groupId)).doc();
    const payload: Record<string, any> = {
      leagueId,
      groupId,
      number: nextNumber,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      status: "ACTIVE",
      createdBy: createdBy ?? null,
      createdAt: AdminFieldValue.serverTimestamp(),
      updatedAt: AdminFieldValue.serverTimestamp(),
    };

    // ✅ Guardar delegateId si está disponible (para consultas directas)
    if (delegateId) {
      payload.delegateId = delegateId;
    }

    tx.set(ref, payload);

    return { id: ref.id, number: nextNumber };
  });
}

export async function update(input: MatchdayUpdateInput): Promise<{ id: string }> {
  const { id, leagueId, groupId, startDate, endDate, status } = input;
  const ref = adminDb.doc(`${colPath(leagueId, groupId)}/${id}`);

  await ref.update({
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    ...(status ? { status } : {}),
    updatedAt: AdminFieldValue.serverTimestamp(),
  });

  return { id };
}

export async function remove(leagueId: string, groupId: string, id: string): Promise<{ id: string }> {
  const ref = adminDb.doc(`${colPath(leagueId, groupId)}/${id}`);
  await ref.delete();
  return { id };
}
