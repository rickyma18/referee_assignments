/* eslint-disable complexity, max-lines */
import * as XLSX from "xlsx";

import { norm } from "@/lib/normalize";
import { TEAM_ALIASES } from "@/server/actions/fmf-team-aliases";

import type { TeamCacheEntry, TeamInfo, TeamMatchMeta } from "./fmf-import.types";

// ─── Column alias resolver ───────────────────────────────────────────
const COLUMN_ALIASES: Record<string, string[]> = {
  categoria: ["categoria", "categoría", "category"],
  jornada: ["jornada", "matchday", "j"],
  fecha: ["fecha", "date"],
  hora: ["hora", "time", "horario"],
  local: ["equipo local", "equipolocal", "local", "home", "club local"],
  visitante: ["equipo visitante", "equipovisitante", "visitante", "away", "club visitante"],
  estadio: ["estadio", "sede", "cancha", "campo", "venue", "stadium"],
  arbitro: ["arbitro", "arbitro central", "central", "referee"],
  aa1: ["aa1", "asistente 1", "arbitro asistente 1", "asistente1", "a.a.1", "primer asistente"],
  aa2: ["aa2", "asistente 2", "arbitro asistente 2", "asistente2", "a.a.2", "segundo asistente"],
  cuarto: ["cuarto arbitro", "4to arbitro", "cuarto", "4to"],
  asesor: ["asesor", "assessor", "supervisor"],
};

export function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRowIndex(row: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(row)) {
    map.set(normKey(key), key);
  }
  return map;
}

export function getCell(
  row: Record<string, unknown>,
  index: Map<string, string>,
  field: keyof typeof COLUMN_ALIASES,
): unknown {
  const aliases = COLUMN_ALIASES[field];
  if (!aliases) return "";
  for (const alias of aliases) {
    const realKey = index.get(normKey(alias));
    if (realKey !== undefined && row[realKey] !== undefined && row[realKey] !== "") {
      return row[realKey];
    }
  }
  return "";
}

export function getCellStr(
  row: Record<string, unknown>,
  index: Map<string, string>,
  field: keyof typeof COLUMN_ALIASES,
): string {
  return String(getCell(row, index, field) ?? "").trim();
}

// ─── Excel date/time helpers ─────────────────────────────────────────
/**
 * Extracts the date-only portion from a string that may contain time info.
 * "2/24/2026 16:00" → "2/24/2026", "2/24/2026 4:00 PM" → "2/24/2026"
 */
function extractDatePart(s: string): string {
  s = s.replace(/(?:\u00A0|\u200B|\u200C|\u200D|\uFEFF)/g, " ").trim();
  return s.split(/\s+/)[0];
}

/**
 * Resolves a 2-digit or 4-digit year string to a 4-digit year.
 * "26" → "2026", "2026" → "2026"
 */
function resolveYear(raw: string): string {
  if (raw.length <= 2) {
    const n = parseInt(raw, 10);
    return String(2000 + n);
  }
  return raw;
}

/**
 * Disambiguates A/B/YYYY (or A-B-YYYY) into { day, month } using Mexican-first rules:
 *  - a > 12 → dd/MM  (a can't be month)
 *  - b > 12 → MM/dd  (b can't be month, American)
 *  - both <= 12 → dd/MM (Mexican default)
 */
function disambiguateDayMonth(a: number, b: number): { day: number; month: number } | null {
  let day: number;
  let month: number;

  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else {
    day = a;
    month = b;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month };
}

