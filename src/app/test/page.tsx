"use client";
import { db } from "@/config/firebaseConfig";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { useState } from "react";

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
        <button onClick={addTest} className="bg-blue-500 text-white px-4 py-2 rounded">
          Agregar documento
        </button>
        <button onClick={loadTests} className="bg-green-500 text-white px-4 py-2 rounded">
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
