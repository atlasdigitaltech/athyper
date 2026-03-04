"use client";

import { FileText, GitBranch, Layers } from "lucide-react";
import Link from "next/link";

import type { EntitySummary } from "@/lib/schema-manager/types";

import { KindBadge } from "@/components/mesh/shared/KindBadge";
import { StatusDot } from "@/components/mesh/shared/StatusDot";
import { Card, CardContent } from "@/components/ui/card";
import { KIND_BORDER } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

interface SchemaCardProps {
  entity: EntitySummary;
  basePath: string;
}

export function SchemaCard({ entity, basePath }: SchemaCardProps) {
  const version = entity.currentVersion;
  const status = version?.status ?? "draft";
  const borderColor = KIND_BORDER[entity.kind] ?? "";

  return (
    <Link href={`${basePath}/${entity.name}`}>
      <Card
        className={cn(
          "group h-full border-l-4 transition-all hover:shadow-md hover:border-foreground/20",
          borderColor,
        )}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                {entity.name}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <KindBadge kind={entity.kind} />
                {version && (
                  <span className="text-xs text-muted-foreground">
                    v{version.versionNo}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusDot status={status} />
              <span className="text-xs text-muted-foreground capitalize">
                {status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" />
              {entity.fieldCount} fields
            </span>
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-3" />
              {entity.relationCount} relations
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" />
              {entity.tableSchema}.{entity.tableName}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
