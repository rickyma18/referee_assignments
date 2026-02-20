// src/app/(main)/dashboard/assignments/_components/assignments-types.ts

export type LeagueDoc = {
  id: string;
  name: string;
  season?: string | null;
};

export type GroupDoc = {
  id: string;
  name: string;
  leagueId: string;
};

export type AssignmentMatchRow = {
  id: string;
  leagueId: string;
  leagueName: string;
  groupId: string;
  groupName: string;
  matchdayId: string;
  matchdayNumber: number | null;
  kickoff: string | null;
  category?: string | null;
  jornadaLabel?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string | null;
  centralRefereeId?: string | null;
  centralExternalLabel?: string | null;
  aa1RefereeId?: string | null;
  aa1ExternalLabel?: string | null;
  aa2RefereeId?: string | null;
  aa2ExternalLabel?: string | null;
  fourthRefereeId?: string | null;
  fourthExternalLabel?: string | null;
  assessorRefereeId?: string | null;
  assessorExternalLabel?: string | null;
  leagueColorHex?: string | null;
};

export type RefereeOption = {
  id: string;
  name: string;
  status: string;
  canAssess: boolean;
};

// Estado interno por fila (para selects)
export type AssignmentRowState = AssignmentMatchRow & {
  central: string;
  aa1: string;
  aa2: string;
  fourth: string;
  assessor: string;
};

export type AssignmentTableMeta = {
  referees: RefereeOption[];
  isPendingGlobal: boolean;
  canEdit: boolean; // 👈 clave para bloquear edición a ARBITRO
  updateRow: (id: string, updater: (prev: AssignmentRowState) => AssignmentRowState) => void;
  onSaved: () => void;
};

export type AssignmentsTableProps = {
  leagues: LeagueDoc[];
  groups: GroupDoc[];
  matches: AssignmentMatchRow[];
  referees: RefereeOption[];
};
