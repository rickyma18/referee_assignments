/**
 * Manual alias map: norm(excelName) → replacement name to use for team resolution.
 * Add entries here when the Excel name is consistently different from Firestore
 * and no amount of fuzzy matching can resolve it.
 *
 * Keys MUST be the output of norm(excelName) — lowercase, no diacritics, collapsed spaces.
 * Values are the exact team name as stored in Firestore (case-insensitive, norm() applied before lookup).
 *
 * Example:
 *   "guerreros fc zapopan": "Club Guerreros de Zapopan",
 */
export const TEAM_ALIASES: Record<string, string> = {
  // Add overrides here as needed, e.g.:
  // "guerreros fc zapopan": "Club Guerreros de Zapopan",
};
