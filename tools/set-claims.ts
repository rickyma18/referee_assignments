// tools/set-claims.ts (Node, Admin SDK)
import * as admin from "firebase-admin";

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

async function setRole(uid: string, role: "SUPERUSUARIO" | "DELEGADO" | "ASISTENTE" | "ARBITRO") {
  await admin.auth().setCustomUserClaims(uid, { roles: [role] });
  console.log("OK claims for", uid, "=>", role);
}

setRole("UID_DEL_DELEGADO", "DELEGADO").then(() => {
  process.exit(0);
});
