export type TeamCandidate = {
  teamId: string;
  teamName: string;
  groupId: string;
  groupLabel: string;
  score: number;
  sameGroup: boolean;
};

export type RelocationSuggestion = {
  targetCategoryLabel: string;
  targetLeagueId: string;
  targetGroupId: string;
  home?: { teamId: string; teamName: string };
  away?: { teamId: string; teamName: string };
  matchType: "home_only" | "away_only" | "both";
};

export type TeamMatchMeta = {
  method: "exact" | "key" | "score_auto" | "score_manual";
  score?: number;
  dbName: string;
  dbId: string;
};

export type RefereeMatchMeta = {
  method: "exact" | "external_label";
};

export type FmfRowResult = {
  rowNumber: number;
  categoria: string;
  jornada: number | null;
  local: string;
  visitante: string;
  arbitros: string;
  status: "ok" | "error" | "skipped";
  message: string;
  /** True when user manually selected a team override for this row */
  overrideApplied?: boolean;
  /** True when this row was relocated to a different ALLOWED group */
  relocated?: boolean;
  /** Human-readable label of the target group after relocation */
  relocatedTo?: string;
  /** Match resolution metadata (for transparency) */
  homeTeamMatch?: TeamMatchMeta;
  awayTeamMatch?: TeamMatchMeta;
  centralRefereeMeta?: RefereeMatchMeta;
  aa1RefereeMeta?: RefereeMatchMeta;
  aa2RefereeMeta?: RefereeMatchMeta;
  assessorMeta?: RefereeMatchMeta;
  suggestions?: {
    homeTeam?: TeamCandidate[];
    awayTeam?: TeamCandidate[];
    relocation?: RelocationSuggestion[];
  };
};

/** Overrides sent from the UI in commit mode */
export type OverridesByRow = Record<
  number,
  { homeTeamId?: string; awayTeamId?: string; targetGroupId?: string; targetLeagueId?: string }
>;

export type FmfImportResult = {
  ok: boolean;
  rows: FmfRowResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    skipped: number;
    toCreateMatchdays: number;
    toCreateMatches: number;
  };
  // Only present in commit / commit_valid mode
  createdMatchdays?: number;
  createdMatches?: number;
  /** Number of invalid rows remaining (commit_valid only) */
  invalidRemaining?: number;
  // Debug: headers and sample rows (validate mode only)
  debug?: {
    headers: string[];
    sampleRows: Record<string, unknown>[];
  };
};

export type TeamInfo = { id: string; name: string; stadium: string; municipality: string };
export type RefereeInfo = { id: string; name: string; status: string; canAssess: boolean };
export type VenueInfo = { id: string; name: string };

export type TeamCacheEntry = {
  /** Map<norm(name), TeamInfo> — exact match */
  byNorm: Map<string, TeamInfo>;
  /** Map<teamKey(name), TeamInfo[]> — loose match (may have collisions) */
  byKey: Map<string, TeamInfo[]>;
  /** All teams in a flat list for scoring */
  all: { team: TeamInfo; keyTokens: string[] }[];
  /** token → count of teams having that base token (for strong-token detection) */
  tokenFreq: Map<string, number>;
};
