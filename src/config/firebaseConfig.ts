// config/firebaseConfig.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Configuración del proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAovh0xvOZE4Ce5UdzZNiuEx7J8GfSyWeA",
  authDomain: "referee-assignments.firebaseapp.com",
  projectId: "referee-assignments",
  storageBucket: "referee-assignments.appspot.com",
  messagingSenderId: "345758641711",
  appId: "1:345758641711:web:7f0bb5e9a8afea9752e0da",
  measurementId: "G-1JC4PQYR1J",
};

// ✅ Inicializa Firebase solo una vez
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// ⚙️ Inicializa Analytics solo en el navegador y si está soportado
let analytics: Analytics | undefined;

if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

// 🔥 Inicializa Auth y Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);
export { app, analytics };
