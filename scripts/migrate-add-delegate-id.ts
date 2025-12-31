/**
 * Script de migración: Agregar delegateId a documentos legacy
 *
 * Uso:
 *   npm run migrate-delegate -- <command> [args...]
 *
 * Comandos:
 *   dry-run-leagues --delegate <id> [--query <text>] [--limit N]
 *   apply-leagues --delegate <id> [--query <text>] [--limit N]
 *   propagate-teams --delegate <id> [--apply]
 *   propagate-venues --delegate <id> [--apply]
 *   assign-referees --delegate <id> --ids <id1,id2,...> [--apply]
 *   assign-referees --delegate <id> --query <name> [--apply]
 *   report --delegate <id>
 *
 * Requisitos:
 *   - GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_CLOUD_CREDENTIALS_JSON en .env.local
 */

import { config } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

// Cargar variables de entorno
config({ path: ".env.local" });

// Colores para consola
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
};

function log(msg: string) {
  console.log(msg);
}

function logInfo(msg: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

function logSuccess(msg: string) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function logWarning(msg: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function logError(msg: string) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function logDryRun(msg: string) {
  console.log(`${colors.blue}[DRY-RUN]${colors.reset} ${msg}`);
}

// Inicializar Firebase Admin
function initAdmin(): Firestore {
  if (getApps().length > 0) {
    return getFirestore();
  }

  const jsonInline = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
  if (jsonInline) {
    try {
      const parsed = JSON.parse(jsonInline);
      initializeApp({ credential: cert(parsed) });
      return getFirestore();
    } catch (e) {
      console.error("Error parsing GOOGLE_CLOUD_CREDENTIALS_JSON:", e);
    }
  }

  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac) {
    initializeApp();
    return getFirestore();
  }

  throw new Error(
    "No se encontraron credenciales de Firebase Admin.\n" +
      "Configura GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_CLOUD_CREDENTIALS_JSON en .env.local",
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Busca en qué league está un groupId.
 * Como groups es subcolección de leagues, hay que iterar.
 */
async function findLeagueByGroupId(
  db: Firestore,
  groupId: string,
  delegateId?: string,
): Promise<{ leagueId: string; leagueName: string; delegateId: string | null } | null> {
  // Primero buscar en leagues del delegado (si se proporciona)
  const leaguesQuery = db.collection("leagues").select("name", "delegateId");

  if (delegateId) {
    // Primero intentar con las leagues del delegado
    const delegateLeagues = await db.collection("leagues").where("delegateId", "==", delegateId).get();

    for (const leagueDoc of delegateLeagues.docs) {
      const groupSnap = await db.collection("leagues").doc(leagueDoc.id).collection("groups").doc(groupId).get();

      if (groupSnap.exists) {
        return {
          leagueId: leagueDoc.id,
          leagueName: leagueDoc.data()?.name ?? "",
          delegateId: leagueDoc.data()?.delegateId ?? null,
        };
      }
    }
  }

  // Si no encontramos, buscar en todas las leagues
  const allLeagues = await db.collection("leagues").get();
  for (const leagueDoc of allLeagues.docs) {
    const groupSnap = await db.collection("leagues").doc(leagueDoc.id).collection("groups").doc(groupId).get();

    if (groupSnap.exists) {
      return {
        leagueId: leagueDoc.id,
        leagueName: leagueDoc.data()?.name ?? "",
        delegateId: leagueDoc.data()?.delegateId ?? null,
      };
    }
  }

  return null;
}

async function assignRefereesAll(delegateId: string, apply: boolean) {
  const db = initAdmin(); // ✅ asegura initializeApp()

  log("");
  log(`${colors.bright}=== ASSIGN REFEREES ALL ===${colors.reset}`);
  log(`Delegado: ${delegateId}`);
  log(apply ? "Modo: APPLY" : "Modo: DRY-RUN");

  const snap = await db.collection("referees").get();

  const legacy = snap.docs.filter((d) => {
    const data = d.data() as any;
    return !data?.delegateId;
  });

  log(`Referees total: ${snap.size}`);
  log(`Referees sin delegateId: ${legacy.length}`);

  if (!apply) {
    logDryRun(`Se actualizarían ${legacy.length} referees con delegateId="${delegateId}"`);
    logInfo("Usa --apply para ejecutar la migración");
    return;
  }

  if (legacy.length === 0) {
    logSuccess("Nada que migrar.");
    return;
  }

  // Batches de 500
  let updated = 0;
  for (let i = 0; i < legacy.length; i += 500) {
    const chunk = legacy.slice(i, i + 500);
    const batch = db.batch();

    for (const doc of chunk) {
      batch.update(doc.ref, {
        delegateId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    updated += chunk.length;
    logSuccess(`Batch aplicado: ${updated}/${legacy.length}`);
  }

  logSuccess(`Listo. Referees actualizados: ${updated}`);
}

// ============================================================================
// COMMAND: dry-run-leagues / apply-leagues
// ============================================================================

async function handleLeagues(args: string[], apply: boolean) {
  const delegateId = getArg(args, "--delegate");
  const query = getArg(args, "--query");
  const limitStr = getArg(args, "--limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  if (!delegateId) {
    logError("--delegate <delegateId> es requerido");
    process.exit(1);
  }

  const db = initAdmin();

  logInfo(`Buscando leagues sin delegateId...`);
  if (query) logInfo(`Filtro: "${query}"`);
  if (limit) logInfo(`Límite: ${limit}`);

  // Obtener todas las leagues sin delegateId
  const leaguesQuery = db.collection("leagues");
  const snapshot = await leaguesQuery.get();

  const candidates: Array<{ id: string; name: string; slug: string; region?: string; currentDelegateId?: string }> = [];

  const queryNorm = query ? normalizeForSearch(query) : null;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const currentDelegateId = data.delegateId;

    // Solo candidatos sin delegateId
    if (currentDelegateId) continue;

    const name = data.name ?? "";
    const slug = data.slug ?? "";
    const region = data.region ?? "";

    // Filtrar por query si se proporciona
    if (queryNorm) {
      const nameNorm = normalizeForSearch(name);
      const slugNorm = normalizeForSearch(slug);
      const regionNorm = normalizeForSearch(region);

      if (!nameNorm.includes(queryNorm) && !slugNorm.includes(queryNorm) && !regionNorm.includes(queryNorm)) {
        continue;
      }
    }

    candidates.push({
      id: doc.id,
      name,
      slug,
      region,
      currentDelegateId,
    });

    if (limit && candidates.length >= limit) break;
  }

  log("");
  log(`${colors.bright}=== LEAGUES SIN delegateId ===${colors.reset}`);
  log(`Encontradas: ${candidates.length}`);
  log("");

  if (candidates.length === 0) {
    logInfo("No hay leagues para actualizar");
    return;
  }

  for (const c of candidates) {
    log(`  • ${c.id}`);
    log(`    Name: ${c.name}`);
    log(`    Slug: ${c.slug}`);
    if (c.region) log(`    Region: ${c.region}`);
    log("");
  }

  if (!apply) {
    logDryRun(`Se actualizarían ${candidates.length} leagues con delegateId="${delegateId}"`);
    logInfo("Usa --apply para ejecutar la migración (o el comando apply-leagues)");
    return;
  }

  // Aplicar cambios
  logInfo(`Aplicando delegateId="${delegateId}" a ${candidates.length} leagues...`);

  const batch = db.batch();
  for (const c of candidates) {
    const ref = db.collection("leagues").doc(c.id);
    batch.update(ref, {
      delegateId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  logSuccess(`${candidates.length} leagues actualizadas`);
}

// ============================================================================
// COMMAND: propagate-teams
// ============================================================================

async function handlePropagateTeams(args: string[]) {
  const delegateId = getArg(args, "--delegate");
  const apply = args.includes("--apply");

  if (!delegateId) {
    logError("--delegate <delegateId> es requerido");
    process.exit(1);
  }

  const db = initAdmin();

  logInfo(`Buscando teams sin delegateId...`);

  // Obtener todos los teams sin delegateId
  const teamsSnapshot = await db.collection("teams").get();

  const candidates: Array<{
    teamId: string;
    teamName: string;
    groupId: string;
    leagueId: string;
    leagueName: string;
    leagueDelegateId: string | null;
    conflict?: string;
  }> = [];

  const skipped: Array<{ teamId: string; teamName: string; reason: string }> = [];

  // Cache de groupId -> leagueInfo
  const groupCache = new Map<string, { leagueId: string; leagueName: string; delegateId: string | null } | null>();

  for (const doc of teamsSnapshot.docs) {
    const data = doc.data();
    const currentDelegateId = data.delegateId;
    const groupId = data.groupId;
    const teamName = data.name ?? "";

    // Ya tiene delegateId
    if (currentDelegateId) {
      if (currentDelegateId !== delegateId) {
        skipped.push({
          teamId: doc.id,
          teamName,
          reason: `Ya tiene delegateId="${currentDelegateId}" (distinto)`,
        });
      }
      continue;
    }

    // No tiene groupId
    if (!groupId) {
      skipped.push({
        teamId: doc.id,
        teamName,
        reason: "No tiene groupId",
      });
      continue;
    }

    // Buscar league del group
    let leagueInfo = groupCache.get(groupId);
    if (leagueInfo === undefined) {
      leagueInfo = await findLeagueByGroupId(db, groupId, delegateId);
      groupCache.set(groupId, leagueInfo);
    }

    if (!leagueInfo) {
      skipped.push({
        teamId: doc.id,
        teamName,
        reason: `No se encontró league para groupId="${groupId}"`,
      });
      continue;
    }

    // Verificar que la league pertenece al delegado
    if (leagueInfo.delegateId !== delegateId) {
      skipped.push({
        teamId: doc.id,
        teamName,
        reason: `League "${leagueInfo.leagueName}" tiene delegateId="${leagueInfo.delegateId}" (distinto)`,
      });
      continue;
    }

    candidates.push({
      teamId: doc.id,
      teamName,
      groupId,
      leagueId: leagueInfo.leagueId,
      leagueName: leagueInfo.leagueName,
      leagueDelegateId: leagueInfo.delegateId,
    });
  }

  log("");
  log(`${colors.bright}=== TEAMS A MIGRAR ===${colors.reset}`);
  log(`Candidatos: ${candidates.length}`);
  log(`Omitidos: ${skipped.length}`);
  log("");

  if (candidates.length > 0) {
    log(`${colors.cyan}Candidatos:${colors.reset}`);
    for (const c of candidates.slice(0, 20)) {
      log(`  • ${c.teamId} - ${c.teamName}`);
      log(`    League: ${c.leagueName} (${c.leagueId})`);
    }
    if (candidates.length > 20) {
      log(`  ... y ${candidates.length - 20} más`);
    }
    log("");
  }

  if (skipped.length > 0) {
    log(`${colors.yellow}Omitidos:${colors.reset}`);
    for (const s of skipped.slice(0, 10)) {
      log(`  • ${s.teamId} - ${s.teamName}`);
      log(`    Razón: ${s.reason}`);
    }
    if (skipped.length > 10) {
      log(`  ... y ${skipped.length - 10} más`);
    }
    log("");
  }

  if (candidates.length === 0) {
    logInfo("No hay teams para actualizar");
    return;
  }

  if (!apply) {
    logDryRun(`Se actualizarían ${candidates.length} teams con delegateId="${delegateId}"`);
    logInfo("Usa --apply para ejecutar la migración");
    return;
  }

  // Aplicar cambios en batches de 500
  logInfo(`Aplicando delegateId="${delegateId}" a ${candidates.length} teams...`);

  const batchSize = 500;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = db.batch();
    const chunk = candidates.slice(i, i + batchSize);

    for (const c of chunk) {
      const ref = db.collection("teams").doc(c.teamId);
      batch.update(ref, {
        delegateId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    logSuccess(`Batch ${Math.floor(i / batchSize) + 1}: ${chunk.length} teams actualizados`);
  }

  logSuccess(`Total: ${candidates.length} teams actualizados`);
}

// ============================================================================
// COMMAND: propagate-venues
// ============================================================================

async function handlePropagateVenues(args: string[]) {
  const delegateId = getArg(args, "--delegate");
  const apply = args.includes("--apply");

  if (!delegateId) {
    logError("--delegate <delegateId> es requerido");
    process.exit(1);
  }

  const db = initAdmin();

  logInfo(`Buscando venues sin delegateId...`);

  const venuesSnapshot = await db.collection("venues").get();

  const candidates: Array<{
    venueId: string;
    venueName: string;
    leagueId: string;
    leagueName: string;
  }> = [];

  const skipped: Array<{ venueId: string; venueName: string; reason: string }> = [];

  // Cache de groupId -> leagueInfo
  const groupCache = new Map<string, { leagueId: string; leagueName: string; delegateId: string | null } | null>();

  // Cache de leagueId -> leagueInfo
  const leagueCache = new Map<string, { leagueName: string; delegateId: string | null } | null>();

  for (const doc of venuesSnapshot.docs) {
    const data = doc.data();
    const currentDelegateId = data.delegateId;
    const leagueId = data.leagueId;
    const groupId = data.groupId;
    const venueName = data.name ?? "";

    // Ya tiene delegateId
    if (currentDelegateId) {
      if (currentDelegateId !== delegateId) {
        skipped.push({
          venueId: doc.id,
          venueName,
          reason: `Ya tiene delegateId="${currentDelegateId}" (distinto)`,
        });
      }
      continue;
    }

    let resolvedLeagueId: string | null = null;
    let resolvedLeagueName: string = "";
    let resolvedDelegateId: string | null = null;

    // Intentar resolver por leagueId directo
    if (leagueId) {
      let leagueInfo = leagueCache.get(leagueId);
      if (leagueInfo === undefined) {
        const leagueSnap = await db.collection("leagues").doc(leagueId).get();
        if (leagueSnap.exists) {
          const leagueData = leagueSnap.data()!;
          leagueInfo = {
            leagueName: leagueData.name ?? "",
            delegateId: leagueData.delegateId ?? null,
          };
        } else {
          leagueInfo = null;
        }
        leagueCache.set(leagueId, leagueInfo);
      }

      if (leagueInfo) {
        resolvedLeagueId = leagueId;
        resolvedLeagueName = leagueInfo.leagueName;
        resolvedDelegateId = leagueInfo.delegateId;
      }
    }

    // Si no hay leagueId, intentar por groupId
    if (!resolvedLeagueId && groupId) {
      let groupInfo = groupCache.get(groupId);
      if (groupInfo === undefined) {
        groupInfo = await findLeagueByGroupId(db, groupId, delegateId);
        groupCache.set(groupId, groupInfo);
      }

      if (groupInfo) {
        resolvedLeagueId = groupInfo.leagueId;
        resolvedLeagueName = groupInfo.leagueName;
        resolvedDelegateId = groupInfo.delegateId;
      }
    }

    if (!resolvedLeagueId) {
      skipped.push({
        venueId: doc.id,
        venueName,
        reason: "No se pudo resolver league (sin leagueId ni groupId válido)",
      });
      continue;
    }

    if (resolvedDelegateId !== delegateId) {
      skipped.push({
        venueId: doc.id,
        venueName,
        reason: `League "${resolvedLeagueName}" tiene delegateId="${resolvedDelegateId}" (distinto)`,
      });
      continue;
    }

    candidates.push({
      venueId: doc.id,
      venueName,
      leagueId: resolvedLeagueId,
      leagueName: resolvedLeagueName,
    });
  }

  log("");
  log(`${colors.bright}=== VENUES A MIGRAR ===${colors.reset}`);
  log(`Candidatos: ${candidates.length}`);
  log(`Omitidos: ${skipped.length}`);
  log("");

  if (candidates.length > 0) {
    log(`${colors.cyan}Candidatos:${colors.reset}`);
    for (const c of candidates.slice(0, 20)) {
      log(`  • ${c.venueId} - ${c.venueName}`);
      log(`    League: ${c.leagueName}`);
    }
    if (candidates.length > 20) {
      log(`  ... y ${candidates.length - 20} más`);
    }
    log("");
  }

  if (skipped.length > 0) {
    log(`${colors.yellow}Omitidos:${colors.reset}`);
    for (const s of skipped.slice(0, 10)) {
      log(`  • ${s.venueId} - ${s.venueName}`);
      log(`    Razón: ${s.reason}`);
    }
    if (skipped.length > 10) {
      log(`  ... y ${skipped.length - 10} más`);
    }
    log("");
  }

  if (candidates.length === 0) {
    logInfo("No hay venues para actualizar");
    return;
  }

  if (!apply) {
    logDryRun(`Se actualizarían ${candidates.length} venues con delegateId="${delegateId}"`);
    logInfo("Usa --apply para ejecutar la migración");
    return;
  }

  // Aplicar cambios
  logInfo(`Aplicando delegateId="${delegateId}" a ${candidates.length} venues...`);

  const batchSize = 500;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = db.batch();
    const chunk = candidates.slice(i, i + batchSize);

    for (const c of chunk) {
      const ref = db.collection("venues").doc(c.venueId);
      batch.update(ref, {
        delegateId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    logSuccess(`Batch ${Math.floor(i / batchSize) + 1}: ${chunk.length} venues actualizados`);
  }

  logSuccess(`Total: ${candidates.length} venues actualizados`);
}

// ============================================================================
// COMMAND: assign-referees
// ============================================================================

async function handleAssignReferees(args: string[]) {
  const delegateId = getArg(args, "--delegate");
  const idsArg = getArg(args, "--ids");
  const queryArg = getArg(args, "--query");
  const apply = args.includes("--apply");

  if (!delegateId) {
    logError("--delegate <delegateId> es requerido");
    process.exit(1);
  }

  if (!idsArg && !queryArg) {
    logError("Se requiere --ids <id1,id2,...> o --query <name>");
    process.exit(1);
  }

  const db = initAdmin();

  const candidates: Array<{ id: string; name: string; currentDelegateId?: string }> = [];
  const skipped: Array<{ id: string; name: string; reason: string }> = [];

  if (idsArg) {
    // Buscar por IDs específicos
    const ids = idsArg.split(",").map((id) => id.trim());
    logInfo(`Buscando ${ids.length} referees por ID...`);

    for (const id of ids) {
      const snap = await db.collection("referees").doc(id).get();
      if (!snap.exists) {
        skipped.push({ id, name: "(no encontrado)", reason: "Documento no existe" });
        continue;
      }

      const data = snap.data()!;
      const currentDelegateId = data.delegateId;
      const name = data.name ?? "";

      if (currentDelegateId) {
        if (currentDelegateId !== delegateId) {
          skipped.push({ id, name, reason: `Ya tiene delegateId="${currentDelegateId}" (distinto)` });
        } else {
          skipped.push({ id, name, reason: "Ya tiene el delegateId correcto" });
        }
        continue;
      }

      candidates.push({ id, name, currentDelegateId });
    }
  } else if (queryArg) {
    // Buscar por nombre
    const queryNorm = normalizeForSearch(queryArg);
    logInfo(`Buscando referees con nombre que contiene "${queryArg}"...`);

    const snapshot = await db.collection("referees").get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const name = data.name ?? "";
      const nameLc = data.name_lc ?? normalizeForSearch(name);
      const currentDelegateId = data.delegateId;

      if (!nameLc.includes(queryNorm)) continue;

      if (currentDelegateId) {
        if (currentDelegateId !== delegateId) {
          skipped.push({ id: doc.id, name, reason: `Ya tiene delegateId="${currentDelegateId}" (distinto)` });
        }
        continue;
      }

      candidates.push({ id: doc.id, name, currentDelegateId });
    }
  }

  log("");
  log(`${colors.bright}=== REFEREES A ASIGNAR ===${colors.reset}`);
  log(`Candidatos: ${candidates.length}`);
  log(`Omitidos: ${skipped.length}`);
  log("");

  if (candidates.length > 0) {
    log(`${colors.cyan}Candidatos:${colors.reset}`);
    for (const c of candidates) {
      log(`  • ${c.id} - ${c.name}`);
    }
    log("");
  }

  if (skipped.length > 0) {
    log(`${colors.yellow}Omitidos:${colors.reset}`);
    for (const s of skipped) {
      log(`  • ${s.id} - ${s.name}`);
      log(`    Razón: ${s.reason}`);
    }
    log("");
  }

  if (candidates.length === 0) {
    logInfo("No hay referees para asignar");
    return;
  }

  if (!apply) {
    logDryRun(`Se asignarían ${candidates.length} referees a delegateId="${delegateId}"`);
    logInfo("Usa --apply para ejecutar la asignación");
    return;
  }

  // Aplicar cambios
  logInfo(`Asignando delegateId="${delegateId}" a ${candidates.length} referees...`);

  const batch = db.batch();
  for (const c of candidates) {
    const ref = db.collection("referees").doc(c.id);
    batch.update(ref, {
      delegateId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  logSuccess(`${candidates.length} referees asignados`);
}

// ============================================================================
// COMMAND: report
// ============================================================================

async function handleReport(args: string[]) {
  const delegateId = getArg(args, "--delegate");

  if (!delegateId) {
    logError("--delegate <delegateId> es requerido");
    process.exit(1);
  }

  const db = initAdmin();

  log("");
  log(`${colors.bright}=== REPORTE MULTI-TENANT ===${colors.reset}`);
  log(`Delegado: ${delegateId}`);
  log("");

  // Leagues
  const leaguesSnapshot = await db.collection("leagues").get();
  let leaguesWithDelegate = 0;
  let leaguesWithOther = 0;
  let leaguesWithoutDelegate = 0;

  for (const doc of leaguesSnapshot.docs) {
    const did = doc.data().delegateId;
    if (!did) leaguesWithoutDelegate++;
    else if (did === delegateId) leaguesWithDelegate++;
    else leaguesWithOther++;
  }

  log(`${colors.cyan}LEAGUES:${colors.reset}`);
  log(`  • Con delegateId="${delegateId}": ${leaguesWithDelegate}`);
  log(`  • Con otro delegateId: ${leaguesWithOther}`);
  log(`  • Sin delegateId: ${leaguesWithoutDelegate}`);
  log("");

  // Teams
  const teamsSnapshot = await db.collection("teams").get();
  let teamsWithDelegate = 0;
  let teamsWithOther = 0;
  let teamsWithoutDelegate = 0;

  for (const doc of teamsSnapshot.docs) {
    const did = doc.data().delegateId;
    if (!did) teamsWithoutDelegate++;
    else if (did === delegateId) teamsWithDelegate++;
    else teamsWithOther++;
  }

  log(`${colors.cyan}TEAMS:${colors.reset}`);
  log(`  • Con delegateId="${delegateId}": ${teamsWithDelegate}`);
  log(`  • Con otro delegateId: ${teamsWithOther}`);
  log(`  • Sin delegateId: ${teamsWithoutDelegate}`);
  log("");

  // Referees
  const refereesSnapshot = await db.collection("referees").get();
  let refereesWithDelegate = 0;
  let refereesWithOther = 0;
  let refereesWithoutDelegate = 0;

  for (const doc of refereesSnapshot.docs) {
    const did = doc.data().delegateId;
    if (!did) refereesWithoutDelegate++;
    else if (did === delegateId) refereesWithDelegate++;
    else refereesWithOther++;
  }

  log(`${colors.cyan}REFEREES:${colors.reset}`);
  log(`  • Con delegateId="${delegateId}": ${refereesWithDelegate}`);
  log(`  • Con otro delegateId: ${refereesWithOther}`);
  log(`  • Sin delegateId: ${refereesWithoutDelegate}`);
  log("");

  // Venues
  const venuesSnapshot = await db.collection("venues").get();
  let venuesWithDelegate = 0;
  let venuesWithOther = 0;
  let venuesWithoutDelegate = 0;

  for (const doc of venuesSnapshot.docs) {
    const did = doc.data().delegateId;
    if (!did) venuesWithoutDelegate++;
    else if (did === delegateId) venuesWithDelegate++;
    else venuesWithOther++;
  }

  log(`${colors.cyan}VENUES:${colors.reset}`);
  log(`  • Con delegateId="${delegateId}": ${venuesWithDelegate}`);
  log(`  • Con otro delegateId: ${venuesWithOther}`);
  log(`  • Sin delegateId: ${venuesWithoutDelegate}`);
  log("");

  // Resumen
  const totalWithout = leaguesWithoutDelegate + teamsWithoutDelegate + refereesWithoutDelegate + venuesWithoutDelegate;
  if (totalWithout === 0) {
    logSuccess("Todos los documentos tienen delegateId asignado");
  } else {
    logWarning(`${totalWithout} documentos aún sin delegateId`);
  }
}

// ============================================================================
// CLI
// ============================================================================

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx === args.length - 1) return undefined;
  return args[idx + 1];
}

function printHelp() {
  log(`
${colors.bright}Migración Multi-tenant: Agregar delegateId${colors.reset}

${colors.cyan}Uso:${colors.reset}
  npm run migrate-delegate -- <command> [args...]

${colors.cyan}Comandos:${colors.reset}

  ${colors.green}dry-run-leagues${colors.reset} --delegate <id> [--query <text>] [--limit N]
    Lista leagues sin delegateId que se actualizarían.

  ${colors.green}apply-leagues${colors.reset} --delegate <id> [--query <text>] [--limit N]
    Actualiza leagues sin delegateId con el delegateId especificado.

  ${colors.green}propagate-teams${colors.reset} --delegate <id> [--apply]
    Propaga delegateId a teams basándose en la league de su grupo.
    Por defecto es dry-run; usa --apply para ejecutar.

  ${colors.green}propagate-venues${colors.reset} --delegate <id> [--apply]
    Propaga delegateId a venues basándose en su leagueId/groupId.
    Por defecto es dry-run; usa --apply para ejecutar.

  ${colors.green}assign-referees${colors.reset} --delegate <id> --ids <id1,id2,...> [--apply]
  ${colors.green}assign-referees${colors.reset} --delegate <id> --query <name> [--apply]
    Asigna delegateId a referees específicos (por IDs o búsqueda de nombre).
    Por defecto es dry-run; usa --apply para ejecutar.

  ${colors.green}report${colors.reset} --delegate <id>
    Muestra reporte de documentos con/sin delegateId.

${colors.cyan}Ejemplos:${colors.reset}
  npm run migrate-delegate -- dry-run-leagues --delegate del_abc123 --limit 5
  npm run migrate-delegate -- apply-leagues --delegate del_abc123 --query "liga premier"
  npm run migrate-delegate -- propagate-teams --delegate del_abc123 --apply
  npm run migrate-delegate -- assign-referees --delegate del_abc123 --query "garcia" --apply
  npm run migrate-delegate -- report --delegate del_abc123
  `);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help") {
    printHelp();
    process.exit(0);
  }

  try {
    switch (command) {
      case "dry-run-leagues":
        await handleLeagues(args, false);
        break;

      case "apply-leagues":
        await handleLeagues(args, true);
        break;

      case "propagate-teams":
        await handlePropagateTeams(args);
        break;

      case "propagate-venues":
        await handlePropagateVenues(args);
        break;

      case "assign-referees":
        await handleAssignReferees(args);
        break;

      case "report":
        await handleReport(args);
        break;

      case "assign-referees-all": {
        const delegateId = getArg(args, "--delegate");
        const apply = args.includes("--apply");
        if (!delegateId) throw new Error("Falta --delegate <id>");
        await assignRefereesAll(delegateId, apply);
        break;
      }

      default:
        logError(`Comando desconocido: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    logError(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
