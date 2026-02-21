// config/firebase-config.ts
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeApp, getApps, getApp } from "firebase/app";
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
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ⚙️ Inicializa Analytics solo en el navegador y si está soportado
if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {
      /* ignore */
    });
}

// 🔥 Inicializa Auth y Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);
