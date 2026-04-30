/**
 * @athyper/collaboration-ui — Activity Timeline
 *
 * Table-format audit history matching ERP history conventions.
 * Columns: Date | User | Action | Summary (with optional state transition).
 * Domain filter pills above the table narrow by event category.
 */
"use client";

import { useState } from "react";
import { ArrowRight, ClockIcon, UserIcon } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button } from "@athyper/ui/primitives";
import { type ActivityEntry, type ActivityDomain } from "@athyper/api-contracts/workflow";

export interface ActivityTimelineProps {
  entries?: ActivityEntry[];
  className?: string;
}

// ── Domain filter pills ────────────────────────────────────────────────────────

const FILTERS: Array<{ value: ActivityDomain; label: string }> = [
  { value: "all",        label: "All"        },
  { value: "document",   label: "Document"   },
  { value: "workflow",   label: "Workflow"   },
  { value: "accounting", label: "Accounting" },
  { value: "payment",    label: "Payment"    },
  { value: "system",     label: "System"     },
];

// ── Action label resolution ────────────────────────────────────────────────────
// Maps activity_type to a short human-readable action label for the Action column.
// Falls back to title-casing the type suffix when there is no explicit mapping.

const ACTION_LABELS: Record<string, string> = {
  "document.created":    "Created",
  "document.updated":    "Updated",
  "document.submitted":  "Submitted",
  "document.approved":   "Approved",
  "document.rejected":   "Rejected",
  "document.cancelled":  "Cancelled",
  "document.reopened":   "Reopened",
  "document.amended":    "Amended",
  "workflow.initiated":  "Workflow Initiated",
  "workflow.approved":   "Approved",
  "workflow.rejected":   "Rejected",
  "workflow.delegated":  "Delegated",
  "workflow.escalated":  "Escalated",
  "workflow.recalled":   "Recalled",
  "accounting.posted":   "Journal Posted",
  "accounting.reversed": "Journal Reversed",
  "accounting.revalued": "Revalued",
  "payment.initiated":   "Payment Initiated",
  "payment.cleared":     "Payment Cleared",
  "payment.reversed":    "Payment Reversed",
  "system.import":       "Imported",
  "system.migration":    "Migrated",
  "system.auto_action":  "Auto Action",
  // Legacy types from earlier domains
  "approval.submitted":  "Submitted",
  "approval.approved":   "Approved",
  "approval.rejected":   "Rejected",
  "approval.escalated":  "Escalated",
  "user.record_view":    "Viewed",
  "user.comment_read":   "Comment Read",
};

function resolveActionLabel(activityType: string): string {
  if (ACTION_LABELS[activityType]) return ACTION_LABELS[activityType]!;
  // Fallback: take the part after the last dot and title-case it
  const suffix = activityType.split(".").pop() ?? activityType;
  return suffix.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Domain badge variant ───────────────────────────────────────────────────────

function domainVariant(domain: string): "default" | "success" | "info" | "warning" | "destructive" | "muted" | "secondary" {
  switch (domain) {
    case "document":   return "info";
    case "workflow":   return "warning";
    case "accounting": return "success";
    case "payment":    return "secondary";
    case "system":     return "muted";
    default:           return "muted";
  }
}

// ── Date formatting ────────────────────────────────────────────────────────────
// Matches ERP audit log convention: "Wed, 14 Jan, 2026 10:54 PM"

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day:     "2-digit",
      month:   "short",
      year:    "numeric",
      hour:    "2-digit",
      minute:  "2-digit",
      hour12:  true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ActivityTimeline({ entries = [], className }: ActivityTimelineProps) {
  const [activeDomain, setActiveDomain] = useState<ActivityDomain>("all");

  const filtered = activeDomain === "all"
    ? entries
    : entries.filter((e) => e.domain === activeDomain);

  // Only show filter pills that have at least one matching entry (+ "All")
  const activeDomains = new Set(entries.map((e) => e.domain));
  const visibleFilters = FILTERS.filter(
    (f) => f.value === "all" || activeDomains.has(f.value),
  );

  return (
    <div className={cn("space-y-3", className)}>
      {/* Domain filter pills */}
      {visibleFilters.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {visibleFilters.map((filter) => (
            <Button
              key={filter.value}
              variant={activeDomain === filter.value ? "primary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setActiveDomain(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      )}

      {/* History table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <ClockIcon className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No activity in this category.</p>
          <p className="text-xs text-muted-foreground/60">
            Activity will appear here as the document progresses through its lifecycle.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  Date ↓
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  User
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                  Action
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-muted/20 transition-colors"
                >
                  {/* Date */}
                  <td className="px-4 py-2.5 align-top whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {formatDate(entry.created_at)}
                  </td>

                  {/* User */}
                  <td className="px-4 py-2.5 align-top whitespace-nowrap">
                    {entry.actor_name ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                        <UserIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {entry.actor_name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">System</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-4 py-2.5 align-top whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-foreground">
                        {resolveActionLabel(entry.activity_type)}
                      </span>
                      <Badge
                        variant={domainVariant(entry.domain)}
                        className="w-fit text-[10px] capitalize"
                      >
                        {entry.domain}
                      </Badge>
                    </div>
                  </td>

                  {/* Summary */}
                  <td className="px-4 py-2.5 align-top">
                    <p className="text-xs leading-relaxed text-foreground">{entry.description}</p>
                    {(entry.from_state || entry.to_state) && (
                      <div className="mt-1 flex items-center gap-1">
                        {entry.from_state && (
                          <Badge variant="outline" className="text-[10px]">
                            {entry.from_state.replace(/_/g, " ")}
                          </Badge>
                        )}
                        {entry.from_state && entry.to_state && (
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        {entry.to_state && (
                          <Badge variant="outline" className="text-[10px] font-medium">
                            {entry.to_state.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
