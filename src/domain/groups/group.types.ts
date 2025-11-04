// =============================
// src/domain/groups/group.types.ts
// =============================
export type Group = {
  id: string;
  leagueId: string; // referencia padre
  name: string;
  season: string; // redundante pero útil para UI/filtros
  name_lc: string;
  season_lc: string;
  order: number; // 👈 clave para el error que te salía
  createdAt?: string; // ISO (por serialize)
  updatedAt?: string; // ISO (por serialize)
};
