import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { RefereeForm } from "../_components/referee-form";

export default async function NewRefereePage() {
  return (
    <div className="container max-w-4xl space-y-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nuevo árbitro</h1>
          <p className="text-muted-foreground text-sm">Registra un nuevo árbitro en el sistema.</p>
        </div>

        <Button variant="outline" asChild>
          <Link href="/dashboard/referees">Volver</Link>
        </Button>
      </div>

      <Separator />

      {/* Formulario */}
      <Card className="p-6">
        <RefereeForm />
      </Card>
    </div>
  );
}
