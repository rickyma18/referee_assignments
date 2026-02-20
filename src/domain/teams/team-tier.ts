// src/domain/teams/team-tier.ts

// Tiers para "grado de complejidad" del equipo
// Los textos visibles los puedes mapear en la UI.
export const TeamTierValues = ["ESTANDAR", "REGULARES", "COMPLICADO", "MUY_COMPLICADO"] as const;

export type TeamTier = (typeof TeamTierValues)[number];
