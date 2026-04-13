/**
 * @athyper/collaboration-ui — Activity Timeline
 *
 * Rec 15: Filtered process ledger showing document lifecycle events.
 * Phase 1 filters: all, document, workflow, accounting.
 * Shows before→after state on lifecycle transitions.
 * Sources: log.activity_log + log.entity_lifecycle_log
 */
"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button } from "@athyper/ui/primitives";
import { type ActivityEntry, type ActivityDomain } from "@athyper/api-contracts/workflow";

export interface ActivityTimelineProps {
  entries?: ActivityEntry[];
  className?: string;
}

const PHASE1_FILTERS: Array<{ value: ActivityDomain; label: string }> = [
  { value: "all", label: "All" },
  { value: "document", label: "Document" },
  { value: "workflow", label: "Workflow" },
  { value: "accounting", label: "Accounting" },
];

export function ActivityTimeline({ entries = [], className }: ActivityTimelineProps) {
  const [activeDomain, setActiveDomain] = useState<ActivityDomain>("all");

  const filtered = activeDomain === "all"
    ? entries
    : entries.filter((e) => e.domain === activeDomain);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Domain filter pills */}
      <div className="flex items-center gap-1">
        {PHASE1_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={activeDomain === filter.value ? "primary" : "ghost"}
            size="sm"
            className="text-xs"
            onClick={() => setActiveDomain(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Timeline entries */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No activity in this category.
          </p>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/30 transition-colors"
            >
              <span className="w-36 shrink-0 text-xs text-muted-foreground tabular-nums">
                {new Date(entry.created_at).toLocaleString()}
              </span>

              <Badge variant="muted" className="text-[10px] shrink-0">
                {entry.domain}
              </Badge>

              <div className="flex-1 min-w-0">
                <p className="text-sm">{entry.description}</p>

                {(entry.from_state || entry.to_state) && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    {entry.from_state && (
                      <Badge variant="outline" className="text-[10px]">{entry.from_state}</Badge>
                    )}
                    {entry.from_state && entry.to_state && (
                      <ArrowRight className="h-3 w-3" />
                    )}
                    {entry.to_state && (
                      <Badge variant="outline" className="text-[10px]">{entry.to_state}</Badge>
                    )}
                  </div>
                )}
              </div>

              {entry.actor_name && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {entry.actor_name}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
