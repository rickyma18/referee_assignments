// src/app/(main)/dashboard/account/edit/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { updateAccountAction } from "@/server/actions/account.actions";
import { adminDb } from "@/server/admin/firebase-admin";
import { getServerAuthUser } from "@/server/auth/get-server-auth-user";

export const dynamic = "force-dynamic";

// 👇 Wrapper para que cumpla con el tipo (Promise<void>)
const updateAccountFormAction = async (formData: FormData) => {
  "use server";

  const result = await updateAccountAction(formData);

  // Aquí podrías guardar el error en cookies/searchParams/etc si quieres mostrarlo
  if (!result.ok) {
    // Por ahora, igual regresamos a la cuenta (luego puedes mejorar UX)
    redirect("/dashboard/account?error=update-failed");
  }

  redirect("/dashboard/account");
};

export default async function EditAccountPage() {
  // 🔐 Validar sesión
  let authUser;
  try {
    authUser = await getServerAuthUser();
  } catch {
    return notFound();
  }

  // 🔎 Buscar usuario en Firestore
  const snap = await adminDb.collection("users").doc(authUser.uid).get();
  if (!snap.exists) return notFound();

  const data = snap.data() as any;

  // Campos actuales
  const initial = {
    displayName: data.displayName ?? "",
    photoURL: data.photoURL ?? "",
    scope: data.scope ?? "",
  };

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
          <Link href="/dashboard/account">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Cuenta</p>
          <h1 className="text-2xl font-semibold tracking-tight">Editar perfil</h1>
        </div>
      </div>

      {/* Formulario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Información personal</CardTitle>
        </CardHeader>

        <CardContent>
          <form action={updateAccountFormAction} className="space-y-6">
            <input type="hidden" name="uid" value={authUser.uid} />

            {/* Nombre */}
            <div className="space-y-1">
              <Label htmlFor="displayName">Nombre completo</Label>
              <Input
                id="displayName"
                name="displayName"
                defaultValue={initial.displayName}
                placeholder="Tu nombre"
                required
              />
            </div>

            {/* Foto */}
            <div className="space-y-1">
              <Label htmlFor="photoURL">URL de foto (opcional)</Label>
              <Input
                id="photoURL"
                name="photoURL"
                defaultValue={initial.photoURL}
                placeholder="https://..."
                type="url"
              />
            </div>

            {/* Scope */}
            <div className="space-y-1">
              <Label htmlFor="scope">Scope / etiqueta interna (opcional)</Label>
              <Input id="scope" name="scope" defaultValue={initial.scope} placeholder="Texto interno" />
            </div>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/account">Cancelar</Link>
              </Button>

              <Button type="submit">Guardar cambios</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
