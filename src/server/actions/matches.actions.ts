"use server";
import "server-only";
import { getFirestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";

import { getDelegateContext } from "@/server/auth/get-delegate-context";
import {
  assertLeagueBelongsToDelegate,
  assertEffectiveDelegateId,
  assertCanEdit,
} from "@/server/auth/require-delegate-access";

/* ---------------------------------------------------------
 * CREAR PARTIDO
 * --------------------------------------------------------- */
type CreateMatchParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchdayNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  venueId: string;
  venueName: string;
  homeTeamName: string;
  awayTeamName: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
  userId: string;

  // 🔹 Nuevo opcional
  assessors?: string[];
};

async function validateAssessors(ids?: string[]) {
  if (!ids || ids.length === 0) return [];
  const db = getFirestore();
  const snaps = await Promise.all(ids.map((id) => db.collection("referees").doc(id).get()));
  const missing = snaps.filter((s) => !s.exists).map((_, i) => ids[i]);
  if (missing.length) throw new Error(`Asesores inexistentes: ${missing.join(", ")}`);
  const invalid = snaps.map((s, i) => ({ id: ids[i], data: s.data() as any })).filter((x) => !x.data?.canAssess);
  if (invalid.length) throw new Error(`No habilitados como asesor: ${invalid.map((x) => x.id).join(", ")}`);
  return ids;
}

export async function createMatchAction(p: CreateMatchParams) {
  // ✅ Validar permisos y obtener delegateId
  const ctx = await getDelegateContext();
  assertCanEdit(ctx);
  const delegateId = assertEffectiveDelegateId(ctx);

  if (p.homeTeamId === p.awayTeamId) throw new Error("Local y Visitante no pueden ser iguales.");

  const kickoff = DateTime.fromISO(`${p.fecha}T${p.hora}`, { zone: "America/Mexico_City" });
  if (!kickoff.isValid) throw new Error("Fecha/Hora inválidas.");

  const db = getFirestore();
  const coll = db
    .collection("leagues")
    .doc(p.leagueId)
    .collection("groups")
    .doc(p.groupId)
    .collection("matchdays")
    .doc(p.matchdayId)
    .collection("matches");

  // 🔹 Leer municipio desde /teams/{homeTeamId}
  let municipality: string | null = null;
  try {
    const teamSnap = await db.collection("teams").doc(p.homeTeamId).get();
    if (teamSnap.exists) {
      const t = teamSnap.data() as any;
      if (typeof t?.municipality === "string" && t.municipality.trim()) {
        municipality = t.municipality.trim();
      }
    }
  } catch (err) {
    console.error("[createMatchAction] Error leyendo municipio de /teams:", err);
  }

  const dup = await coll
    .where("homeTeamId", "==", p.homeTeamId)
    .where("awayTeamId", "==", p.awayTeamId)
    .where("kickoff", "==", kickoff.toJSDate())
    .limit(1)
    .get();
  if (!dup.empty) throw new Error("Duplicado: ya existe un partido con mismos equipos y horario.");

  const now = new Date();
  const assessors = await validateAssessors(p.assessors);

  await coll.add({
    leagueId: p.leagueId,
    groupId: p.groupId,
    matchdayId: p.matchdayId,
    matchdayNumber: p.matchdayNumber,
    homeTeamId: p.homeTeamId,
    awayTeamId: p.awayTeamId,
    homeTeamName: p.homeTeamName,
    awayTeamName: p.awayTeamName,
    venueId: p.venueId,
    venueName: p.venueName,
    kickoff: kickoff.toJSDate(),
    status: "scheduled",
    source: "manual",
    createdBy: p.userId,
    createdAt: now,
    updatedAt: now,

    // 👇 campo que usan las RA_municipios_*
    municipality,

    // 🔹 Nuevo
    assessors,

    // ✅ Multi-tenant: guardar delegateId para consultas directas
    delegateId,
  });

  return { ok: true };
}

/* ---------------------------------------------------------
 * OBTENER PARTIDO POR ID
 * --------------------------------------------------------- */

/**
 * Obtiene un partido por id.
 *
 * Seguridad multi-tenant:
 * - Valida acceso a la league padre
 *
 * @param p.activeDelegateId - Para SUPER, el delegado seleccionado en UI
 */
