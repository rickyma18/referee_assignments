// src/app/(main)/dashboard/referees/[refereeId]/edit/page.tsx
import { notFound } from "next/navigation";

import { Link } from "lucide-react";

import { RefereeForm } from "@/app/(main)/dashboard/referees/_components/referee-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getRefereeAction } from "@/server/actions/referees.actions";

export const dynamic = "force-dynamic";

export default async function EditRefereePage({ params }: { params: Promise<{ refereeId: string }> }) {
  const { refereeId } = await params;
  if (!refereeId?.trim()) return notFound();

  const res = await getRefereeAction(refereeId); // ActionResult
  if (!res || res.ok === false || !("data" in res) || !res.data) return notFound();

  const item = res.data; // <- POJO serializado, no Timestamps/clases

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editar árbitro</h1>
          <p className="text-muted-foreground text-sm">Modifica los datos del árbitro y guarda los cambios.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/referees">Volver</Link>
        </Button>
      </div>

      <Separator />

      <Card className="p-6">
        <RefereeForm key={item.id} initial={item} canEdit />
      </Card>
    </div>
  );
}
