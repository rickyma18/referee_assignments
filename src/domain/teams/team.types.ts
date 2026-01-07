// =============================
// src/domain/teams/team.types.ts
// =============================

import type { TeamTier } from "./team-tier";

export type Team = {
  id: string;
  groupId: string;
  leagueId: string;
  delegateId: string;

  name: string;
  name_lc: string;

  municipality: string; // texto libre
  stadium: string; // nombre del estadio (texto libre)
  venue: string; // dirección exacta (texto libre)

  logoUrl?: string | null;
  tier: TeamTier;

  // Campos de travel (opcionales, seteados por backfill script o manualmente)
  travelKmToLopezMateos?: number;
  travelCarMaxMinToLopezMateos?: number;
  travelPublicMaxMinToLopezMateos?: number | null;
  travelUpdatedAt?: Date;
  travelSource?: string;

  createdAt: Date;
  updatedAt: Date;
};
