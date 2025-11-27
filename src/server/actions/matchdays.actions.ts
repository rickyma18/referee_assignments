"use server";
import "server-only";

import { revalidatePath } from "next/cache";

import { getFirestore } from "firebase-admin/firestore";
import { ZodError } from "zod";

import { MatchdayCreateSchema, MatchdayUpdateSchema, type MatchdayCreateInput } from "@/domain/matchdays/matchday.zod";
import { toPlain } from "@/lib/serialize";
import { getServerAuthUser } from "@/server/auth/get-server-auth-user";
import { secureWrite } from "@/server/auth/secure-action";
import * as repo from "@/server/repositories/matchdays.repo";
// --- Tipos de ActionResult ---
type FieldErrors = Record<string, string[]>;
type ActionResult<T = any> = { ok: true; data?: T } | { ok: false; message?: string; fieldErrors?: FieldErrors };

// --- Helpers ---
const zodFields = (e: unknown): FieldErrors | undefined => {
  if (!(e instanceof ZodError)) return undefined;
  const raw = e.flatten().fieldErrors; // Record<string, string[] | undefined>
  const entries = Object.entries(raw)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k, v]) => [k, v as string[]]);
  return Object.fromEntries(entries);
};

const msg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

function rvdList(leagueId: string, groupId: string) {
  revalidatePath(`/dashboard/leagues/${leagueId}/groups/${groupId}/matchdays`);
}

// --- Actions de lectura ---
export async function listMatchdaysAction(params: repo.GetAllParams) {
  // Asegura POJO + fechas en ISO ANTES de cruzar al cliente
  const rows = await repo.getAll(params);
  return toPlain(rows);
}

export async function getMatchdayAction(leagueId: string, groupId: string, id: string) {
  const row = await repo.getById(leagueId, groupId, id);
  return toPlain(row);
}

/**
 * Compatible con la página de Upload: retorna { ok, matchday: { id, number } }
 */
export async function getMatchdayByIdAction({
  leagueId,
  groupId,
  matchdayId,
}: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
}): Promise<
  | {
      ok: true;
      matchday: {
        id: string;
        number: number | null;
        startDate: string | null;
        endDate: string | null;
      };
    }
  | { ok: false; error: "not_found" | "unexpected" }
> {
  try {
    const row = await repo.getById(leagueId, groupId, matchdayId);
    if (!row) return { ok: false, error: "not_found" };

    // row ya viene con startDate/endDate serializables gracias al repo
    const plain = toPlain(row) as any;

    const number: number | null = typeof plain?.number === "number" ? plain.number : null;

    const startDate: string | null = typeof plain?.startDate === "string" ? plain.startDate : null;

    const endDate: string | null = typeof plain?.endDate === "string" ? plain.endDate : null;

    return {
      ok: true,
      matchday: {
        id: matchdayId,
        number,
        startDate,
        endDate,
      },
    };
  } catch (e) {
    console.error("[getMatchdayByIdAction] error:", e);
    return { ok: false, error: "unexpected" };
  }
}

export async function getNextMatchdayNumberAction(leagueId: string, groupId: string) {
  // Devuelve un número plano (no requiere serialize)
  return repo.getNextNumber(leagueId, groupId);
}

// --- Actions de escritura ---
export async function createMatchdayAction(input: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const data = MatchdayCreateSchema.parse(input);
    const auth = await getServerAuthUser().catch(() => null);

    const res = await repo.create({
      ...data,
      createdBy: auth?.uid ?? undefined,
    });

    rvdList(data.leagueId, data.groupId);
    // res tipa { id, number }. Si tu repo regresa fechas u objetos complejos, envuelve con toPlain(res).
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: msg(e), fieldErrors: zodFields(e) };
  }
}

export async function updateMatchdayAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const data = MatchdayUpdateSchema.parse(input);
    const res = await repo.update(data);
    rvdList(data.leagueId, data.groupId);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, message: msg(e), fieldErrors: zodFields(e) };
  }
}

export async function deleteMatchdayAction(leagueId: string, groupId: string, id: string): Promise<ActionResult> {
  try {
    await repo.remove(leagueId, groupId, id);
    rvdList(leagueId, groupId);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

type GenerateMatchdaysPayload = {
  leagueId: string;
  groupId: string;
  count: number;
  firstStartDate: Date;
  intervalDays: number;
  durationDays: number;
  startNumberOverride?: number | null;
};

type GenerateMatchdaysResult = {
  createdCount: number;
  skippedNumbers: number[];
  startNumber: number;
};

/**
 * Genera varias jornadas en lote para un grupo:
 * - Respeta los números ya existentes (no los pisa, los salta).
 * - Crea `count` jornadas consecutivas a partir de `startNumber`.
 * - Calcula fechas a partir de `firstStartDate` + `intervalDays`.
 */
export async function generateMatchdaysBulkAction(payload: GenerateMatchdaysPayload) {
  return secureWrite<GenerateMatchdaysResult>(async () => {
    const { leagueId, groupId, count, firstStartDate, intervalDays, durationDays, startNumberOverride } = payload;

    if (!leagueId || !groupId) {
      throw new Error("Faltan leagueId o groupId.");
    }
    if (!count || count <= 0) {
      throw new Error("La cantidad de jornadas debe ser mayor a 0.");
    }

    const db = getFirestore();
    const matchdaysCol = db
      .collection("leagues")
      .doc(leagueId)
      .collection("groups")
      .doc(groupId)
      .collection("matchdays");

    // Cargamos las jornadas existentes para no duplicar números
    const existingSnap = await matchdaysCol.get();
    const existingNumbers = new Set<number>();

    existingSnap.forEach((doc) => {
      const data = doc.data() as any;
      const n = Number(data.number ?? data.matchdayNumber ?? 0);
      if (!Number.isNaN(n) && n > 0) {
        existingNumbers.add(n);
      }
    });

    let startNumber: number;
    if (typeof startNumberOverride === "number" && startNumberOverride >= 1) {
      startNumber = startNumberOverride;
    } else {
      // Si no mandamos override: comienza en (max + 1) o 1 si no hay jornada
      const maxExisting = existingNumbers.size > 0 ? Math.max(...Array.from(existingNumbers)) : 0;
      startNumber = maxExisting + 1;
    }

    const firstDate = new Date(firstStartDate);
    if (Number.isNaN(firstDate.getTime())) {
      throw new Error("Fecha inicial inválida.");
    }

    const intDays = Math.max(1, intervalDays || 7);
    const durDays = Math.max(1, durationDays || 1);

    const dayMs = 24 * 60 * 60 * 1000;

    const batch = db.batch();
    let createdCount = 0;
    const skippedNumbers: number[] = [];

    for (let i = 0; i < count; i += 1) {
      const number = startNumber + i;

      if (existingNumbers.has(number)) {
        skippedNumbers.push(number);
        // no creamos nada para este número, pero seguimos con el siguiente
        // eslint-disable-next-line no-continue
        continue;
      }

      const startMs = firstDate.getTime() + i * intDays * dayMs;
      const startDate = new Date(startMs);
      const endDate = new Date(startMs + (durDays - 1) * dayMs + (dayMs - 1000)); // casi fin de día

      const now = new Date();
      const docRef = matchdaysCol.doc();

      batch.set(docRef, {
        number,
        startDate,
        endDate,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });

      createdCount += 1;
    }

    if (createdCount > 0) {
      await batch.commit();
    }

    return {
      createdCount,
      skippedNumbers,
      startNumber,
    };
  });
}
