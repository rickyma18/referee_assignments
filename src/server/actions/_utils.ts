// en /server/actions/_utils.ts
import { Timestamp } from "firebase-admin/firestore";

export function serializeFirestore<T extends Record<string, any>>(obj: T): any {
  const walk = (v: any): any => {
    if (v == null) return v;
    if (v instanceof Timestamp) return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v?.toDate === "function") {
      try {
        return v.toDate().toISOString();
      } catch {
        return null;
      }
    }
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      // clona a plain object
      const out: any = {};
      for (const k of Object.keys(v)) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return walk(obj);
}
