// src/lib/rbac.ts
import type { UserRole, RbacAction } from "@/types/roles";

type Matrix = Record<UserRole, Record<RbacAction, boolean>>;

// Matriz de permisos según criterios de aceptación
const MATRIX: Matrix = {
  SUPERUSUARIO: {
    "users.setRole": true,
    "designaciones.view": true,
    "designaciones.create": true,
    "designaciones.update": true,
    "designaciones.delete": true,
    "designaciones.override": true, // puede modificar lo del delegado
  },
  DELEGADO: {
    "users.setRole": false,
    "designaciones.view": true,
    "designaciones.create": true,
    "designaciones.update": true,
    "designaciones.delete": true,
    "designaciones.override": false,
  },
  ASISTENTE: {
    "users.setRole": false,
    "designaciones.view": true,
    "designaciones.create": false,
    "designaciones.update": false,
    "designaciones.delete": false,
    "designaciones.override": false,
  },
  ARBITRO: {
    "users.setRole": false,
    "designaciones.view": true,
    "designaciones.create": false,
    "designaciones.update": false,
    "designaciones.delete": false,
    "designaciones.override": false,
  },
};

export function can(role: UserRole | null | undefined, action: RbacAction): boolean {
  if (!role) return false;
  return !!MATRIX[role]?.[action];
}

// Atajos útiles para la UI
export const Can = {
  viewDesignaciones: (role?: UserRole | null) => can(role, "designaciones.view"),
  crudDesignaciones: (role?: UserRole | null) =>
    can(role, "designaciones.create") && can(role, "designaciones.update") && can(role, "designaciones.delete"),
  overrideDesignaciones: (role?: UserRole | null) => can(role, "designaciones.override"),
  setUserRole: (role?: UserRole | null) => can(role, "users.setRole"),
};
