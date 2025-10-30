"use client";

import { useState } from "react";

import { Plus, Edit, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Referee {
  id: string;
  name: string;
  category: string;
  zone: string;
  rating: number;
}

export default function RefereesPage() {
  const [referees, setReferees] = useState<Referee[]>([
    { id: "1", name: "Juan Pérez", category: "TDP", zone: "Guadalajara", rating: 8.7 },
    { id: "2", name: "Carlos López", category: "Sub-17", zone: "Zapopan", rating: 9.1 },
    { id: "3", name: "Miguel Torres", category: "Sub-15", zone: "Tlaquepaque", rating: 8.3 },
  ]);

  const handleAdd = () => {
    // Aquí abrirías un modal o navegarías a una pantalla de registro
    console.log("Agregar árbitro");
  };

  const handleEdit = (id: string) => {
    console.log("Editar árbitro", id);
  };

  const handleDelete = (id: string) => {
    setReferees((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Árbitros</h1>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo árbitro
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de árbitros registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead>Calificación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referees.map((referee) => (
                <TableRow key={referee.id}>
                  <TableCell>{referee.name}</TableCell>
                  <TableCell>{referee.category}</TableCell>
                  <TableCell>{referee.zone}</TableCell>
                  <TableCell>{referee.rating}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="icon" variant="outline" onClick={() => handleEdit(referee.id)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="destructive" onClick={() => handleDelete(referee.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
