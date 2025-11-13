// src/app/(main)/dashboard/account/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, CalendarDays, Mail, MapPin, Phone, ShieldCheck, User as UserIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { adminDb } from "@/server/admin/firebase-admin";
import { getServerAuthUser } from "@/server/auth/get-server-auth-user";

export const dynamic = "force-dynamic";

// ------------------------------
// Helpers de fecha (reutilizados)
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

type AccountUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  role?: string | null;
  photoUrl?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export default async function AccountPage() {
  // 🔐 Obtener usuario autenticado desde la cookie __session
  let authUser: { uid: string; email?: string | null };
  try {
    authUser = await getServerAuthUser();
  } catch {
    return notFound(); // o redirige a login si ya lo tienes
  }

  // 🔎 Buscar doc en /users/{uid}
  const snap = await adminDb.collection("users").doc(authUser.uid).get();
  const data = (snap.data() as any) ?? {};

  const user: AccountUser = {
    id: authUser.uid,
    name: data.name ?? authUser.email ?? "Usuario sin nombre",
    email: authUser.email ?? data.email ?? null,
    phone: data.phone ?? null,
    city: data.city ?? data.municipality ?? null,
    role: data.role ?? "DESCONOCIDO",
    photoUrl: data.photoUrl ?? null,
    createdAt: data.createdAt ?? snap.createTime ?? null,
    updatedAt: data.updatedAt ?? snap.updateTime ?? null,
  };

  const initials =
    typeof user.name === "string" && user.name.trim().length > 0
      ? user.name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((p: string) => p[0]?.toUpperCase())
          .join("")
      : "US";

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      {/* Top bar: volver + acciones */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Cuenta</p>
            <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Ir al dashboard</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/account/edit">
              {/* Ajusta la ruta si tu página de edición es distinta */}
              <ShieldCheck className="mr-2 h-4 w-4" />
              Editar perfil
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
                {user.photoUrl && <AvatarImage src={user.photoUrl} alt={user.name ?? ""} />}
                <AvatarFallback className="text-lg font-semibold">
                  {user.photoUrl ? initials : <UserIcon className="h-6 w-6" />}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="truncate text-xl">{user.name ?? "Usuario sin nombre"}</CardTitle>

                  {user.role && (
                    <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
                      {user.role}
                    </Badge>
                  )}
                </div>

                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                  {user.email && (
                    <div className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                      <Mail className="h-3 w-3" />
                      <span className="max-w-[180px] truncate sm:max-w-[260px]">{user.email}</span>
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
                    <span>{user.phone ?? "Sin teléfono"}</span>
                  </div>

                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4" />
                    <span className="truncate">{user.email ?? "Sin correo"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium uppercase">Ubicación</p>

                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4" />
                    <span>{user.city ?? "Sin ciudad"}</span>
                  </div>

                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <CalendarDays className="h-4 w-4" />
                    <span>Cuenta creada: {formatDate(user.createdAt)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Info adicional / descripción */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Información adicional</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Aquí puedes ver un resumen de la información básica de tu cuenta. Desde la pantalla de edición podrás
                actualizar tus datos de contacto, ciudad de origen y cualquier otro detalle que quieras mantener al día.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
          {/* Estado de la cuenta */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Estado de la cuenta</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4 text-sm">
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span>ID de usuario</span>
                  <span className="font-mono text-xs">{user.id}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Rol principal</span>
                  <span className="font-medium">{user.role ?? "—"}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Fecha de creación</span>
                  <span className="font-medium">{formatDate(user.createdAt)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Última actualización</span>
                  <span className="font-medium">{formatDate(user.updatedAt)}</span>
                </div>
              </div>

              <Separator />

              <p className="text-xs leading-relaxed">
                Esta información puede ayudarte a depurar problemas de acceso, revisar tu rol actual dentro del sistema
                o validar que tu cuenta esté correctamente sincronizada con Firebase y Firestore.
              </p>
            </CardContent>
          </Card>

          {/* Placeholder para seguridad / sesiones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Seguridad y sesiones</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <p className="leading-relaxed">
                En el futuro aquí podrás revisar dispositivos activos, últimos inicios de sesión y opciones avanzadas de
                seguridad (cerrar todas las sesiones, activar 2FA, etc.).
              </p>
              <p className="text-xs">
                Por ahora, esta sección es sólo informativa. Cuando tengas listo el módulo de seguridad, la conectamos a
                los logs reales de autenticación.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
