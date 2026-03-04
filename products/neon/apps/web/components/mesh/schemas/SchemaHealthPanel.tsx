"use client";

import { AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import { useMemo } from "react";

import type { EntitySummary } from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";

// ─── Health Check Types ───────────────────────────────────────

interface HealthIssue {
  level: "info" | "warning" | "error";
  entity: string;
  message: string;
}

// ─── Health Analysis ──────────────────────────────────────────

function analyzeHealth(entities: EntitySummary[]): HealthIssue[] {
  const issues: HealthIssue[] = [];

  for (const entity of entities) {
    // No version
    if (!entity.currentVersion) {
      issues.push({
        level: "error",
        entity: entity.name,
        message: "No version defined",
      });
      continue;
    }

    // Draft pending publish
    if (entity.currentVersion.status === "draft") {
      issues.push({
        level: "info",
        entity: entity.name,
        message: `Draft v${entity.currentVersion.versionNo} pending publish`,
      });
    }

    // Archived/deprecated
    if (entity.currentVersion.status === "archived") {
      issues.push({
        level: "warning",
        entity: entity.name,
        message: "Current version is archived/deprecated",
      });
    }

    // No fields
    if (entity.fieldCount === 0) {
      issues.push({
        level: "warning",
        entity: entity.name,
        message: "No fields defined",
      });
    }

    // Inactive entity
    if (!entity.isActive) {
      issues.push({
        level: "warning",
        entity: entity.name,
        message: "Entity is inactive",
      });
    }
  }

  return issues;
}

// ─── Health Panel ─────────────────────────────────────────────

interface SchemaHealthPanelProps {
  entities: EntitySummary[];
}

export function SchemaHealthPanel({ entities }: SchemaHealthPanelProps) {
  const issues = useMemo(() => analyzeHealth(entities), [entities]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const infos = issues.filter((i) => i.level === "info");

  const healthy = errors.length === 0 && warnings.length === 0;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Schema Health</h3>
        <div className="flex items-center gap-2">
          {errors.length > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <XCircle className="size-3" />
              {errors.length} error{errors.length === 1 ? "" : "s"}
            </Badge>
          )}
          {warnings.length > 0 && (
            <Badge variant="outline" className="text-xs gap-1 text-warning">
              <AlertTriangle className="size-3" />
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </Badge>
          )}
          {infos.length > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="size-3" />
              {infos.length} pending
            </Badge>
          )}
          {healthy && (
            <Badge variant="secondary" className="text-xs gap-1 text-success">
              <CheckCircle className="size-3" />
              All healthy
            </Badge>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="space-y-1">
          {errors.map((issue, i) => (
            <div key={`e-${i}`} className="flex items-center gap-2 text-xs">
              <XCircle className="size-3 text-destructive shrink-0" />
              <span className="font-mono text-muted-foreground">
                {issue.entity}
              </span>
              <span>{issue.message}</span>
            </div>
          ))}
          {warnings.map((issue, i) => (
            <div key={`w-${i}`} className="flex items-center gap-2 text-xs">
              <AlertTriangle className="size-3 text-warning shrink-0" />
              <span className="font-mono text-muted-foreground">
                {issue.entity}
              </span>
              <span>{issue.message}</span>
            </div>
          ))}
          {infos.map((issue, i) => (
            <div key={`i-${i}`} className="flex items-center gap-2 text-xs">
              <Clock className="size-3 text-info shrink-0" />
              <span className="font-mono text-muted-foreground">
                {issue.entity}
              </span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
