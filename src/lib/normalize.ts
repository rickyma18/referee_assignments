/**
 * Normaliza una cadena: quita acentos/diacríticos, pasa a minúsculas y recorta espacios.
 * Útil para comparaciones de nombres insensibles a acentos y mayúsculas.
 */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
