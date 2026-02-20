// src/server/actions/fmf-import.actions.ts
/* eslint-disable max-lines, complexity */
"use server";
import "server-only";

import { getFirestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";
import * as XLSX from "xlsx";

import { norm } from "@/lib/normalize";
import { TEAM_ALIASES } from "@/server/actions/fmf-team-aliases";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { assertCanEdit, assertEffectiveDelegateId } from "@/server/auth/require-delegate-access";
import * as matchdaysRepo from "@/server/repositories/matchdays.repo";

import type {
  FmfImportResult,
  FmfRowResult,
  OverridesByRow,
  RefereeInfo,
  RefereeMatchMeta,
  RelocationSuggestion,
  TeamCacheEntry,
  TeamCandidate,
  TeamInfo,
  TeamMatchMeta,
  VenueInfo,
} from "./fmf-import.types";
import {
  normKey,
  getCell,
  getCellStr,
  parseExcelDate,
  parseExcelTime,
  teamKey,
  teamKeyTokens,
  teamKeyBaseTokens,
  combinedScore,
  resolveTeamByName,
  isExternalRefereeLabel,
  SCORE_AUTO_MIN,
  SCORE_AUTO_GAP,
} from "./fmf-import.utils";

// ─── Allowed categories → league/group mapping ───────────────────────
const ALLOWED: Record<string, { leagueId: string; groupId: string }> = {
  "LTDP GRUPO 13": { leagueId: "eoc6ubocSU9giuug8Yl6", groupId: "NAK2FN6ZgXi8MbhzSnAW" },
  "LTDP GRUPO 14": { leagueId: "eoc6ubocSU9giuug8Yl6", groupId: "C1ck0Sl8qOs6U0bFlV3B" },
  "LTDP GRUPO 15": { leagueId: "eoc6ubocSU9giuug8Yl6", groupId: "knIIB4rj611CsE2Z2YJq" },
  "LTDP FEMENIL GRUPO 4": { leagueId: "KYtzwc6qJ3zxBDlgnnUY", groupId: "BUXXff1MmrC0ALp5onKV" },
};

// Pre-compute normalized lookup
const ALLOWED_NORM = new Map<string, { key: string; leagueId: string; groupId: string }>();
for (const [key, val] of Object.entries(ALLOWED)) {
  ALLOWED_NORM.set(norm(key), { key, ...val });
}

// Reverse map: groupId → human label (for diagnostic messages)
const GROUP_LABEL_BY_ID: Record<string, string> = {};
for (const [label, { groupId }] of Object.entries(ALLOWED)) {
  GROUP_LABEL_BY_ID[groupId] = label;
}

// ─── Constants ───────────────────────────────────────────────────────────

// ─── Column alias resolver ───────────────────────────────────────────
// Normalizes all keys of a row into a Map<normKey, value> once per row,
// then getCell picks the first alias that matches.

// ─── Imports from Utils ──────────────────────────────────────────────
// ─── Cache types ─────────────────────────────────────────────────────

// ─── Main action ─────────────────────────────────────────────────────
export async function importFmfExcelAction(formData: FormData): Promise<FmfImportResult> {
  const ctx = await getDelegateContext();
  assertCanEdit(ctx);
  const delegateId = assertEffectiveDelegateId(ctx);

  const file = formData.get("file") as File | null;
  const mode = (formData.get("mode") as string) ?? "validate";
  const limit = Number(formData.get("limit") ?? 2000);

  // Parse overrides (commit mode only)
  let overrides: OverridesByRow = {};
  const overridesRaw = formData.get("overridesByRow") as string | null;
  if (overridesRaw) {
    try {
      overrides = JSON.parse(overridesRaw) as OverridesByRow;
    } catch {
      // ignore malformed JSON
    }
  }

  if (!file || file.size === 0) {
    return emptyResult("No se proporcionó archivo.");
  }

  // Parse Excel server-side
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return emptyResult("El archivo no tiene hojas.");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    blankrows: false,
    raw: true,
  });

  if (rawRows.length === 0) return emptyResult("El archivo está vacío.");
  if (rawRows.length > limit) return emptyResult(`Máximo ${limit} filas por carga.`);

  // Capture debug info: real headers + sample rows
  const debugHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const debugSampleRows = rawRows.slice(0, 3).map((r) => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(r)) {
      out[k] = r[k];
    }
    return out;
  });

  const db = getFirestore();

  // ─── Build caches ──────────────────────────────────────────────────
  const teamCacheByGroup = new Map<string, TeamCacheEntry>();
  const venuesByGroup = new Map<string, Map<string, VenueInfo>>();
  const matchdaysByGroup = new Map<string, Map<number, string>>(); // groupKey → (number → matchdayId)

  // Referees: query once for this delegate
  const refereesSnap = await db.collection("referees").where("delegateId", "==", delegateId).get();
  const refereesByNorm = new Map<string, RefereeInfo>();
  for (const doc of refereesSnap.docs) {
    const data = doc.data();
    const name = String(data.name ?? "").trim();
    if (!name) continue;
    refereesByNorm.set(norm(name), {
      id: doc.id,
      name,
      status: String(data.status ?? ""),
      canAssess: Boolean(data.canAssess),
    });
  }

  async function getTeamCacheForGroup(groupId: string): Promise<TeamCacheEntry> {
    if (teamCacheByGroup.has(groupId)) return teamCacheByGroup.get(groupId)!;
    const snap = await db
      .collection("teams")
      .where("groupId", "==", groupId)
      .where("delegateId", "==", delegateId)
      .get();

    const byNorm = new Map<string, TeamInfo>();
    const byKey = new Map<string, TeamInfo[]>();
    const all: TeamCacheEntry["all"] = [];
    const tokenFreq = new Map<string, number>();

    for (const doc of snap.docs) {
      const d = doc.data();
      const name = String(d.name ?? "").trim();
      if (!name) continue;
      const info: TeamInfo = {
        id: doc.id,
        name,
        stadium: String(d.stadium ?? d.venue ?? "").trim(),
        municipality: String(d.municipality ?? "").trim(),
      };

      // Exact index
      byNorm.set(norm(name), info);

      // Loose key index
      const key = teamKey(name);
      if (key) {
        const arr = byKey.get(key) ?? [];
        arr.push(info);
        byKey.set(key, arr);
      }

      // Tokens for scoring
      all.push({ team: info, keyTokens: teamKeyTokens(name) });

      // Token frequency: count how many teams have each base token
      const baseTokens = teamKeyBaseTokens(name);
      const seen = new Set<string>();
      for (const t of baseTokens) {
        if (!seen.has(t)) {
          seen.add(t);
          tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
        }
      }
    }

    const cache: TeamCacheEntry = { byNorm, byKey, all, tokenFreq };
    teamCacheByGroup.set(groupId, cache);
    return cache;
  }

  // ─── Cross-group diagnostic (only called on error paths) ──────────
  type TeamFoundHint =
    | { kind: "single"; groupId: string; label: string; teamName: string }
    | { kind: "multi"; matches: Array<{ groupId: string; label: string; teamName: string }> };

  async function findTeamInOtherAllowedGroups(
    excelName: string,
    currentGroupId: string,
  ): Promise<TeamFoundHint | null> {
    const otherGroupIds = Object.values(ALLOWED)
      .map((v) => v.groupId)
      .filter((gid) => gid !== currentGroupId);

    const found: Array<{ groupId: string; label: string; teamName: string }> = [];

    for (const gid of otherGroupIds) {
      const cache = await getTeamCacheForGroup(gid);
      const res = resolveTeamByName(cache, excelName);
      if (res.ok) {
        found.push({
          groupId: gid,
          label: GROUP_LABEL_BY_ID[gid] ?? gid,
          teamName: res.team.name,
        });
      }
    }

    if (found.length === 1) return { kind: "single", ...found[0] };
    if (found.length > 1) return { kind: "multi", matches: found };
    return null;
  }

  /** Suggest teams from current group + all other ALLOWED groups, sorted by combined score */
  async function suggestTeams(excelName: string, currentGroupId: string, max = 5): Promise<TeamCandidate[]> {
    const allGroupIds = Object.values(ALLOWED).map((v) => v.groupId);
    // ensure current group is first
    const ordered = [currentGroupId, ...allGroupIds.filter((g) => g !== currentGroupId)];

    const candidates: TeamCandidate[] = [];
    for (const gid of ordered) {
      const cache = await getTeamCacheForGroup(gid);
      for (const entry of cache.all) {
        const score = combinedScore(excelName, entry.keyTokens, entry.team.name);
        if (score >= 0.35) {
          candidates.push({
            teamId: entry.team.id,
            teamName: entry.team.name,
            groupId: gid,
            groupLabel: GROUP_LABEL_BY_ID[gid] ?? gid,
            score: Math.round(score * 1000) / 1000,
            sameGroup: gid === currentGroupId,
          });
        }
      }
    }

    // Sort desc by score, then prefer same group
    candidates.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
      return (b.sameGroup ? 1 : 0) - (a.sameGroup ? 1 : 0);
    });

    return candidates.slice(0, max);
  }

  /** Resolve a team by override teamId — validates existence and delegateId.
   *  Cross-group is ALLOWED (user explicitly chose it). Returns a warning if groupId doesn't match. */
  async function resolveTeamByOverride(
    teamId: string,
    requiredGroupId: string,
  ): Promise<{ ok: true; team: TeamInfo; warning?: string } | { ok: false; reason: string }> {
    const doc = await db.collection("teams").doc(teamId).get();
    if (!doc.exists) return { ok: false, reason: `Override inválido: equipo ${teamId} no existe.` };
    const data = doc.data()!;
    if (data.delegateId !== delegateId) {
      return { ok: false, reason: `Override inválido: equipo ${teamId} pertenece a otro delegado.` };
    }
    let warning: string | undefined;
    if (data.groupId !== requiredGroupId) {
      const fromLabel = GROUP_LABEL_BY_ID[data.groupId as string] ?? data.groupId;
      const toLabel = GROUP_LABEL_BY_ID[requiredGroupId] ?? requiredGroupId;
      warning = `Override cross-group: "${data.name}" pertenece a ${fromLabel}, importando a ${toLabel}.`;
    }
    return {
      ok: true,
      warning,
      team: {
        id: doc.id,
        name: String(data.name ?? "").trim(),
        stadium: String(data.stadium ?? data.venue ?? "").trim(),
        municipality: String(data.municipality ?? "").trim(),
      },
    };
  }

  /** Build relocation suggestions: try resolving BOTH teams in each other ALLOWED group */
  async function buildRelocationSuggestions(
    localRaw: string,
    visitanteRaw: string,
    currentGroupId: string,
  ): Promise<RelocationSuggestion[]> {
    const suggestions: RelocationSuggestion[] = [];
    for (const [label, { leagueId, groupId }] of Object.entries(ALLOWED)) {
      if (groupId === currentGroupId) continue;
      const cache = await getTeamCacheForGroup(groupId);

      const homeRes = localRaw ? resolveTeamByName(cache, localRaw) : null;
      const awayRes = visitanteRaw ? resolveTeamByName(cache, visitanteRaw) : null;

      const homeOk = homeRes?.ok === true;
      const awayOk = awayRes?.ok === true;

      if (!homeOk && !awayOk) continue;

      const matchType: RelocationSuggestion["matchType"] =
        homeOk && awayOk ? "both" : homeOk ? "home_only" : "away_only";

      suggestions.push({
        targetCategoryLabel: label,
        targetLeagueId: leagueId,
        targetGroupId: groupId,
        ...(homeOk && homeRes.ok ? { home: { teamId: homeRes.team.id, teamName: homeRes.team.name } } : {}),
        ...(awayOk && awayRes.ok ? { away: { teamId: awayRes.team.id, teamName: awayRes.team.name } } : {}),
        matchType,
      });
    }

    // Sort: "both" first, then "home_only"/"away_only"
    suggestions.sort((a, b) => {
      const order = { both: 0, home_only: 1, away_only: 1 };
      return order[a.matchType] - order[b.matchType];
    });

    return suggestions;
  }

  function formatCrossGroupHint(hint: TeamFoundHint): string {
    if (hint.kind === "single") {
      return `Encontrado en otro grupo: ${hint.label} (${hint.groupId}) — DB: ${hint.teamName}`;
    }
    return `Encontrado en múltiples grupos: ${hint.matches.map((m) => `${m.label} (DB: ${m.teamName})`).join(", ")}`;
  }

  async function getVenuesForGroup(groupId: string): Promise<Map<string, VenueInfo>> {
    if (venuesByGroup.has(groupId)) return venuesByGroup.get(groupId)!;
    const snap = await db.collection("venues").where("groupId", "==", groupId).get();
    const map = new Map<string, VenueInfo>();
    for (const doc of snap.docs) {
      const d = doc.data();
      const name = String(d.name ?? "").trim();
      if (!name) continue;
      map.set(norm(name), { id: doc.id, name });
    }
    venuesByGroup.set(groupId, map);
    return map;
  }

  async function getMatchdaysForGroup(leagueId: string, groupId: string): Promise<Map<number, string>> {
    const key = `${leagueId}__${groupId}`;
    if (matchdaysByGroup.has(key)) return matchdaysByGroup.get(key)!;
    const mds = await matchdaysRepo.getAll({ leagueId, groupId, limit: 200 });
    const map = new Map<number, string>();
    for (const md of mds) {
      map.set(md.number, md.id);
    }
    matchdaysByGroup.set(key, map);
    return map;
  }

  // ─── Process rows ──────────────────────────────────────────────────
  type ParsedRow = {
    rowNumber: number;
    categoria: string;
    jornada: number;
    leagueId: string;
    groupId: string;
    homeTeamId: string;
    homeTeamName: string;
    awayTeamId: string;
    awayTeamName: string;
    kickoff: Date;
    venueId: string;
    venueName: string;
    municipality: string;
    centralRefereeId: string | null;
    centralRefereeName: string;
    centralRefereeMeta?: RefereeMatchMeta;
    aa1RefereeId: string | null;
    aa1RefereeName: string;
    aa1RefereeMeta?: RefereeMatchMeta;
    aa2RefereeId: string | null;
    aa2RefereeName: string;
    aa2RefereeMeta?: RefereeMatchMeta;
    assessors: string[]; // Still IDs, empty if external
    assessorsNames?: string[]; // Names if external
    assessorName?: string;
    assessorMeta?: RefereeMatchMeta;
    skipped: boolean;
  };

  const results: FmfRowResult[] = [];
  const validRows: ParsedRow[] = [];

  // Build the key index once from detected headers (consistent across all rows)
  const sharedIndex = new Map<string, string>();
  for (const h of debugHeaders) {
    sharedIndex.set(normKey(h), h);
  }

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 1;
    const src = rawRows[i];
    const errors: string[] = [];

    const categoriaRaw = getCellStr(src, sharedIndex, "categoria");
    const jornadaRaw = getCellStr(src, sharedIndex, "jornada");
    const fechaRaw = getCell(src, sharedIndex, "fecha");
    const horaRaw = getCell(src, sharedIndex, "hora");
    const localRaw = getCellStr(src, sharedIndex, "local");
    const visitanteRaw = getCellStr(src, sharedIndex, "visitante");
    const estadioRaw = getCellStr(src, sharedIndex, "estadio");
    const arbitroRaw = getCellStr(src, sharedIndex, "arbitro");
    const aa1Raw = getCellStr(src, sharedIndex, "aa1");
    const aa2Raw = getCellStr(src, sharedIndex, "aa2");
    const asesorRaw = getCellStr(src, sharedIndex, "asesor");

    // 1. Categoría → ALLOWED lookup
    const catMatch = ALLOWED_NORM.get(norm(categoriaRaw));
    if (!categoriaRaw) {
      errors.push("Categoría vacía.");
    } else if (!catMatch) {
      errors.push(`Categoría no permitida: ${categoriaRaw}`);
    }

    // 2. Jornada
    const jornadaNum = parseInt(jornadaRaw, 10);
    if (isNaN(jornadaNum) || jornadaNum < 1) {
      errors.push(`Jornada inválida: ${jornadaRaw}`);
    }

    // 3. Fecha + Hora
    const dateStr = parseExcelDate(fechaRaw as string | number);
    const timeStr = parseExcelTime(horaRaw as string | number);
    let kickoff: Date | null = null;

    if (!dateStr) {
      errors.push("Fecha inválida o vacía.");
    } else if (!timeStr) {
      errors.push("Hora inválida o vacía.");
    } else {
      const dt = DateTime.fromFormat(`${dateStr} ${timeStr}`, "yyyy-MM-dd HH:mm", {
        zone: "America/Mexico_City",
      });
      if (!dt.isValid) {
        errors.push(`Fecha/hora inválida: ${dateStr} ${timeStr}`);
      } else {
        kickoff = dt.toJSDate();
      }
    }

    // 4. Teams (need catMatch for groupId) — fuzzy matching + overrides + relocation
    let homeTeam: TeamInfo | undefined;
    let awayTeam: TeamInfo | undefined;
    let homeTeamMeta: TeamMatchMeta | undefined;
    let awayTeamMeta: TeamMatchMeta | undefined;
    const rowOverrides = overrides[rowNumber];
    let homeSuggestions: TeamCandidate[] | undefined;
    let awaySuggestions: TeamCandidate[] | undefined;
    let relocationSuggestions: RelocationSuggestion[] | undefined;
    let homeTeamError = false;
    let awayTeamError = false;
    let overrideApplied = false;
    const warnings: string[] = [];

    // Determine effective group: relocation override or original catMatch
    let effectiveGroupId = catMatch?.groupId;
    let effectiveLeagueId = catMatch?.leagueId;
    let relocated = false;

    if (catMatch && rowOverrides?.targetGroupId && rowOverrides?.targetLeagueId) {
      // Validate target is an ALLOWED group
      const targetAllowed = Object.values(ALLOWED).find(
        (v) => v.groupId === rowOverrides.targetGroupId && v.leagueId === rowOverrides.targetLeagueId,
      );
      if (targetAllowed) {
        effectiveGroupId = rowOverrides.targetGroupId;
        effectiveLeagueId = rowOverrides.targetLeagueId;
        relocated = true;
        overrideApplied = true;
        const fromLabel = GROUP_LABEL_BY_ID[catMatch.groupId] ?? catMatch.groupId;
        const toLabel = GROUP_LABEL_BY_ID[effectiveGroupId] ?? effectiveGroupId;
        warnings.push(`Reubicado: ${fromLabel} → ${toLabel}`);
      } else {
        errors.push(`Grupo destino no permitido: ${rowOverrides.targetGroupId}`);
      }
    }

    if (catMatch && effectiveGroupId && effectiveLeagueId) {
      const teamCache = await getTeamCacheForGroup(effectiveGroupId);

      // ── Home team ──
      if (!localRaw && !rowOverrides?.homeTeamId) {
        errors.push("Equipo local vacío.");
        homeTeamError = true;
      } else if (rowOverrides?.homeTeamId) {
        // Override from UI
        const ov = await resolveTeamByOverride(rowOverrides.homeTeamId, effectiveGroupId);
        if (ov.ok) {
          homeTeam = ov.team;
          homeTeamMeta = { method: "score_manual", dbName: ov.team.name, dbId: ov.team.id };
          overrideApplied = true;
          if (ov.warning) warnings.push(ov.warning);
        } else {
          errors.push(ov.reason);
          homeTeamError = true;
        }
      } else {
        const res = resolveTeamByName(teamCache, localRaw);
        if (res.ok) {
          homeTeam = res.team;
          homeTeamMeta = res.meta;
        } else {
          homeTeamError = true;
          const hint = await findTeamInOtherAllowedGroups(localRaw, effectiveGroupId);
          errors.push(hint ? `${res.reason} — ${formatCrossGroupHint(hint)}` : res.reason);
          // Collect suggestions for UI
          homeSuggestions = await suggestTeams(localRaw, effectiveGroupId);
        }
      }

      // ── Away team ──
      if (!visitanteRaw && !rowOverrides?.awayTeamId) {
        errors.push("Equipo visitante vacío.");
        awayTeamError = true;
      } else if (rowOverrides?.awayTeamId) {
        const ov = await resolveTeamByOverride(rowOverrides.awayTeamId, effectiveGroupId);
        if (ov.ok) {
          awayTeam = ov.team;
          awayTeamMeta = { method: "score_manual", dbName: ov.team.name, dbId: ov.team.id };
          overrideApplied = true;
          if (ov.warning) warnings.push(ov.warning);
        } else {
          errors.push(ov.reason);
          awayTeamError = true;
        }
      } else {
        const res = resolveTeamByName(teamCache, visitanteRaw);
        if (res.ok) {
          awayTeam = res.team;
          awayTeamMeta = res.meta;
        } else {
          awayTeamError = true;
          const hint = await findTeamInOtherAllowedGroups(visitanteRaw, effectiveGroupId);
          errors.push(hint ? `${res.reason} — ${formatCrossGroupHint(hint)}` : res.reason);
          awaySuggestions = await suggestTeams(visitanteRaw, effectiveGroupId);
        }
      }

      // Build relocation suggestions when teams fail in current group (and no relocation override already set)
      if ((homeTeamError || awayTeamError) && !relocated) {
        relocationSuggestions = await buildRelocationSuggestions(localRaw, visitanteRaw, effectiveGroupId);
      }

      if (homeTeam && awayTeam && homeTeam.id === awayTeam.id) {
        errors.push("Local y Visitante no pueden ser el mismo equipo.");
      }
    }

    // 5. Venue: from home team's stadium, fallback to ESTADIO column
    let venueId = "";
    let venueName = "";

    if (catMatch && effectiveGroupId && homeTeam) {
      const venuesMap = await getVenuesForGroup(effectiveGroupId);
      const stadiumName = homeTeam.stadium;

      if (stadiumName) {
        const venueMatch = venuesMap.get(norm(stadiumName));
        if (venueMatch) {
          venueId = venueMatch.id;
          venueName = venueMatch.name;
        } else {
          // Fallback: use stadium name directly
          venueId = "excel:" + norm(stadiumName);
          venueName = stadiumName;
        }
      } else if (estadioRaw) {
        const venueMatch = venuesMap.get(norm(estadioRaw));
        if (venueMatch) {
          venueId = venueMatch.id;
          venueName = venueMatch.name;
        } else {
          venueId = "excel:" + norm(estadioRaw);
          venueName = estadioRaw;
        }
      } else {
        errors.push(`No se pudo determinar la sede para ${localRaw}.`);
      }
    }

    // 6. Referees: ARBITRO, AA1, AA2
    // CENTRAL
    let centralRef: RefereeInfo | undefined;
    const centralRefMeta: RefereeMatchMeta | undefined = isExternalRefereeLabel(arbitroRaw)
      ? { method: "external_label" }
      : undefined;

    if (arbitroRaw) {
      if (centralRefMeta) {
        // External: skip validation
      } else {
        centralRef = refereesByNorm.get(norm(arbitroRaw));
        if (!centralRef) {
          errors.push(`Árbitro no encontrado: ${arbitroRaw}`);
        } else if (centralRef.status !== "DISPONIBLE") {
          errors.push(`Árbitro no disponible: ${arbitroRaw} (${centralRef.status})`);
        }
      }
    }

    // 7. AA1
    let aa1Ref: RefereeInfo | undefined;
    const aa1RefMeta: RefereeMatchMeta | undefined = isExternalRefereeLabel(aa1Raw)
      ? { method: "external_label" }
      : undefined;

    if (aa1Raw) {
      if (aa1RefMeta) {
        // External
      } else {
        aa1Ref = refereesByNorm.get(norm(aa1Raw));
        if (!aa1Ref) {
          errors.push(`AA1 no encontrado: ${aa1Raw}`);
        } else if (aa1Ref.status !== "DISPONIBLE") {
          errors.push(`AA1 no disponible: ${aa1Raw} (${aa1Ref.status})`);
        }
      }
    }

    // AA2
    let aa2Ref: RefereeInfo | undefined;
    const aa2RefMeta: RefereeMatchMeta | undefined = isExternalRefereeLabel(aa2Raw)
      ? { method: "external_label" }
      : undefined;

    if (aa2Raw) {
      if (aa2RefMeta) {
        // External
      } else {
        aa2Ref = refereesByNorm.get(norm(aa2Raw));
        if (!aa2Ref) {
          errors.push(`AA2 no encontrado: ${aa2Raw}`);
        } else if (aa2Ref.status !== "DISPONIBLE") {
          errors.push(`AA2 no disponible: ${aa2Raw} (${aa2Ref.status})`);
        }
      }
    }

    // 8. ASESOR
    const assessors: string[] = [];
    let assessorName = "";
    let assessorsNames: string[] | undefined;
    const assessorMeta: RefereeMatchMeta | undefined = isExternalRefereeLabel(asesorRaw)
      ? { method: "external_label" }
      : undefined;

    if (asesorRaw) {
      if (assessorMeta) {
        // External
        assessorsNames = [asesorRaw];
        assessorName = asesorRaw;
      } else {
        const asesorRef = refereesByNorm.get(norm(asesorRaw));
        if (!asesorRef) {
          errors.push(`Asesor no encontrado: ${asesorRaw}`);
        } else if (!asesorRef.canAssess) {
          errors.push(`${asesorRaw} no está habilitado como asesor.`);
        } else {
          assessors.push(asesorRef.id);
          assessorName = asesorRef.name;
        }
      }
    }

    // 10. Duplicate check
    let skipped = false;
    if (errors.length === 0 && catMatch && effectiveLeagueId && effectiveGroupId && homeTeam && awayTeam && kickoff) {
      const mdsMap = await getMatchdaysForGroup(effectiveLeagueId, effectiveGroupId);
      const existingMdId = mdsMap.get(jornadaNum);
      if (existingMdId) {
        const dupSnap = await db
          .collection("leagues")
          .doc(effectiveLeagueId)
          .collection("groups")
          .doc(effectiveGroupId)
          .collection("matchdays")
          .doc(existingMdId)
          .collection("matches")
          .where("homeTeamId", "==", homeTeam.id)
          .where("awayTeamId", "==", awayTeam.id)
          .where("kickoff", "==", kickoff)
          .limit(1)
          .get();

        if (!dupSnap.empty) {
          skipped = true;
        }
      }
    }

    const arbitrosDisplay = [arbitroRaw, aa1Raw, aa2Raw].filter(Boolean).join(", ");

    // Build suggestions object for error rows
    const suggestions =
      homeSuggestions || awaySuggestions || (relocationSuggestions && relocationSuggestions.length > 0)
        ? {
            ...(homeSuggestions && homeSuggestions.length > 0 ? { homeTeam: homeSuggestions } : {}),
            ...(awaySuggestions && awaySuggestions.length > 0 ? { awayTeam: awaySuggestions } : {}),
            ...(relocationSuggestions && relocationSuggestions.length > 0 ? { relocation: relocationSuggestions } : {}),
          }
        : undefined;

    if (errors.length > 0) {
      results.push({
        rowNumber,
        categoria: categoriaRaw,
        jornada: isNaN(jornadaNum) ? null : jornadaNum,
        local: localRaw,
        visitante: visitanteRaw,
        arbitros: arbitrosDisplay,
        status: "error",
        message: errors.join(" | "),
        suggestions,
      });
    } else if (skipped) {
      results.push({
        rowNumber,
        categoria: categoriaRaw,
        jornada: jornadaNum,
        local: localRaw,
        visitante: visitanteRaw,
        arbitros: arbitrosDisplay,
        status: "skipped",
        message: "Duplicado: ya existe este partido.",
      });
    } else {
      results.push({
        rowNumber,
        categoria: categoriaRaw,
        jornada: jornadaNum,
        local: localRaw,
        visitante: visitanteRaw,
        arbitros: arbitrosDisplay,
        status: "ok",
        message: warnings.length > 0 ? warnings.join(" | ") : "OK",
        overrideApplied,
        ...(homeTeamMeta ? { homeTeamMatch: homeTeamMeta } : {}),
        ...(awayTeamMeta ? { awayTeamMatch: awayTeamMeta } : {}),
        ...(relocated
          ? { relocated: true, relocatedTo: GROUP_LABEL_BY_ID[effectiveGroupId!] ?? effectiveGroupId }
          : {}),
        ...(centralRefMeta ? { centralRefereeMeta: centralRefMeta } : {}),
        ...(aa1RefMeta ? { aa1RefereeMeta: aa1RefMeta } : {}),
        ...(aa2RefMeta ? { aa2RefereeMeta: aa2RefMeta } : {}),
        ...(assessorMeta ? { assessorMeta: assessorMeta } : {}),
      });
      validRows.push({
        rowNumber,
        categoria: categoriaRaw,
        jornada: jornadaNum,
        leagueId: effectiveLeagueId!,
        groupId: effectiveGroupId!,
        homeTeamId: homeTeam!.id,
        homeTeamName: homeTeam!.name,
        awayTeamId: awayTeam!.id,
        awayTeamName: awayTeam!.name,
        kickoff: kickoff!,
        venueId,
        venueName,
        municipality: homeTeam!.municipality,
        centralRefereeId: centralRef?.id ?? null,
        centralRefereeName: centralRef?.name ?? (centralRefMeta ? arbitroRaw : ""),
        centralRefereeMeta: centralRefMeta,
        aa1RefereeId: aa1Ref?.id ?? null,
        aa1RefereeName: aa1Ref?.name ?? (aa1RefMeta ? aa1Raw : ""),
        aa1RefereeMeta: aa1RefMeta,
        aa2RefereeId: aa2Ref?.id ?? null,
        aa2RefereeName: aa2Ref?.name ?? (aa2RefMeta ? aa2Raw : ""),
        aa2RefereeMeta: aa2RefMeta,
        assessors,
        assessorsNames,
        assessorName,
        assessorMeta: assessorMeta,
        skipped,
      });
    }
  }

  // ─── Matchday grouping ────────────────────────────────────────────
  // Group valid rows by leagueId__groupId__matchdayNumber
  const mdGroups = new Map<
    string,
    {
      leagueId: string;
      groupId: string;
      matchdayNumber: number;
      kickoffMin: DateTime;
      kickoffMax: DateTime;
      rows: ParsedRow[];
    }
  >();

  for (const row of validRows) {
    const key = `${row.groupId}__${row.jornada}`;
    const dtLuxon = DateTime.fromJSDate(row.kickoff, { zone: "America/Mexico_City" });

    if (!mdGroups.has(key)) {
      mdGroups.set(key, {
        leagueId: row.leagueId,
        groupId: row.groupId,
        matchdayNumber: row.jornada,
        kickoffMin: dtLuxon,
        kickoffMax: dtLuxon,
        rows: [row],
      });
    } else {
      const g = mdGroups.get(key)!;
      g.rows.push(row);
      if (dtLuxon < g.kickoffMin) g.kickoffMin = dtLuxon;
      if (dtLuxon > g.kickoffMax) g.kickoffMax = dtLuxon;
    }
  }

  // Determine which matchdays need to be created
  let toCreateMatchdays = 0;
  const mdToCreate: Array<{
    key: string;
    leagueId: string;
    groupId: string;
    matchdayNumber: number;
    startDate: Date;
    endDate: Date;
  }> = [];

  for (const [key, g] of mdGroups) {
    const mdsMap = await getMatchdaysForGroup(g.leagueId, g.groupId);
    if (!mdsMap.has(g.matchdayNumber)) {
      toCreateMatchdays++;
      const startDate = g.kickoffMin.startOf("day").toJSDate();
      const endDate = g.kickoffMax.endOf("day").toJSDate();
      mdToCreate.push({
        key,
        leagueId: g.leagueId,
        groupId: g.groupId,
        matchdayNumber: g.matchdayNumber,
        startDate,
        endDate,
      });
    }
  }

  const summary = {
    total: rawRows.length,
    valid: validRows.length,
    invalid: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    toCreateMatchdays,
    toCreateMatches: validRows.length,
  };

  // ─── Validate mode: return preview ─────────────────────────────────
  if (mode === "validate") {
    return {
      ok: summary.invalid === 0,
      rows: results,
      summary,
      debug: { headers: debugHeaders, sampleRows: debugSampleRows },
    };
  }

  // ─── Commit mode ───────────────────────────────────────────────────
  if (mode === "commit" && summary.invalid > 0) {
    return { ok: false, rows: results, summary };
  }
  if (mode === "commit_valid" && summary.valid === 0) {
    return { ok: false, rows: results, summary };
  }

  const importBatchId = `fmf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  // 1. Create missing matchdays
  let createdMatchdays = 0;
  for (const md of mdToCreate) {
    try {
      const created = await matchdaysRepo.create({
        leagueId: md.leagueId,
        groupId: md.groupId,
        startDate: md.startDate,
        endDate: md.endDate,
        _prefillNumber: md.matchdayNumber,
        delegateId,
        createdBy: ctx.uid,
      });
      // Update cache
      const cacheKey = `${md.leagueId}__${md.groupId}`;
      const cached = matchdaysByGroup.get(cacheKey) ?? new Map<number, string>();
      cached.set(md.matchdayNumber, created.id);
      matchdaysByGroup.set(cacheKey, cached);
      createdMatchdays++;
    } catch (err) {
      if (err instanceof matchdaysRepo.MatchdayNumberConflictError) {
        // Re-query to get the existing matchday ID
        const mds = await matchdaysRepo.getAll({ leagueId: md.leagueId, groupId: md.groupId, limit: 200 });
        const existing = mds.find((m) => m.number === md.matchdayNumber);
        if (existing) {
          const cacheKey = `${md.leagueId}__${md.groupId}`;
          const cached = matchdaysByGroup.get(cacheKey) ?? new Map<number, string>();
          cached.set(md.matchdayNumber, existing.id);
          matchdaysByGroup.set(cacheKey, cached);
        }
      } else {
        throw err;
      }
    }
  }

  // 2. Create matches in batches of 499
  let createdMatches = 0;
  const BATCH_SIZE = 499;

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const chunk = validRows.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const row of chunk) {
      const cacheKey = `${row.leagueId}__${row.groupId}`;
      const mdsMap = matchdaysByGroup.get(cacheKey);
      const matchdayId = mdsMap?.get(row.jornada);

      if (!matchdayId) {
        continue; // shouldn't happen
      }

      const coll = db
        .collection("leagues")
        .doc(row.leagueId)
        .collection("groups")
        .doc(row.groupId)
        .collection("matchdays")
        .doc(matchdayId)
        .collection("matches");

      const matchData: Record<string, unknown> = {
        leagueId: row.leagueId,
        groupId: row.groupId,
        matchdayId,
        matchdayNumber: row.jornada,
        homeTeamId: row.homeTeamId,
        homeTeamName: row.homeTeamName,
        awayTeamId: row.awayTeamId,
        awayTeamName: row.awayTeamName,
        kickoff: row.kickoff,
        venueId: row.venueId,
        venueName: row.venueName,
        municipality: row.municipality,
        status: "scheduled",
        source: "fmf_excel_v2",
        importBatchId,
        delegateId,
        createdBy: ctx.uid,
        createdAt: now,
        updatedAt: now,
      };

      if (row.centralRefereeId || row.centralRefereeMeta?.method === "external_label") {
        matchData.centralRefereeId = row.centralRefereeId?.length ? row.centralRefereeId : null;
        matchData.centralRefereeName = row.centralRefereeName;
      }
      if (row.aa1RefereeId || row.aa1RefereeMeta?.method === "external_label") {
        matchData.aa1RefereeId = row.aa1RefereeId?.length ? row.aa1RefereeId : null;
        matchData.aa1RefereeName = row.aa1RefereeName;
      }
      if (row.aa2RefereeId || row.aa2RefereeMeta?.method === "external_label") {
        matchData.aa2RefereeId = row.aa2RefereeId?.length ? row.aa2RefereeId : null;
        matchData.aa2RefereeName = row.aa2RefereeName;
      }
      if (row.assessors.length > 0) {
        matchData.assessors = row.assessors;
      }
      if (row.assessorsNames && row.assessorsNames.length > 0) {
        matchData.assessorsNames = row.assessorsNames;
      }
      if (row.assessors.length > 0) {
        matchData.assessors = row.assessors;
      }

      batch.set(coll.doc(), matchData);
      createdMatches++;
    }

    await batch.commit();
  }

  return {
    ok: summary.invalid === 0,
    rows: results,
    summary,
    createdMatchdays,
    createdMatches,
    invalidRemaining: mode === "commit_valid" ? summary.invalid : undefined,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────
function emptyResult(message: string): FmfImportResult {
  return {
    ok: false,
    rows: [
      {
        rowNumber: 0,
        categoria: "",
        jornada: null,
        local: "",
        visitante: "",
        arbitros: "",
        status: "error",
        message,
      },
    ],
    summary: {
      total: 0,
      valid: 0,
      invalid: 1,
      skipped: 0,
      toCreateMatchdays: 0,
      toCreateMatches: 0,
    },
  };
}
