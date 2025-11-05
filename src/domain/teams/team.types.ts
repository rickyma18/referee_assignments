// =============================
// src/domain/teams/team.types.ts
// =============================

export type Team = {
  id: string;
  groupId: string;

  name: string;
  name_lc: string;

  municipality: string; // texto libre
  stadium: string; // nombre del estadio (texto libre)
  venue: string; // dirección exacta (texto libre)

  logoUrl?: string | null;

  createdAt: Date;
  updatedAt: Date;
};