export async function getMatchByIdAction(p: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchId: string;
  activeDelegateId?: string | null;
}) {
  const ctx = await getDelegateContext({ activeDelegateId: p.activeDelegateId });

  // Validar acceso a la league
  try {
    await assertLeagueBelongsToDelegate(p.leagueId, ctx);
  } catch {
    return { ok: false, error: "No tienes acceso a este partido." };
  }

  const db = getFirestore();
  const ref = db
    .collection("leagues")
    .doc(p.leagueId)
    .collection("groups")
    .doc(p.groupId)
    .collection("matchdays")
    .doc(p.matchdayId)
    .collection("matches")
    .doc(p.matchId);

  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "No existe el partido." };

  const data = snap.data()!;
  return {
    ok: true,
    match: {
      id: snap.id,
      ...data,
    },
  };
}

/* ---------------------------------------------------------
 * ACTUALIZAR PARTIDO
 *
 * Seguridad multi-tenant:
 * - Solo SUPERUSUARIO o DELEGADO pueden editar
 * - Valida que la league pertenezca al delegado actual
 * --------------------------------------------------------- */
export async function updateMatchAction(p: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchId: string;

  fecha?: string | null;
  hora?: string | null;
  venueId?: string | null;
  venueName?: string | null;
  status?: "scheduled" | "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  userId?: string;

  // 🔹 Nuevo opcional
  assessors?: string[] | null;
}) {
  // ✅ Validar permisos y ownership multi-tenant
  const ctx = await getDelegateContext();
  assertCanEdit(ctx);
  await assertLeagueBelongsToDelegate(p.leagueId, ctx);

  const db = getFirestore();
  const ref = db
    .collection("leagues")
    .doc(p.leagueId)
    .collection("groups")
    .doc(p.groupId)
    .collection("matchdays")
    .doc(p.matchdayId)
    .collection("matches")
    .doc(p.matchId);

  const updates: Record<string, any> = {};
  const now = new Date();

  if (p.fecha || p.hora) {
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: "Partido no encontrado." };
    const data = snap.data() ?? {};
    const currentKickoff: Date | null = data.kickoff ? new Date(data.kickoff) : null;

    const baseDate = p.fecha ?? (currentKickoff ? DateTime.fromJSDate(currentKickoff).toISODate() : null);
    const baseTime = p.hora ?? (currentKickoff ? DateTime.fromJSDate(currentKickoff).toFormat("HH:mm") : null);

    if (!baseDate || !baseTime) return { ok: false, error: "Faltan fecha u hora para definir kickoff." };

    const dt = DateTime.fromISO(`${baseDate}T${baseTime}`, { zone: "America/Mexico_City" });
    if (!dt.isValid) return { ok: false, error: "Fecha/Hora inválidas." };

    updates.kickoff = dt.toJSDate();
  }

  if (typeof p.venueId !== "undefined") updates.venueId = p.venueId ?? null;
  if (typeof p.venueName !== "undefined") updates.venueName = (p.venueName ?? "").trim() || null;
  if (typeof p.status !== "undefined") updates.status = String(p.status).toUpperCase();
  if (typeof p.homeGoals !== "undefined") updates.homeGoals = p.homeGoals;
  if (typeof p.awayGoals !== "undefined") updates.awayGoals = p.awayGoals;
  if (typeof p.homeTeamId !== "undefined") updates.homeTeamId = p.homeTeamId ?? null;
  if (typeof p.awayTeamId !== "undefined") updates.awayTeamId = p.awayTeamId ?? null;
  if (typeof p.homeTeamName !== "undefined") updates.homeTeamName = (p.homeTeamName ?? "").trim() || null;
  if (typeof p.awayTeamName !== "undefined") updates.awayTeamName = (p.awayTeamName ?? "").trim() || null;

  // 🔹 Nuevo: actualizar asesores
  if (typeof p.assessors !== "undefined") {
    updates.assessors = p.assessors ? await validateAssessors(p.assessors) : [];
  }

  updates.updatedAt = now;
  if (p.userId) updates.updatedBy = p.userId;

  await ref.update(updates);
  return { ok: true };
}
