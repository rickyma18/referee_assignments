// src/server/cache/memory-cache.ts
//
// Cache in-memory con TTL para reducir lecturas repetidas a Firestore.
// Vive en la memoria del proceso Node.js (funciona en self-hosted y en
// Vercel dentro de la misma instancia de función serverless).

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

/** Devuelve el valor cacheado si existe y no ha expirado, o `undefined`. */
export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/** Guarda un valor con TTL en milisegundos. */
export function setCached<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Borra una clave específica. */
export function invalidateCache(key: string): void {
  store.delete(key);
}

/** Borra todas las claves que empiezan con `prefix`. */
export function invalidateByPrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
