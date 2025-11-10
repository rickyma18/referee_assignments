// src/lib/date-client.ts
export function toDateClientSafe(input: unknown): Date | null {
  if (!input) return null;

  // Ya es Date
  if (input instanceof Date) return input;

  // Firestore Timestamp en cliente (poco probable aquí, pero por si acaso)
  if (typeof input === "object" && input !== null && "toDate" in (input as any)) {
    try {
      return (input as any).toDate();
    } catch {
      /* ignore */
    }
  }

  // {seconds, nanoseconds} o {_seconds, _nanoseconds}
  if (typeof input === "object" && input !== null) {
    const obj = input as any;
    const seconds = obj.seconds ?? obj.seconds;
    const nanos = obj.nanoseconds ?? obj.nanoseconds ?? 0;
    if (typeof seconds === "number") {
      const ms = seconds * 1000 + Math.floor(nanos / 1e6);
      return new Date(ms);
    }
  }

  // ISO string o epoch (number/string)
  if (typeof input === "string") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === "number") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}
