/**
 * @athyper/document-runtime — Document Header
 *
 * Rec 2: Document number as primary identity. Three version badges.
 * Rec 6: Metadata clusters (Identity / Parties / Scope).
 */
"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button, Separator } from "@athyper/ui/primitives";
import { type DocumentVersions, type StatusLane } from "@athyper/api-contracts/documents";
import { StatusLanes } from "../status/StatusLanes";

export interface MetadataCluster {
  label: string;
  items: Array<{ label: string; value: string | ReactNode }>;
}

export interface DocumentHeaderProps {
  documentNumber: string;
  subtitle?: string;
  description?: string;
  statusLabel: string;
  statusIntent?: "neutral" | "info" | "success" | "warning" | "error";
  versions?: DocumentVersions;
  statusLanes?: StatusLane[];
  clusters?: MetadataCluster[];
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function DocumentHeader({
  documentNumber,
  subtitle,
  description,
  statusLabel,
  statusIntent = "info",
  versions,
  statusLanes,
  clusters,
  actions,
  icon,
  className,
}: DocumentHeaderProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {/* Top row: title + actions */}
      <div className="flex items-start justify-between gap-4 p-5 pb-3">
        <div className="flex items-start gap-3">
          {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">{documentNumber}</h1>
              <Badge variant={statusIntent === "success" ? "success" : statusIntent === "warning" ? "warning" : statusIntent === "error" ? "destructive" : statusIntent === "info" ? "info" : "outline"}>
                {statusLabel}
              </Badge>
            </div>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}

            {versions && (
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="muted" className="text-[10px]">Doc Rev: {versions.doc_rev}</Badge>
                {versions.wf_snapshot_version != null && (
                  <Badge variant="muted" className="text-[10px]">WF Snapshot: v{versions.wf_snapshot_version}</Badge>
                )}
                {versions.lifecycle_version != null && (
                  <Badge variant="muted" className="text-[10px]">Lifecycle: v{versions.lifecycle_version}</Badge>
                )}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {/* Status lanes */}
      {statusLanes && statusLanes.length > 0 && (
        <div className="px-5 pb-3">
          <StatusLanes lanes={statusLanes} />
        </div>
      )}

      {/* Collapsible metadata clusters */}
      {clusters && clusters.length > 0 && (
        <>
          <Separator />
          {expanded && (
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
              {clusters.map((cluster) => (
                <div key={cluster.label}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {cluster.label}
                  </h3>
                  <dl className="space-y-1">
                    {cluster.items.map((item) => (
                      <div key={item.label} className="flex items-baseline gap-2">
                        <dt className="text-xs text-muted-foreground whitespace-nowrap">{item.label}:</dt>
                        <dd className="text-sm">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-center border-t py-1">
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground">
              {expanded ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
              {expanded ? "Collapse" : "Expand"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
