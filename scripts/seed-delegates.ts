// scripts/seed-delegates.ts
// Script manual para poblar la colección /delegates en Firestore.
// Ejecutar: npx tsx scripts/seed-delegates.ts
//
// IMPORTANTE: Este script NO se ejecuta automáticamente.
// Debe ejecutarse manualmente después de configurar credenciales de Firebase Admin.

import { getAdminDb } from "./_lib/firebase-admin";

const DELEGATES = [
  { id: "del_aguascalientes", name: "Aguascalientes", isActive: false, order: 1 },
  { id: "del_baja_california", name: "Baja California", isActive: false, order: 2 },
  { id: "del_baja_california_sur", name: "Baja California Sur", isActive: false, order: 3 },
  { id: "del_campeche", name: "Campeche", isActive: false, order: 4 },
  { id: "del_chiapas", name: "Chiapas", isActive: false, order: 5 },
  { id: "del_chihuahua", name: "Chihuahua", isActive: false, order: 6 },
  { id: "del_ciudad_de_mexico", name: "Ciudad de México", isActive: false, order: 7 },
  { id: "del_coahuila", name: "Coahuila", isActive: false, order: 8 },
  { id: "del_colima", name: "Colima", isActive: false, order: 9 },
  { id: "del_durango", name: "Durango", isActive: false, order: 10 },
  { id: "del_estado_de_mexico", name: "Estado de México", isActive: false, order: 11 },
  { id: "del_guanajuato", name: "Guanajuato", isActive: false, order: 12 },
  { id: "del_guerrero", name: "Guerrero", isActive: false, order: 13 },
  { id: "del_hidalgo", name: "Hidalgo", isActive: false, order: 14 },
  { id: "del_jalisco", name: "Jalisco", isActive: true, order: 15 },
  { id: "del_michoacan", name: "Michoacán", isActive: false, order: 16 },
  { id: "del_morelos", name: "Morelos", isActive: false, order: 17 },
  { id: "del_nayarit", name: "Nayarit", isActive: false, order: 18 },
  { id: "del_nuevo_leon", name: "Nuevo León", isActive: false, order: 19 },
  { id: "del_oaxaca", name: "Oaxaca", isActive: false, order: 20 },
  { id: "del_puebla", name: "Puebla", isActive: false, order: 21 },
  { id: "del_queretaro", name: "Querétaro", isActive: false, order: 22 },
  { id: "del_quintana_roo", name: "Quintana Roo", isActive: false, order: 23 },
  { id: "del_san_luis_potosi", name: "San Luis Potosí", isActive: false, order: 24 },
  { id: "del_sinaloa", name: "Sinaloa", isActive: false, order: 25 },
  { id: "del_sonora", name: "Sonora", isActive: false, order: 26 },
  { id: "del_tabasco", name: "Tabasco", isActive: false, order: 27 },
  { id: "del_tamaulipas", name: "Tamaulipas", isActive: false, order: 28 },
  { id: "del_tlaxcala", name: "Tlaxcala", isActive: false, order: 29 },
  { id: "del_veracruz", name: "Veracruz", isActive: false, order: 30 },
  { id: "del_yucatan", name: "Yucatán", isActive: false, order: 31 },
  { id: "del_zacatecas", name: "Zacatecas", isActive: false, order: 32 },
];

async function seed() {
  console.log("🌱 Iniciando seed de /delegates...\n");

  const db = getAdminDb();
  const delegatesRef = db.collection("delegates");

  for (const delegate of DELEGATES) {
    const { id, ...data } = delegate;
    const docRef = delegatesRef.doc(id);

    // Verificar si ya existe
    const existing = await docRef.get();
    if (existing.exists) {
      console.log(`⏭️  ${id}: ya existe, saltando...`);
      continue;
    }

    // Crear documento
    await docRef.set({
      ...data,
      createdAt: new Date().toISOString(),
    });
    console.log(`✅ ${id}: creado (${data.name})`);
  }

  console.log("\n🎉 Seed completado.");
}

seed().catch((err) => {
  console.error("❌ Error en seed:", err);
  process.exit(1);
});
