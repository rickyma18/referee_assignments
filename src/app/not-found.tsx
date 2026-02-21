"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex h-dvh flex-col items-center justify-center space-y-2 text-center">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="text-muted-foreground">La página que buscas no existe o fue movida.</p>
      <Button variant="outline" onClick={() => router.back()}>
        Volver
      </Button>
    </div>
  );
}
