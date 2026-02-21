"use client";
import { useState } from "react";

import { collection, addDoc, getDocs } from "firebase/firestore";

import { db } from "@/config/firebase-config";

export default function TestPage() {
  const [data, setData] = useState<any[]>([]);

  const addTest = async () => {
    await addDoc(collection(db, "tests"), {
      message: "Hola Firebase 👋",
      createdAt: new Date(),
    });
    alert("Documento agregado con éxito!");
  };

  const loadTests = async () => {
    const snapshot = await getDocs(collection(db, "tests"));
    const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setData(list);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Prueba Firestore</h1>
      <div className="mt-4 flex gap-4">
        <button onClick={addTest} className="rounded bg-blue-500 px-4 py-2 text-white">
          Agregar documento
        </button>
        <button onClick={loadTests} className="rounded bg-green-500 px-4 py-2 text-white">
          Cargar documentos
        </button>
      </div>
      <ul className="mt-6 space-y-2">
        {data.map((item) => (
          <li key={item.id} className="border-b py-2">
            {item.message} — {new Date(item.createdAt.seconds * 1000).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
