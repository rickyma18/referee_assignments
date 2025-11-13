// NO pongas "use client" aquí

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { RefereesExcelUploader } from "../[refereeId]/upload/_components/referees-excel-uploader";

export default function ImportRefereesPage() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar árbitros desde Excel</h1>
          <p className="text-muted-foreground text-sm">
            Sube tu archivo con la información de los árbitros y valida los datos antes de confirmar.
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/dashboard/referees">Volver al listado</Link>
        </Button>
      </div>

      {/* Componente principal */}
      <RefereesExcelUploader />
    </div>
  );
}
