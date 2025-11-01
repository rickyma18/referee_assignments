// Convierte cualquier Timestamp (admin/web/emulador) a number (ms)
// y vuelve todo objeto "plain" (sin prototipos raros).
type AnyObj = Record<string, any>;

const isTimestampLike = (v: any) =>
  v &&
  typeof v === "object" &&
  (typeof v.toMillis === "function" || // Admin/Web Timestamp
    (("seconds" in v || "_seconds" in v) && // Web v9
      ("nanoseconds" in v || "_nanoseconds" in v)) ||
    ("_seconds" in v && "_nanoseconds" in v)); // Emulador (debug)

const toMillis = (v: any): number => {
  if (typeof v?.toMillis === "function") return v.toMillis();

  // usa bracket notation para no disparar no-underscore-dangle
  // eslint-disable-next-line no-underscore-dangle
  const sec = v.seconds ?? v["_seconds"] ?? 0;
  // eslint-disable-next-line no-underscore-dangle
  const ns = v.nanoseconds ?? v["_nanoseconds"] ?? 0;

  return Math.round(sec * 1000 + ns / 1e6);
};

export function toPlain<T = AnyObj>(input: any): T {
  if (input == null) return input;

  if (Array.isArray(input)) {
    return input.map((i) => toPlain(i)) as unknown as T;
  }

  if (typeof input === "object") {
    if (isTimestampLike(input)) return toMillis(input) as unknown as T;

    const out: AnyObj = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = toPlain(v);
    }
    return out as T;
  }

  return input;
}