export function parseExcelDate(val: string | number | Date | null | undefined): string | null {
  if (val == null || val === "") return null;

  if (typeof val === "string") {
    val = val.replace(/(?:\u00A0|\u200B|\u200C|\u200D|\uFEFF)/g, " ").trim();
    if (/^-?\d+(\.\d+)?$/.test(val)) {
      const num = Number(val);
      if (Number.isFinite(num)) {
        val = num;
      }
    }
  }

  // Date object (from some XLSX parsers)
  if (val instanceof Date) {
    const y = String(val.getFullYear()).padStart(4, "0");
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Excel serial number (integer or with fractional time part)
  if (typeof val === "number") {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (!parsed) return null;
    const y = String(parsed.y).padStart(4, "0");
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Strip time portion if present: "2/24/2026 16:00" → "2/24/2026"
  const datePart = extractDatePart(String(val).trim());

  // yyyy-MM-dd (ISO, with optional single-digit month/day)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(datePart)) {
    const [yy, mm, dd] = datePart.split("-");
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // A/B/YYYY, A-B-YYYY, A/B/YY, A-B-YY
  const m2 = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m2) {
    const a = parseInt(m2[1], 10);
    const b = parseInt(m2[2], 10);
    const year = resolveYear(m2[3]);
    const dm = disambiguateDayMonth(a, b);
    if (!dm) return null;
    return `${year}-${String(dm.month).padStart(2, "0")}-${String(dm.day).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Extracts a time string from an Excel serial, a plain time string,
 * an AM/PM time, or a datetime string that embeds the time.
 * Always returns "HH:mm" (24h) or null.
 */
export function parseExcelTime(val: string | number | null | undefined): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "string") {
    val = val.replace(/(?:\u00A0|\u200B|\u200C|\u200D|\uFEFF)/g, " ").trim();
    if (/^-?\d+(\.\d+)?$/.test(val)) {
      const num = Number(val);
      if (Number.isFinite(num)) {
        val = num;
      }
    }
  }

  // Excel serial fractional time (0.6667 ≈ 16:00)
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const s = String(val).trim();

  // Try to find a time pattern anywhere in the string (handles "2/24/2026 4:00 PM", "16:00", etc.)
  // AM/PM pattern: "4:00 PM", "4:00PM", "11:30 am"
  const ampmMatch = s.match(/(\d{1,2}):(\d{2})\s*(am|pm|AM|PM|a\.m\.|p\.m\.)/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const meridiem = ampmMatch[3].toLowerCase().replace(/\./g, "");
    if (meridiem === "pm" && h < 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // 24h pattern anywhere in the string: "16:00", or embedded like "2/24/2026 16:00"
  const h24Match = s.match(/(\d{1,2}):(\d{2})/);
  if (h24Match) {
    const h = parseInt(h24Match[1], 10);
    const m = parseInt(h24Match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Extracts a time string from an Excel serial number that has a fractional part.
 * Returns "HH:mm" or null if the serial has no fractional component.
 */
export function parseTimeFromExcelSerial(val: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(val);
  if (!parsed) return null;
  const h = parsed.H ?? 0;
  const m = parsed.M ?? 0;
  if (h === 0 && m === 0 && val === Math.floor(val)) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Fuzzy team matching ─────────────────────────────────────────────

const NOISE_TOKENS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "e",
  "fc",
  "f",
  "c",
  "club",
  "cd",
  "ac",
  "cf",
  "sc",
  "u",
  "ud",
  "deportivo",
  "atletico",
  "sporting",
  "soccer",
  "futbol",
  "football",
]);

export function teamKey(s: string): string {
  const stripped = s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = stripped.split(" ").filter((t) => t.length > 0 && !NOISE_TOKENS.has(t));

  return tokens.join(" ");
}

export function teamKeyBaseTokens(s: string): string[] {
  const key = teamKey(s);
  return key ? key.split(" ") : [];
}

export function teamKeyTokens(s: string): string[] {
  const base = teamKeyBaseTokens(s);
  if (base.length === 0) return [];
  const expanded = new Set(base);
  for (const t of base) {
    if (t.length > 4 && t.endsWith("s")) expanded.add(t.slice(0, -1));
    if (t.length > 3 && !t.endsWith("s")) expanded.add(t + "s");
  }
  return Array.from(expanded);
}

export function f1Score(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const candidateSet = new Set(candidateTokens);
  const querySet = new Set(queryTokens);
  let hits = 0;
  for (const t of queryTokens) {
    if (candidateSet.has(t)) hits++;
  }
  if (hits === 0) return 0;
  const recall = hits / querySet.size;
  const precision = hits / candidateSet.size;
  return (2 * precision * recall) / (precision + recall);
}

export function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const maxLen = Math.max(la, lb);
  const prev = new Array<number>(lb + 1);
  const curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return 1 - prev[lb] / maxLen;
}

export function combinedScore(excelName: string, candidateTokens: string[], candidateName: string): number {
  const queryTokens = teamKeyTokens(excelName);
  const f1 = f1Score(queryTokens, candidateTokens);
  const editSim = levenshteinRatio(norm(excelName), norm(candidateName));
  return 0.65 * f1 + 0.35 * editSim;
}

type TeamResolveResult =
  | { ok: true; team: TeamInfo; meta: TeamMatchMeta }
  | { ok: false; reason: string; suggestions: string[] };

export const SCORE_AUTO_MIN = 0.63;
export const SCORE_AUTO_GAP = 0.08;

export function resolveTeamByName(cache: TeamCacheEntry, rawExcelName: string): TeamResolveResult {
  const aliasResult = TEAM_ALIASES[norm(rawExcelName)];
  const excelName = aliasResult ?? rawExcelName;

  const exactMatch = cache.byNorm.get(norm(excelName));
  if (exactMatch) {
    return {
      ok: true,
      team: exactMatch,
      meta: { method: "exact", dbName: exactMatch.name, dbId: exactMatch.id },
    };
  }

  const key = teamKey(excelName);
  const looseMatches = cache.byKey.get(key);
  if (looseMatches && looseMatches.length === 1) {
    return {
      ok: true,
      team: looseMatches[0],
      meta: { method: "key", dbName: looseMatches[0].name, dbId: looseMatches[0].id },
    };
  }
  if (looseMatches && looseMatches.length > 1) {
    return {
      ok: false,
      reason: `Equipo ambiguo: "${rawExcelName}" [key=${key}]. Candidatos: ${looseMatches.map((t) => t.name).join(", ")}`,
      suggestions: looseMatches.map((t) => t.name),
    };
  }

  const scored = cache.all
    .map((entry) => ({
      team: entry.team,
      score: combinedScore(excelName, entry.keyTokens, entry.team.name),
    }))
    .filter((e) => e.score >= 0.4)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      ok: false,
      reason: `Equipo no encontrado: "${rawExcelName}" [key=${key}]`,
      suggestions: [],
    };
  }

  const top = scored[0];
  const second = scored[1];
  const gap = top.score - (second?.score ?? 0);

  if (top.score >= SCORE_AUTO_MIN && gap >= SCORE_AUTO_GAP) {
    return {
      ok: true,
      team: top.team,
      meta: {
        method: "score_auto",
        score: Math.round(top.score * 1000) / 1000,
        dbName: top.team.name,
        dbId: top.team.id,
      },
    };
  }

  const fmtSuggestion = (e: { team: TeamInfo; score: number }) => `${e.team.name} (${Math.round(e.score * 100)}%)`;
  const top3 = scored.slice(0, 3);

  if (top.score >= 0.55) {
    return {
      ok: false,
      reason: `Equipo ambiguo: "${rawExcelName}" [key=${key}]. Candidatos: ${top3.map(fmtSuggestion).join(", ")}`,
      suggestions: top3.map((e) => e.team.name),
    };
  }

  return {
    ok: false,
    reason: `Equipo no encontrado: "${rawExcelName}" [key=${key}]. Sugerencias: ${top3.map(fmtSuggestion).join(" | ")}`,
    suggestions: top3.map((e) => e.team.name),
  };
}

// ─── External Referee Helper ─────────────────────────────────────────

export function isExternalRefereeLabel(raw: string): boolean {
  if (!raw) return false;
  const v = norm(raw);

  return (
    v.includes("foraneo") ||
    v.includes("foraneo nayarit") ||
    v.includes("arbitro foraneo") ||
    v.includes("asesor de nayarit") ||
    v === "nayarit" ||
    v.includes("asesor externo")
  );
}
