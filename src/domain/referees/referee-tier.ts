// src/domain/referees/referee-tier.ts

export const RefereeTierValues = [
  "NO_ELEGIBLE",
  "DEBUTANTE",
  "EN_DESARROLLO",
  "EXPERIMENTADO",
  "MUY_EXPERIMENTADO",
] as const;

export type RefereeTier = (typeof RefereeTierValues)[number];

/**
 * Labels amigables para mostrar en UI (si algún día quieres).
 */
export const RefereeTierLabels: Record<RefereeTier, string> = {
  NO_ELEGIBLE: "NO_ELEGIBLE",
  DEBUTANTE: "DEBUTANTE",
  EN_DESARROLLO: "EN_DESARROLLO",
  EXPERIMENTADO: "EXPERIMENTADO",
  MUY_EXPERIMENTADO: "MUY_EXPERIMENTADO",
};

/**
 * Mapea el tier del árbitro a un score numérico (RCS) para usar en validaciones
 * y generación de ternas.
 *
 * NOTAS:
 * - NO_ELEGIBLE devuelve null a propósito: así es más fácil excluirlo del pool
 *   automático y sólo permitirlo en asignaciones manuales si quieres.
 * - El resto son valores sencillos 1-4 que luego comparamos contra MDS.
 */
export function refereeTierToRcsCentral(tier: RefereeTier | null | undefined): number | null {
  if (!tier) return null;

  switch (tier) {
    case "NO_ELEGIBLE":
      return null; // no entra a sugerencias automáticas
    case "DEBUTANTE":
      return 1;
    case "EN_DESARROLLO":
      return 2;
    case "EXPERIMENTADO":
      return 3;
    case "MUY_EXPERIMENTADO":
      return 4;
    default:
      return null;
  }
}

/**
 * Helper por si en algún momento quieres hacer el camino inverso
 * desde un RCS numérico al tier "ideal" de árbitro.
 *
 * Ojo: este mapping es aproximado y sólo sirve como referencia.
 */
export function rcsCentralToRefereeTier(rcs: number | null | undefined): RefereeTier | null {
  if (rcs == null || !Number.isFinite(rcs)) return null;

  if (rcs >= 4) return "MUY_EXPERIMENTADO";
  if (rcs >= 3) return "EXPERIMENTADO";
  if (rcs >= 2) return "EN_DESARROLLO";
  if (rcs >= 1) return "DEBUTANTE";
  return null;
}
