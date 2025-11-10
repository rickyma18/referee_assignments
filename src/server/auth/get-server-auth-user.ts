// =============================================
// src/server/auth/get-server-auth-user.ts
// =============================================

import { cookies } from "next/headers";

import { adminAuth } from "@/server/admin/firebase-admin";

export type ServerAuthUser = {
  uid: string;
  email?: string | null;
};

export async function getServerAuthUser(): Promise<ServerAuthUser> {
  // En Next 15, cookies() es async
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;
  if (!sessionCookie) {
    throw new Error("No hay sesión activa.");
  }

  // checkRevoked=true si quieres invalidar sesiones revocadas
  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

  return {
    uid: decoded.uid,
    email: (decoded as any)?.email ?? null,
  };
}
