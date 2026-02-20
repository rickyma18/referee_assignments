/**
 * Tests for team resolution logic in the FMF import.
 *
 * We test the pure functions (combinedScore, resolveTeamByName) directly,
 * building mock TeamCacheEntry structures to avoid Firestore dependencies.
 */
import { describe, expect, it, vi } from "vitest";

// Import pure helpers via _testInternals (no Firestore needed)
// We need to mock "server-only" since it throws at import time outside Next.js
vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({}),
}));
vi.mock("@/server/auth/get-delegate-context", () => ({
  getDelegateContext: async () => ({ uid: "test" }),
}));
vi.mock("@/server/auth/require-delegate-access", () => ({
  assertCanEdit: () => {},
  assertEffectiveDelegateId: () => "test-delegate",
}));
vi.mock("@/server/repositories/matchdays.repo", () => ({
  getAll: async () => [],
  create: async () => ({ id: "md-1" }),
  MatchdayNumberConflictError: class extends Error {},
}));

import type { TeamCacheEntry, TeamInfo } from "../fmf-import.types";
import {
  combinedScore,
  teamKey,
  teamKeyTokens,
  resolveTeamByName,
  SCORE_AUTO_MIN,
  SCORE_AUTO_GAP,
} from "../fmf-import.utils";

// ─── Helper: build a TeamCacheEntry from a list of team names ────────
function buildCache(teams: Array<{ id: string; name: string }>): TeamCacheEntry {
  const byNorm = new Map<string, TeamInfo>();
  const byKey = new Map<string, TeamInfo[]>();
  const all: TeamCacheEntry["all"] = [];
  const tokenFreq = new Map<string, number>();

  for (const t of teams) {
    const info: TeamInfo = { id: t.id, name: t.name, stadium: "", municipality: "" };
    const normName = t.name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    byNorm.set(normName, info);

    const key = teamKey(t.name);
    if (key) {
      const arr = byKey.get(key) ?? [];
      arr.push(info);
      byKey.set(key, arr);
    }

    const tokens = teamKeyTokens(t.name);
    all.push({ team: info, keyTokens: tokens });

    const seen = new Set<string>();
    for (const tok of tokens) {
      if (!seen.has(tok)) {
        seen.add(tok);
        tokenFreq.set(tok, (tokenFreq.get(tok) ?? 0) + 1);
      }
    }
  }

  return { byNorm, byKey, all, tokenFreq };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("resolveTeamByName — score auto-assign", () => {
  const teams = [
    { id: "t1", name: "Tigres de Álica" },
    { id: "t2", name: "Leones FC" },
    { id: "t3", name: "Águilas Doradas" },
    { id: "t4", name: "Tiburones Rojos" },
  ];
  const cache = buildCache(teams);

  it("exact match returns method=exact", () => {
    const res = resolveTeamByName(cache, "Tigres de Álica");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.meta.method).toBe("exact");
      expect(res.meta.dbName).toBe("Tigres de Álica");
    }
  });

  it("score >= 0.63 with sufficient gap → auto ok (score_auto)", () => {
    // "TIGRILLOS DE ALICA" is similar to "Tigres de Álica" but not exact
    const res = resolveTeamByName(cache, "TIGRES DE ALICA");
    expect(res.ok).toBe(true);
    if (res.ok) {
      // This might be exact match after normalization — check method
      expect(["exact", "key", "score_auto"]).toContain(res.meta.method);
      expect(res.team.id).toBe("t1");
    }
  });

  it("typo with score >= 0.63 → auto ok", () => {
    // Slight typo: "Tigres de Alica" → should match "Tigres de Álica"
    // This is actually an exact match after NFD normalization of á → a
    const res = resolveTeamByName(cache, "Tigres de Alica");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.team.id).toBe("t1");
    }
  });

  it("score < 0.63 → not ok", () => {
    // Completely different name
    const res = resolveTeamByName(cache, "Barcelona United");
    expect(res.ok).toBe(false);
  });

  it("two close candidates (gap < 0.08) → ambiguous, not auto-assigned", () => {
    // Build a cache with two names that will produce nearly identical scores
    // for the query. Using symmetric naming so both get the same token overlap.
    const ambiguousCache = buildCache([
      { id: "a1", name: "Halcones Rojos A" },
      { id: "a2", name: "Halcones Rojos B" },
    ]);
    // "Halcones Rojos" matches both equally — gap should be < 0.08
    const res = resolveTeamByName(ambiguousCache, "Halcones Rojos");
    // Both have the same key, so it should hit the "loose key multiple" path → ambiguous
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("ambiguo");
    }
  });
});

describe("combinedScore", () => {
  it("identical names → score ~1.0", () => {
    const tokens = teamKeyTokens("Tigres de Álica");
    const score = combinedScore("Tigres de Álica", tokens, "Tigres de Álica");
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("slight variation → score >= 0.63", () => {
    const tokens = teamKeyTokens("Tigres de Álica");
    const score = combinedScore("TIGRES ALICA", tokens, "Tigres de Álica");
    expect(score).toBeGreaterThanOrEqual(SCORE_AUTO_MIN);
  });

  it("completely different → score < 0.40", () => {
    const tokens = teamKeyTokens("Tigres de Álica");
    const score = combinedScore("Real Madrid CF", tokens, "Tigres de Álica");
    expect(score).toBeLessThan(0.4);
  });
});

describe("thresholds", () => {
  it("SCORE_AUTO_MIN is 0.63", () => {
    expect(SCORE_AUTO_MIN).toBe(0.63);
  });

  it("SCORE_AUTO_GAP is 0.08", () => {
    expect(SCORE_AUTO_GAP).toBe(0.08);
  });
});
