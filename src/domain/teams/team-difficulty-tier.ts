// src/domain/teams/team-difficulty-tier.ts

/**
 * Tier de dificultad del equipo / partido.
 *
 * La idea es que el MDS (Match Difficulty Score) se derive de los tiers
 * de los equipos local y visitante.
 *
 * Propuesta simple:
 * - TRANQUILO: 1
 * - REGULARES: 2
 * - COMPLICADO: 3
 * - MUY_COMPLICADO: 4
 */
export const TeamDifficultyTierValues = ["TRANQUILO", "REGULARES", "COMPLICADO", "MUY_COMPLICADO"] as const;

export type TeamDifficultyTier = (typeof TeamDifficultyTierValues)[number];

export const TeamDifficultyTierLabels: Record<TeamDifficultyTier, string> = {
  TRANQUILO: "Tranquilo",
  REGULARES: "Regulares",
  COMPLICADO: "Complicado",
  MUY_COMPLICADO: "Muy complicado",
};

/**
 * Mapea el tier de dificultad del equipo a un valor numérico para MDS.
 */
export function teamDifficultyTierToMds(tier: TeamDifficultyTier | null | undefined): number | null {
  if (!tier) return null;

  switch (tier) {
    case "TRANQUILO":
      return 1;
    case "REGULARES":
      return 2;
    case "COMPLICADO":
      return 3;
    case "MUY_COMPLICADO":
      return 4;
    default:
      return null;
  }
}

/**
 * Combina los tiers de local y visitante para obtener un MDS de partido.
 *
 * Regla sencilla:
 * - Se toma el máximo entre local y visitante (ya mapeados a número).
 * - Si alguno no tiene tier, se ignora y se usa el otro.
 * - Si ninguno tiene tier válido, devuelve null.
 */
export function computeMatchMdsFromTeams(options: {
  homeTier?: TeamDifficultyTier | null;
  awayTier?: TeamDifficultyTier | null;
}): number | null {
  const homeMds = teamDifficultyTierToMds(options.homeTier ?? null);
  const awayMds = teamDifficultyTierToMds(options.awayTier ?? null);

  if (homeMds == null && awayMds == null) return null;
  if (homeMds == null) return awayMds;
  if (awayMds == null) return homeMds;

  return Math.max(homeMds, awayMds);
}
