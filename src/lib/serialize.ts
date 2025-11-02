// src/lib/serialize.ts

/**
 * Convierte valores Timestamp-like (Firestore client/admin) y Date a ISO string.
 * Cumple ESLint:
 *  - Evita no-underscore-dangle con bracket notation
 */

type AnyRecord = Record<string, unknown>;

function toDateSafe(input: unknown): Date | null {
  if (input instanceof Date) return input;

  // Timestamps reales suelen exponer .toDate()
  if (input && typeof (input as any).toDate === "function") {
    return (input as any).toDate();
  }

  if (typeof input === "object" && input !== null) {
    const obj = input as AnyRecord;

    // Firestore export/raw: { _seconds, _nanoseconds } o { seconds, nanoseconds }
    const seconds = (obj["seconds"] as number | undefined) ?? (obj["_seconds"] as number | undefined);
    const nanos = (obj["nanoseconds"] as number | undefined) ?? (obj["_nanoseconds"] as number | undefined) ?? 0;

    if (typeof seconds === "number") {
      const n = typeof nanos === "number" ? nanos : 0;
      const ms = seconds * 1000 + Math.floor(n / 1e6);
      return new Date(ms);
    }
  }

  return null;
}

export function serialize<T = unknown>(value: T): T {
  const maybeDate = toDateSafe(value);
  if (maybeDate) return maybeDate.toISOString() as unknown as T;

  if (Array.isArray(value)) {
    return value.map(serialize) as unknown as T;
  }

  if (value && typeof value === "object") {
    const obj = value as AnyRecord;
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = serialize(v);
    }
    return out as T;
  }

  return value;
}
