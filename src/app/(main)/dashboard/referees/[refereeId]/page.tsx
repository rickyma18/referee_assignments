// src/app/(main)/dashboard/referees/[refereeId]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { CalendarDays, ArrowLeft, Pencil, Mail, Phone, MapPin, ShieldCheck, Flag } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getRefereeAction } from "@/server/actions/referees.actions";

import { RefStatusBadge } from "../_components/referee-status";

export const dynamic = "force-dynamic";

type Params = {
  refereeId: string;
};

// ------------------------------
// Helpers de fecha
// ------------------------------
function toDateSafe(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;

  if (typeof input === "object" && input !== null) {
    const obj = input as any;

    if (typeof obj.toDate === "function") {
      try {
        return obj.toDate();
      } catch {
        // ignore
      }
    }

    const seconds = obj.seconds ?? obj.seconds;
    const nanos = obj.nanoseconds ?? obj.nanoseconds ?? 0;
    if (typeof seconds === "number") {
      const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
      return new Date(ms);
    }
  }

  if (typeof input === "string") {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function formatDate(input: unknown): string {
  const d = toDateSafe(input);
  if (!d) return "—";
  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function RefereeProfilePage({ params }: { params: Promise<Params> }) {
  const { refereeId } = await params;

  if (!refereeId?.trim()) return notFound();

  // 👇 ahora respetamos el ActionResult
  const result = await getRefereeAction(refereeId);

  if (!result || !("ok" in result)) {
    return notFound();
  }

  if (!result.ok || !result.data) {
    return notFound();
  }

  const item = result.data;

  const status = (item.status ?? "DISPONIBLE") as "DISPONIBLE" | "DUDOSO" | "LESIONADO";

  const rolesAllowed: string[] = Array.isArray(item.rolesAllowed) ? item.rolesAllowed : [];

  const zones: string[] = Array.isArray(item.zones)
    ? item.zones.map((z: any) => (typeof z === "string" ? z : (z.name ?? z.id ?? "")))
    : [];

  const initials =
    typeof item.name === "string"
      ? item.name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((p: string) => p[0]?.toUpperCase())
          .join("")
      : "AR";

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      {/* Top bar: volver + acciones */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <Link href="/dashboard/referees">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Árbitros</p>
            <h1 className="text-2xl font-semibold tracking-tight">Perfil de árbitro</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/referees">Ver listado</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/dashboard/referees/${refereeId}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar árbitro
            </Link>
          </Button>
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* Columna izquierda */}
        <div className="space-y-6">
          {/* Cabecera del perfil */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-4 space-y-0">
              <Avatar className="h-16 w-16 border">
                {item.photoUrl && <AvatarImage src={item.photoUrl} alt={item.name ?? ""} />}
                <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="truncate text-xl">{item.name ?? "Sin nombre"}</CardTitle>
                  <RefStatusBadge status={status} />
                </div>

                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                  {item.category && (
                    <div className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                      <ShieldCheck className="h-3 w-3" />
                      {item.category}
                    </div>
                  )}

                  {rolesAllowed.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <Flag className="h-3 w-3" />
                      <span className="font-medium">Roles:</span>
                      {rolesAllowed.map((role) => (
                        <Badge key={role} variant="outline" className="rounded-full px-2 py-0 text-[11px]">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <Separator />

              {/* Contacto */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium uppercase">Contacto</p>

                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4" />
                    <span>{item.phone ?? "Sin teléfono"}</span>
                  </div>

                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4" />
                    <span className="truncate">{item.email ?? "Sin correo"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium uppercase">Origen</p>

                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4" />
                    <span>{item.city ?? "Sin ciudad"}</span>
                  </div>

                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <CalendarDays className="h-4 w-4" />
                    <span>Fecha de nacimiento: {item.birthDate ? formatDate(item.birthDate) : "—"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notas internas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Notas internas</CardTitle>
            </CardHeader>
            <CardContent>
              {item.notes ? (
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{item.notes}</p>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  No hay notas registradas para este árbitro. Puedes añadir detalles en la pantalla de edición
                  (disponibilidad especial, lesiones recientes, recomendaciones, etc.).
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
          {/* Zonas + metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Distribución y zonas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">Zonas asignadas</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {zones.length > 0 ? (
                    zones.map((z) =>
                      z ? (
                        <Badge key={z} variant="secondary" className="rounded-full px-2 py-0 text-[11px]">
                          {z}
                        </Badge>
                      ) : null,
                    )
                  ) : (
                    <p className="text-muted-foreground text-sm">Sin zonas asignadas aún.</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="text-muted-foreground grid gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Estado actual</span>
                  <RefStatusBadge status={status} />
                </div>

                <div className="flex items-center justify-between">
                  <span>Categoría</span>
                  <span className="font-medium">{item.category ?? "—"}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Creado</span>
                  <span className="font-medium">{formatDate(item.createdAt)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Última actualización</span>
                  <span className="font-medium">{formatDate(item.updatedAt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Placeholder resumen designaciones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Resumen de designaciones</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <p className="leading-relaxed">
                Aquí podrás ver un resumen de los partidos designados a este árbitro (partidos recientes, minutos
                arbitrados, distribución por rol, etc.).
              </p>
              <p className="text-xs">
                Por ahora, esta sección es sólo informativa. Cuando tengamos el módulo de designaciones conectado, la
                llenamos con datos reales.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
