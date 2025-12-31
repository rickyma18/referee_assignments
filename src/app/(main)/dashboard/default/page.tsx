// src/app/(main)/dashboard/default/page.tsx
import { unstable_noStore as noStore } from "next/cache";

import { AdminClaimsPanel } from "@/components/admin/admin-claims-panel";
import { DelegateSwitcher } from "@/components/delegate-switcher";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForbiddenError } from "@/server/auth/errors";
import { getDelegateContext } from "@/server/auth/get-delegate-context";
import { requireSuperuser } from "@/server/auth/require-role";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SuperuserDashboardPage() {
  noStore();

  // Route protection: solo SUPERUSUARIO
  try {
    await requireSuperuser();
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return (
        <div className="space-y-4 p-6">
          <h1 className="text-2xl font-semibold">Acceso restringido</h1>
          <p className="text-muted-foreground text-sm">
            Esta vista solo esta disponible para usuarios con rol <strong>SUPERUSUARIO</strong>.
          </p>
        </div>
      );
    }
    throw e;
  }

  // Obtener contexto actual
  const ctx = await getDelegateContext();

  return (
    <div className="@container/main flex flex-col gap-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Panel de Superusuario</h1>
        <p className="text-muted-foreground text-sm">Administra delegados y custom claims de usuarios.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 1: Delegate Switcher */}
        <Card>
          <CardHeader>
            <CardTitle>Delegado Activo</CardTitle>
            <CardDescription>Selecciona un delegado para ver sus datos o trabaja en modo global.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <DelegateSwitcher />
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-muted-foreground text-xs uppercase">Contexto actual</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">UID: {ctx.uid}</Badge>
                <Badge variant="default">Role: {ctx.role}</Badge>
                {ctx.effectiveDelegateId ? (
                  <Badge variant="secondary">DelegateId: {ctx.effectiveDelegateId}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Modo Global
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Admin Claims Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Administrar Claims</CardTitle>
            <CardDescription>Busca usuarios y modifica sus custom claims (role, delegateId).</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminClaimsPanel />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
