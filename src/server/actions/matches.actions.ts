"use server";
import "server-only";
import { getFirestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";

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
};

export async function createMatchAction(p: CreateMatchParams) {
  if (p.homeTeamId === p.awayTeamId) throw new Error("Local y Visitante no pueden ser iguales.");

  const kickoff = DateTime.fromISO(`${p.fecha}T${p.hora}`, {
    zone: "America/Mexico_City",
  });
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

  // anti-duplicado
  const dup = await coll
    .where("homeTeamId", "==", p.homeTeamId)
    .where("awayTeamId", "==", p.awayTeamId)
    .where("kickoff", "==", kickoff.toJSDate())
    .limit(1)
    .get();

  if (!dup.empty) throw new Error("Duplicado: ya existe un partido con mismos equipos y horario.");

  const now = new Date();
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
  });

  return { ok: true };
}

/* ---------------------------------------------------------
 * OBTENER PARTIDO POR ID
 * --------------------------------------------------------- */
export async function getMatchByIdAction(p: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchId: string;
}) {
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
 * --------------------------------------------------------- */
export async function updateMatchAction(p: {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchId: string;

  // campos editables
  fecha?: string | null; // "YYYY-MM-DD"
  hora?: string | null; // "HH:mm"
  venueId?: string | null;
  venueName?: string | null;
  status?: "scheduled" | "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | string;
  homeGoals?: number | null;
  awayGoals?: number | null;

  // opcional (por si permites cambiar equipos)
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  userId?: string; // para updatedBy
}) {
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

  // Fecha/hora → kickoff
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

  if (typeof p.status !== "undefined") {
    updates.status = String(p.status).toUpperCase();
  }

  if (typeof p.homeGoals !== "undefined") updates.homeGoals = p.homeGoals;
  if (typeof p.awayGoals !== "undefined") updates.awayGoals = p.awayGoals;

  if (typeof p.homeTeamId !== "undefined") updates.homeTeamId = p.homeTeamId ?? null;
  if (typeof p.awayTeamId !== "undefined") updates.awayTeamId = p.awayTeamId ?? null;
  if (typeof p.homeTeamName !== "undefined") updates.homeTeamName = (p.homeTeamName ?? "").trim() || null;
  if (typeof p.awayTeamName !== "undefined") updates.awayTeamName = (p.awayTeamName ?? "").trim() || null;

  updates.updatedAt = now;
  if (p.userId) updates.updatedBy = p.userId;

  await ref.update(updates);
  return { ok: true };
}
