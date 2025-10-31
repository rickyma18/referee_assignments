"use client";

import RoleGate from "@/components/auth/role-gate";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function AssignmentsPage() {
  const { userDoc } = useCurrentUser();
  const role = userDoc?.role ?? "DESCONOCIDO";

  return (
    <RoleGate require="VIEW_DESIGNS">
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-bold">Designaciones</h1>
        <p className="text-muted-foreground text-sm">
          Bienvenido, <span className="font-medium">{role}</span>.
        </p>

        {/* 🔹 Aquí pondremos la tabla real (ahora un mock simple) */}
        <div className="bg-background rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">Partidos asignados</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Fecha</th>
                <th className="p-2">Equipo Local</th>
                <th className="p-2">Equipo Visitante</th>
                <th className="p-2">Rol</th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-muted/30 border-b">
                <td className="p-2">10/11/2025</td>
                <td className="p-2">Pumas TDP</td>
                <td className="p-2">Atlas TDP</td>
                <td className="p-2">Árbitro central</td>
              </tr>
              <tr className="hover:bg-muted/30">
                <td className="p-2">17/11/2025</td>
                <td className="p-2">Tecos</td>
                <td className="p-2">Leones Negros</td>
                <td className="p-2">Asistente 1</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mensaje o botones condicionales */}
        {["SUPERUSUARIO", "DELEGADO"].includes(role) ? (
          <div className="pt-4">
            <p className="text-muted-foreground text-sm">Puedes crear o editar designaciones.</p>
          </div>
        ) : (
          <div className="pt-4">
            <p className="text-muted-foreground text-sm">Solo puedes visualizar tus designaciones.</p>
          </div>
        )}
      </div>
    </RoleGate>
  );
}
