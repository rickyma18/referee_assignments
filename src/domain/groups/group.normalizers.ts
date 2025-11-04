// =============================
// src/domain/groups/group.normalizers.ts
// =============================
/**
 * Normaliza a minúsculas, sin acentos, sin espacios sobrantes.
 */
export function toLc(s: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Alias por compatibilidad con código previo
export const norm = toLc;
