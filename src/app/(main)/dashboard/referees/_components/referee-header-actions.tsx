"use client";

import Link from "next/link";

import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";

export function RefereeHeaderActions({ refereeId }: { refereeId: string }) {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;

  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO" || role === "ASISTENTE";

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/referees">Ver listado</Link>
      </Button>

      {canEdit && (
        <Button asChild size="sm">
          <Link href={`/dashboard/referees/${refereeId}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar árbitro
          </Link>
        </Button>
      )}
    </div>
  );
}
