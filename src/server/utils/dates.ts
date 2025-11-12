// src/server/utils/dates.ts
import { DateTime } from "luxon";

export function toMexicoDate(fecha: string, hora: string): Date {
  // TZ MX: America/Mexico_City
  const dt = DateTime.fromISO(`${fecha}T${hora}`, { zone: "America/Mexico_City" });
  if (!dt.isValid) throw new Error("Fecha/Hora inválidas");
  return dt.toJSDate();
}
