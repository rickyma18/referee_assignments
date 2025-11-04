// =============================
// src/lib/serialize.ts
// =============================
type AnyRecord = Record<string, unknown>;

export function toDateSafe(input: unknown): Date | null {
  if (input instanceof Date) return input;

  // Firestore Timestamp
  if (input && typeof (input as any).toDate === "function") {
    return (input as any).toDate();
  }

  if (typeof input === "object" && input !== null) {
    const obj = input as AnyRecord;

    // Soporta {seconds,nanoseconds} y {_seconds,_nanoseconds}
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

/**
 * Convierte Timestamps/Date a ISO string y limpia prototipos (POJO).
 */
export function serialize<T = unknown>(value: T): T {
  const maybeDate = toDateSafe(value as any);
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

/**
 * Alias semántico: asegura objeto plano con fechas como ISO.
 */
export function toPlain<T = unknown>(value: T): T {
  return serialize<T>(value);
}

// Útil para UI
export function formatDate(d?: Date | null, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", ...opts }).format(d);
}
