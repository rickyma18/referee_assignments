import { columns } from "./_components/columns";
import { DataTable } from "./_components/data-table";
import data from "./_components/designations.json";
import { Designation } from "./_components/types";

export default function Page() {
  const designations = data as Designation[];

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Aquí puedes mantener tus <SectionCards /> y <ChartAreaInteractive /> si quieres */}
      {/* <SectionCards /> */}
      {/* <ChartAreaInteractive /> */}

      <h1 className="text-2xl font-bold tracking-tight">Designaciones</h1>
      <DataTable
        data={designations}
        columns={columns}
        searchableKeys={["homeTeam", "awayTeam", "center", "aa1", "aa2", "venue", "league"]}
      />
    </div>
  );
}
