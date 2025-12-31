/**
 * Script para administrar Custom Claims de Firebase Auth.
 *
 * Uso:
 *   npx tsx scripts/set-custom-claims.ts <command> <uid> [args...]
 *
 * Comandos:
 *   get <uid>                         - Mostrar claims actuales
 *   set-role <uid> <role>             - Setear solo role
 *   set-delegate <uid> <delegateId>   - Setear solo delegateId
 *   set-both <uid> <role> <delegateId> - Setear role y delegateId
 *   clear <uid>                       - Limpiar todos los claims
 *
 * Roles válidos: SUPERUSUARIO, DELEGADO, ASISTENTE, ARBITRO
 *
 * Ejemplos:
 *   npx tsx scripts/set-custom-claims.ts get abc123
 *   npx tsx scripts/set-custom-claims.ts set-role abc123 DELEGADO
 *   npx tsx scripts/set-custom-claims.ts set-both abc123 DELEGADO delegado_xyz
 *
 * Requisitos:
 *   - GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_CLOUD_CREDENTIALS_JSON en .env.local
 */

import { config } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Cargar variables de entorno desde .env.local
config({ path: ".env.local" });

// Roles válidos
const VALID_ROLES = ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"] as const;
type UserRole = (typeof VALID_ROLES)[number];

function isValidRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

// Inicializar Firebase Admin
function initAdmin() {
  if (getApps().length > 0) {
    return getAuth();
  }

  const jsonInline = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
  if (jsonInline) {
    try {
      const parsed = JSON.parse(jsonInline);
      initializeApp({ credential: cert(parsed) });
      return getAuth();
    } catch (e) {
      console.error("Error parsing GOOGLE_CLOUD_CREDENTIALS_JSON:", e);
    }
  }

  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac) {
    initializeApp();
    return getAuth();
  }

  throw new Error(
    "No se encontraron credenciales de Firebase Admin.\n" +
      "Configura GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_CLOUD_CREDENTIALS_JSON en .env.local",
  );
}

async function getClaims(uid: string) {
  const auth = initAdmin();
  const user = await auth.getUser(uid);
  console.log("\n=== Usuario ===");
  console.log("UID:", user.uid);
  console.log("Email:", user.email ?? "(sin email)");
  console.log("Display Name:", user.displayName ?? "(sin nombre)");
  console.log("\n=== Custom Claims ===");
  console.log(JSON.stringify(user.customClaims ?? {}, null, 2));
  return user.customClaims;
}

async function setRole(uid: string, role: UserRole) {
  const auth = initAdmin();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims ?? {};

  const newClaims = {
    ...currentClaims,
    role,
  };

  await auth.setCustomUserClaims(uid, newClaims);
  console.log(`✅ Role "${role}" seteado para usuario ${uid}`);
  console.log("Claims finales:", JSON.stringify(newClaims, null, 2));
}

async function setDelegateId(uid: string, delegateId: string) {
  const auth = initAdmin();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims ?? {};

  const newClaims = {
    ...currentClaims,
    delegateId,
  };

  await auth.setCustomUserClaims(uid, newClaims);
  console.log(`✅ DelegateId "${delegateId}" seteado para usuario ${uid}`);
  console.log("Claims finales:", JSON.stringify(newClaims, null, 2));
}

async function setBoth(uid: string, role: UserRole, delegateId: string) {
  const auth = initAdmin();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims ?? {};

  const newClaims = {
    ...currentClaims,
    role,
    delegateId,
  };

  await auth.setCustomUserClaims(uid, newClaims);
  console.log(`✅ Role "${role}" y delegateId "${delegateId}" seteados para usuario ${uid}`);
  console.log("Claims finales:", JSON.stringify(newClaims, null, 2));
}

async function clearClaims(uid: string) {
  const auth = initAdmin();
  await auth.setCustomUserClaims(uid, {});
  console.log(`✅ Claims limpiados para usuario ${uid}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const uid = args[1];

  if (!command) {
    console.log(`
Uso: npx tsx scripts/set-custom-claims.ts <command> <uid> [args...]

Comandos:
  get <uid>                         - Mostrar claims actuales
  set-role <uid> <role>             - Setear solo role
  set-delegate <uid> <delegateId>   - Setear solo delegateId
  set-both <uid> <role> <delegateId> - Setear role y delegateId
  clear <uid>                       - Limpiar todos los claims

Roles válidos: ${VALID_ROLES.join(", ")}
    `);
    process.exit(1);
  }

  if (!uid && command !== "help") {
    console.error("❌ UID requerido");
    process.exit(1);
  }

  try {
    switch (command) {
      case "get":
        await getClaims(uid);
        break;

      case "set-role": {
        const role = args[2];
        if (!role || !isValidRole(role)) {
          console.error(`❌ Role inválido. Roles válidos: ${VALID_ROLES.join(", ")}`);
          process.exit(1);
        }
        await setRole(uid, role);
        break;
      }

      case "set-delegate": {
        const delegateId = args[2];
        if (!delegateId) {
          console.error("❌ delegateId requerido");
          process.exit(1);
        }
        await setDelegateId(uid, delegateId);
        break;
      }

      case "set-both": {
        const role = args[2];
        const delegateId = args[3];
        if (!role || !isValidRole(role)) {
          console.error(`❌ Role inválido. Roles válidos: ${VALID_ROLES.join(", ")}`);
          process.exit(1);
        }
        if (!delegateId) {
          console.error("❌ delegateId requerido");
          process.exit(1);
        }
        await setBoth(uid, role, delegateId);
        break;
      }

      case "clear":
        await clearClaims(uid);
        break;

      default:
        console.error(`❌ Comando desconocido: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
