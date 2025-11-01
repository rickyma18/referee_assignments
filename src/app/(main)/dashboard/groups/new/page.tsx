"use client";

import RoleGate from "@/components/auth/role-gate";
import { GroupForm } from "../_components/group-form";
import { useCurrentUser } from "@/hooks/use-current-user";
import Link from "next/link";

export default function NewGroupPage() {
  const { userDoc } = useCurrentUser();
  const role = (userDoc?.role ?? "DESCONOCIDO") as string;
  const canEdit = role === "SUPERUSUARIO" || role === "DELEGADO";

  return (
    <RoleGate require="VIEW_DESIGNS">
      {canEdit ? (
        <GroupForm />
      ) : (
        <div className="space-y-2 p-6">
          <p className="text-sm">No tienes permisos para crear grupos.</p>
          <Link className="text-sm underline" href="/dashboard/groups">
            Volver
          </Link>
        </div>
      )}
    </RoleGate>
  );
}
