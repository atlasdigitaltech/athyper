"use client";

import { useRouter } from "next/navigation";

import type { EntitySummary } from "@/lib/schema-manager/types";

import { ClassBadge } from "@/components/mesh/shared/ClassBadge";
import { StatusDot } from "@/components/mesh/shared/StatusDot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SchemaTableProps {
  entities: EntitySummary[];
  basePath: string;
}

export function SchemaTable({ entities, basePath }: SchemaTableProps) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Table</TableHead>
          <TableHead className="text-center">Version</TableHead>
          <TableHead className="text-center">Fields</TableHead>
          <TableHead className="text-center">Relations</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entities.map((entity) => {
          const version = entity.currentVersion;
          const status = version?.status ?? "draft";
          return (
            <TableRow
              key={entity.id}
              className="cursor-pointer"
              onClick={() => router.push(`${basePath}/${entity.name}`)}
            >
              <TableCell className="font-medium">{entity.name}</TableCell>
              <TableCell>
                <ClassBadge entityClass={entity.entityClass} />
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {entity.tableSchema}.{entity.tableName}
              </TableCell>
              <TableCell className="text-center">
                {version ? `v${version.versionNo}` : "—"}
              </TableCell>
              <TableCell className="text-center">{entity.fieldCount}</TableCell>
              <TableCell className="text-center">
                {entity.relationCount}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <StatusDot status={status} />
                  <span className="text-xs capitalize">{status}</span>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
