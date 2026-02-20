// src/server/actions/matches-import.actions.ts
"use server";
import "server-only";

import { runFmfImport, type ScopedRowResult } from "./fmf-import.actions";

type ExcelRowInput = {
  Local?: string;
  Visitante?: string;
  Fecha?: string;
  Hora?: string;
};

type ValidateParams = {
  leagueId: string;
  groupId: string;
  matchdayId: string;
  matchdayNumber: number;
  rows: ExcelRowInput[];
  userId: string;
  limit?: number;
};

function toUiRow(r: ScopedRowResult) {
  return {
    rowNumber: r.rowNumber,
    raw: r.raw,
    errors: r.errors,
    normalized: r.normalized
      ? {
          homeTeamId: r.normalized.homeTeamId,
          awayTeamId: r.normalized.awayTeamId,
          venueId: r.normalized.venueId,
          venueName: r.normalized.venueName,
          kickoff: r.normalized.kickoff,
        }
      : undefined,
    resolvedVenueId: r.resolvedVenueId,
    resolvedVenueName: r.resolvedVenueName,
  };
}

export async function validateMatchesDryRun(params: ValidateParams) {
  const { leagueId, groupId, matchdayId, matchdayNumber, rows, limit = 2000 } = params;

  if (rows.length === 0) throw new Error("Archivo vacío.");
  if (rows.length > limit) throw new Error(`Máximo ${limit} filas por carga.`);

  const result = await runFmfImport({
    mode: "validate",
    scope: { leagueId, groupId, matchdayId, matchdayNumber },
    rows: rows as Record<string, unknown>[],
  });

  return { ok: result.ok, rows: result.rows.map(toUiRow) };
}

type ConfirmParams = ValidateParams & {
  importBatchId: string;
};

export async function confirmMatchesImport(params: ConfirmParams) {
  const { leagueId, groupId, matchdayId, matchdayNumber, rows, importBatchId, limit = 2000 } = params;

  if (rows.length === 0) throw new Error("Archivo vacío.");
  if (rows.length > limit) throw new Error(`Máximo ${limit} filas por carga.`);

  const result = await runFmfImport({
    mode: "commit",
    scope: { leagueId, groupId, matchdayId, matchdayNumber },
    rows: rows as Record<string, unknown>[],
    sourcePrefix: "matches_excel_ui_v1",
    importBatchId,
  });

  if (!result.ok) {
    return {
      ok: false,
      created: 0,
      message: result.message ?? "Existen errores. Corrige antes de confirmar.",
      result: { ok: false, rows: result.rows.map(toUiRow) },
    };
  }

  return { ok: true, created: result.created ?? 0 };
}
