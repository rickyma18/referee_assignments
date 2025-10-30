// src/types/user.ts

export type AppRole = "delegado" | "arbitro" | "admin";

export interface UserDoc {
  email: string;
  displayName?: string;
  role: AppRole;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  position?: "central" | "aa1" | "aa2" | "cuarto"; // opcional si lo usarás después
}
