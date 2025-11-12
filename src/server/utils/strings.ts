// src/server/utils/strings.ts
export function normalize(s: string) {
  return s.normalize("NFKC").trim();
}
