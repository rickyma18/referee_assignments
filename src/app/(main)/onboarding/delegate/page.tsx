"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getActiveDelegates } from "@/data/delegates";
import { upsertUserDoc } from "@/data/users";
import { auth } from "@/lib/firebase";
import type { DelegateOption } from "@/types/delegate";

export default function OnboardingDelegatePage() {
  const router = useRouter();
  const [delegateId, setDelegateId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [user, setUser] = React.useState<{ uid: string; email: string | null } | null>(null);

  // Delegates state
  const [delegateOptions, setDelegateOptions] = React.useState<DelegateOption[]>([]);
  const [delegatesLoading, setDelegatesLoading] = React.useState(true);
  const [delegatesError, setDelegatesError] = React.useState<string | null>(null);

  // Escuchar auth state para obtener el usuario actual
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
      } else {
        // No hay usuario autenticado, redirigir a login
        router.replace("/auth/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Fetch delegates on mount
  React.useEffect(() => {
    let mounted = true;
    setDelegatesLoading(true);
    setDelegatesError(null);

    getActiveDelegates()
      .then((options) => {
        if (!mounted) return;
        setDelegateOptions(options);
        if (options.length === 0) {
          setDelegatesError("No hay delegaciones disponibles.");
        }
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("Error fetching delegates:", err);
        setDelegatesError("Error al cargar delegaciones.");
      })
      .finally(() => {
        if (mounted) setDelegatesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    if (!delegateId) {
      toast.error("Selecciona una delegacion.");
      return;
    }

    // Validación anti-manipulación: verificar que delegateId esté en las opciones cargadas
    const isValidDelegate = delegateOptions.some((opt) => opt.value === delegateId);
    if (!isValidDelegate) {
      toast.error("Delegacion invalida. Por favor, selecciona una delegacion de la lista.");
      return;
    }

    if (!user) {
      toast.error("No hay usuario autenticado.");
      return;
    }

    try {
      setLoading(true);

      // Actualizar userDoc con delegateId y allowedDelegateIds
      await upsertUserDoc({
        uid: user.uid,
        email: user.email ?? "",
        delegateId,
        allowedDelegateIds: [delegateId],
      });

      toast.success("Delegacion guardada correctamente.");
      router.replace("/dashboard/assignments");
    } catch (err) {
      console.error("Error guardando delegacion:", err);
      toast.error("No se pudo guardar la delegacion.");
    } finally {
      setLoading(false);
    }
  };

  const isFormDisabled = delegatesLoading || delegatesError !== null || delegateOptions.length === 0;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Selecciona tu delegacion</CardTitle>
          <CardDescription>
            Para continuar, necesitamos saber a que delegacion perteneces. Esto determinara los datos que podras ver en
            el sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delegateId">Delegacion</Label>
            {delegatesLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Cargando delegaciones...</span>
              </div>
            ) : delegatesError ? (
              <div className="text-destructive py-2 text-sm">{delegatesError}</div>
            ) : (
              <Select value={delegateId} onValueChange={setDelegateId}>
                <SelectTrigger id="delegateId">
                  <SelectValue placeholder="Selecciona tu delegacion" />
                </SelectTrigger>
                <SelectContent>
                  {delegateOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button className="w-full" onClick={handleSave} disabled={loading || !delegateId || isFormDisabled}>
            {loading ? "Guardando..." : "Continuar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
