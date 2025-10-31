import "dotenv/config";
import admin from "firebase-admin";

function initAdmin() {
  if (!admin.apps.length) admin.initializeApp({});
}

const DEFAULT_ROLE = "ARBITRO";
const VALID = ["SUPERUSUARIO", "DELEGADO", "ASISTENTE", "ARBITRO"];

async function backfill() {
  initAdmin();
  const auth = admin.auth();
  const db = admin.firestore();

  let nextPageToken;
  let totalProcessed = 0;
  let totalUpdated = 0;

  do {
    const { users, pageToken } = await auth.listUsers(1000, nextPageToken);
    for (const u of users) {
      totalProcessed++;
      const uid = u.uid;
      const email = u.email ?? `${uid}@no-email.local`;
      const displayName = u.displayName ?? null;
      const photoURL = u.photoURL ?? null;

      const ref = db.collection("users").doc(uid);
      const snap = await ref.get();

      const now = Date.now();

      if (!snap.exists) {
        await ref.set({
          uid,
          email,
          displayName,
          photoURL,
          role: DEFAULT_ROLE,
          scope: null,
          createdAt: now,
          updatedAt: now,
        });
        totalUpdated++;
        console.log(`+ created users/${uid} (role=${DEFAULT_ROLE})`);
        continue;
      }

      const data = snap.data() || {};
      const hasValidRole = data.role && VALID.includes(data.role);

      if (!hasValidRole) {
        await ref.set(
          {
            uid,
            email: data.email ?? email,
            displayName: data.displayName ?? displayName,
            photoURL: data.photoURL ?? photoURL,
            role: DEFAULT_ROLE,
            updatedAt: now,
            createdAt: data.createdAt ?? now,
          },
          { merge: true },
        );
        totalUpdated++;
        console.log(`~ updated users/${uid} -> role=${DEFAULT_ROLE}`);
      }
    }
    nextPageToken = pageToken;
  } while (nextPageToken);

  console.log(`\nBackfill listo. Procesados: ${totalProcessed}, actualizados: ${totalUpdated}`);
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
