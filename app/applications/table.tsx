"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { tableFeatures, useTable, type ColumnDef } from "@tanstack/react-table";
import {
  applicationStatusLabels,
  type ApplicationSummary,
} from "@/lib/applications/status";
import { RefreshApplications } from "./refresh";

const features = tableFeatures({});
const columns: ColumnDef<typeof features, ApplicationSummary>[] = [
  {
    accessorKey: "title",
    header: "Job title",
    cell: ({ row }) => (
      <Link
        className="font-medium underline-offset-4 hover:underline"
        href={`/applications/${row.original.id}`}
      >
        {row.original.title || "Untitled job"}
      </Link>
    ),
  },
  {
    accessorKey: "company",
    header: "Company",
    cell: ({ row }) => row.original.company || "Not provided",
  },
  {
    accessorKey: "sourceURL",
    header: "Original link",
    cell: ({ row }) => (
      <a
        className="block max-w-72 truncate underline underline-offset-4"
        href={row.original.sourceURL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {row.original.sourceURL}
      </a>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <span className="inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs">
        {applicationStatusLabels[row.original.status]}
      </span>
    ),
  },
];

export function ApplicationsTable({
  applications,
}: {
  applications: ApplicationSummary[];
}) {
  const router = useRouter();
  const table = useTable({
    features,
    columns,
    data: applications,
    getRowId: (row) => row.id,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {applications.length} application
          {applications.length === 1 ? "" : "s"}
        </p>

        <RefreshApplications />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Your applications. Select a job title to review its answers.
          </caption>
          <thead className="border-b bg-muted/50">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium"
                    key={header.id}
                  >
                    <table.FlexRender header={header} />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a, button"))
                    return;
                  router.push(`/applications/${row.original.id}`);
                }}
              >
                {row.getAllCells().map((cell) => (
                  <td className="px-4 py-4" key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
            {!applications.length && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-10 text-center text-muted-foreground"
                >
                  No applications yet.{" "}
                  <Link href="/" className="underline">
                    Apply to a job
                  </Link>{" "}
                  to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
