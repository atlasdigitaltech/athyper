"use client";

// components/mesh/policies/PolicyCard.tsx
//
// Card renderer for policies in the list page card grid.

import { Shield } from "lucide-react";
import Link from "next/link";

import type { PolicySummary } from "./types";

import { StatusDot } from "@/components/mesh/shared/StatusDot";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SCOPE_BORDER } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

const SCOPE_LABELS: Record<string, string> = {
  global: "Global",
  module: "Module",
  entity: "Entity",
  entity_version: "Version",
};

interface PolicyCardProps {
  policy: PolicySummary;
  basePath: string;
}

export function PolicyCard({ policy, basePath }: PolicyCardProps) {
  const version = policy.currentVersion;
  const status = version?.status ?? "draft";
  const borderColor = SCOPE_BORDER[policy.scopeType] ?? "";

  return (
    <Link href={`${basePath}/${policy.id}`}>
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
                {policy.name}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-xs font-normal capitalize"
                >
                  {SCOPE_LABELS[policy.scopeType] ?? policy.scopeType}
                </Badge>
                {policy.scopeKey && (
                  <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                    {policy.scopeKey}
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

          {policy.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {policy.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {version && (
              <>
                <span className="inline-flex items-center gap-1">
                  v{version.versionNo}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Shield className="size-3" />
                  {version.ruleCount} rules
                </span>
              </>
            )}
            {!version && <span className="italic">No versions</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
