"use client";

import * as React from "react";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";

import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchableKeys?: (keyof TData)[];
};

export function DataTable<TData, TValue>({ columns, data, searchableKeys = [] }: Props<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!q) return data;
    const qn = q.toLowerCase();
    return data.filter((row: any) =>
      searchableKeys.some((k) =>
        String(row[k] ?? "")
          .toLowerCase()
          .includes(qn),
      ),
    );
  }, [data, q, searchableKeys]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-3">
      {searchableKeys.length ? (
        <div className="flex items-center justify-between">
          <Input
            placeholder="Buscar partido, árbitro, sede..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-[320px]"
          />
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
