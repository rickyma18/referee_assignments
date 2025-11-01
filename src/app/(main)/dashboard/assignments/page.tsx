"use client";

import Link from "next/link";
import { PlusCircle } from "lucide-react";

import RoleGate from "@/components/auth/role-gate";
import { useCurrentUser } from "@/hooks/use-current-user";

import { Button } from "@/components/ui/button";
import { DataTable } from "./_components/data-table";
import { makeColumns } from "./_components/columns";
import type { Designation } from "./_components/types";
import data from "./_components/designations.json";

export default function AssignmentsPage() {
  const { userDoc, firebaseUser } = useCurrentUser();
  const role = userDoc?.role ?? "DESCONOCIDO";

  // 🔹 Nombre con prioridad: Firestore → Firebase → correo
  const displayName =
    userDoc?.displayName || firebaseUser?.displayName || firebaseUser?.email?.split("@")[0] || "Usuario";

  const canEdit = ["SUPERUSUARIO", "DELEGADO"].includes(role as string);
  const designations = data as Designation[];

  return (
    <RoleGate require="VIEW_DESIGNS">
      <div className="@container/main flex flex-col gap-4 p-6 md:gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Designaciones</h1>
            <p className="text-muted-foreground text-sm">
              Bienvenido(a),{" "}
              <span className="font-medium">
                {displayName} ({role})
              </span>
              .
            </p>
          </div>

          {canEdit && (
            <Button asChild>
              <Link href="/assignments/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nueva designación
              </Link>
            </Button>
          )}
        </div>

        <DataTable
          data={designations}
          columns={makeColumns(canEdit)}
          searchableKeys={["homeTeam", "awayTeam", "center", "aa1", "aa2", "venue", "league"]}
        />

        <div className="pt-2">
          {canEdit ? (
            <p className="text-muted-foreground text-sm">Puedes crear o editar designaciones.</p>
          ) : (
            <p className="text-muted-foreground text-sm">Solo puedes visualizar tus designaciones.</p>
          )}
        </div>
      </div>
    </RoleGate>
  );
}
