// src/server/actions/matches-import.actions.ts
"use server";
import "server-only";
import { getFirestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";
// ⬇️ dejamos de depender de un schema que pida Sede;
// si tu ExcelRowSchema ya NO exige Sede, lo puedes seguir usando.
// import { ExcelRowSchema, ExcelRowInput } from "@/schemas/matches";
type ExcelRowInput = {
  Local?: string;
  Visitante?: string;
  Fecha?: string; // YYYY-MM-DD
  Hora?: string; // HH:mm
  // Sede?: string; // <- ignorado si viene
};

import { findTeamIdByExactName, findVenueByExactName } from "./catalogs.actions";

type ValidateParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchdayNumber: number;
  rows: ExcelRowInput[];
  userId: string;
  limit?: number; // default 2000
};

function same(a?: string, b?: string) {
  return (a ?? "").toLowerCase().trim() === (b ?? "").toLowerCase().trim();
}

export async function validateMatchesDryRun(params: ValidateParams) {
  const { leagueId, groupId, matchdayId, matchdayNumber, rows, userId, limit = 2000 } = params;

  if (rows.length === 0) throw new Error("Archivo vacío.");
  if (rows.length > limit) throw new Error(`Máximo ${limit} filas por carga.`);

  const validated: Array<{
    rowNumber: number;
    raw: ExcelRowInput;
    errors: string[];
    normalized?: {
      homeTeamId: string;
      awayTeamId: string;
      venueId: string;
      venueName: string;
      kickoff: Date;
    };
    // info útil para UI
    resolvedVenueId?: string;
    resolvedVenueName?: string;
  }> = [];

  const db = getFirestore();

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const src = rows[i] ?? {};
    const raw: ExcelRowInput = {
      Local: String(src.Local ?? "").trim(),
      Visitante: String(src.Visitante ?? "").trim(),
      Fecha: String(src.Fecha ?? "").trim(),
      Hora: String(src.Hora ?? "").trim(),
      // Sede: ignorada si viene
    };

    const errors: string[] = [];

    // columnas mínimas
    if (!raw.Local || !raw.Visitante || !raw.Fecha || !raw.Hora) {
      errors.push("Formato inválido en columnas requeridas.");
      validated.push({ rowNumber, raw, errors });
      continue;
    }

    // local ≠ visitante (por lower+trim)
    if (same(raw.Local, raw.Visitante)) {
      errors.push("Local y Visitante no pueden ser iguales.");
    }

    // equipos (por nombre exacto)
    const [homeTeamId, awayTeamId] = await Promise.all([
      findTeamIdByExactName(leagueId, groupId, raw.Local),
      findTeamIdByExactName(leagueId, groupId, raw.Visitante),
    ]);
    if (!homeTeamId) errors.push(`Equipo local no encontrado: ${raw.Local}`);
    if (!awayTeamId) errors.push(`Equipo visitante no encontrado: ${raw.Visitante}`);

    // kickoff (permitimos pasado)
    let kickoffJS: Date | null = null;
    const dt = DateTime.fromFormat(`${raw.Fecha} ${raw.Hora}`, "dd-MM-yyyy HH:mm", { zone: "America/Mexico_City" });
    if (!dt.isValid) errors.push("Fecha u hora inválidas.");
    else kickoffJS = dt.toJSDate();

    // ====== derivar sede a partir del equipo local ======
    // ====== derivar sede a partir del equipo local ======
    let resolvedVenueId: string | undefined;
    let resolvedVenueName: string | undefined;

    if (homeTeamId) {
      // leer team para recuperar su nombre de sede/estadio
      const teamSnap = await db.collection("teams").doc(homeTeamId).get();
      const stadium = String(teamSnap.get("stadium") ?? teamSnap.get("venue") ?? "").trim();

      if (!stadium) {
        errors.push(`El equipo ${raw.Local} no tiene sede/estadio configurado.`);
      } else {
        // buscar venue real por nombre exacto dentro del grupo/league
        const ven = await findVenueByExactName(leagueId, groupId, stadium);
        if (!ven) {
          errors.push(`Sede no encontrada en el catálogo: ${stadium}`);
        } else {
          // 👇 FIX: usar venueName en lugar de name
          resolvedVenueId = ven.venueId;
          resolvedVenueName = ven.venueName ?? stadium;
        }
      }
    }

    // anti-duplicado (si todo lo anterior válido)
    if (errors.length === 0 && kickoffJS && homeTeamId && awayTeamId) {
      const dup = await db
        .collection("leagues")
        .doc(leagueId)
        .collection("groups")
        .doc(groupId)
        .collection("matchdays")
        .doc(matchdayId)
        .collection("matches")
        .where("homeTeamId", "==", homeTeamId)
        .where("awayTeamId", "==", awayTeamId)
        .where("kickoff", "==", kickoffJS) // Firestore Admin acepta Date
        .limit(1)
        .get();

      if (!dup.empty) errors.push("Duplicado: ya existe un partido con mismos equipos y horario.");
    }

    validated.push({
      rowNumber,
      raw,
      errors,
      normalized:
        errors.length === 0 && kickoffJS && resolvedVenueId && resolvedVenueName && homeTeamId && awayTeamId
          ? {
              homeTeamId,
              awayTeamId,
              venueId: resolvedVenueId,
              venueName: resolvedVenueName,
              kickoff: kickoffJS,
            }
          : undefined,
      resolvedVenueId,
      resolvedVenueName,
    });
  }

  // política: si hay **cualquier** error → bloquear importación completa
  const hasAnyError = validated.some((v) => v.errors.length > 0);
  return { ok: !hasAnyError, rows: validated };
}

type ConfirmParams = ValidateParams & {
  importBatchId: string;
};

export async function confirmMatchesImport(params: ConfirmParams) {
  const { leagueId, groupId, matchdayId, matchdayNumber, rows, userId, importBatchId } = params;
  const db = getFirestore();
  const dry = await validateMatchesDryRun({ leagueId, groupId, matchdayId, matchdayNumber, rows, userId });

  if (!dry.ok) {
    return { ok: false, message: "Existen errores. Corrige antes de confirmar.", result: dry };
  }

  const batch = db.batch();
  const coll = db
    .collection("leagues")
    .doc(leagueId)
    .collection("groups")
    .doc(groupId)
    .collection("matchdays")
    .doc(matchdayId)
    .collection("matches");

  const now = new Date();

  dry.rows.forEach((r) => {
    const n = r.normalized!; // seguro porque dry.ok === true
    const ref = coll.doc();
    batch.set(ref, {
      leagueId,
      groupId,
      matchdayId,
      matchdayNumber,
      homeTeamId: n.homeTeamId,
      homeTeamName: String(r.raw.Local ?? "").trim(),
      awayTeamId: n.awayTeamId,
      awayTeamName: String(r.raw.Visitante ?? "").trim(),
      venueId: n.venueId,
      venueName: n.venueName, // <- usamos la resuelta, NO del Excel
      kickoff: n.kickoff,
      status: "scheduled",
      source: "fmf_excel_v1",
      importBatchId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  });

  await batch.commit();
  return { ok: true, created: dry.rows.length };
}
