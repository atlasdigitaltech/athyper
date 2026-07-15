"use client";

import { useState } from "react";
import { AlertTriangle, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useSubmitPreflight, type SubmitPreflightIssue } from "@athyper/query";

/**
 * Renders the pre-submit blocker/warning list above the form in edit mode.
 *
 * - Blockers (red) prevent Submit and tell the user what to fix
 * - Warnings (amber) allow Submit but flag soft constraints (partial
 *   payment activity, no manual distributions, ...)
 *
 * Collapsed by default with a single-line pill (`Cannot submit — 2 issues`)
 * so it doesn't dominate the form when expected. Expanded view groups by
 * severity and surfaces a per-issue message + optional section anchor.
 *
 * Mounted from document-object-page-workspace.tsx when edit mode is
 * active. Renders nothing when the preflight is empty (greenfield create,
 * or a clean record).
 */
export interface SubmitPreflightPanelProps {
  entityCode: string;
  recordId:   string;
  /** When true, anchor links scroll to the named section via `scrollIntoView`. */
  onJumpToSection?: (section: string) => void;
}

export function SubmitPreflightPanel({ entityCode, recordId, onJumpToSection }: SubmitPreflightPanelProps) {
  const { data, isLoading } = useSubmitPreflight(entityCode, recordId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !data) return null;
  const totalIssues = data.blockers.length + data.warnings.length;
  if (totalIssues === 0) return null;

  const hasBlockers = data.blockers.length > 0;
  const summaryColor = hasBlockers ? "border-destructive/30 bg-destructive/10 text-destructive"
                                    : "border-warning/30 bg-warning/10 text-warning";

  return (
    <div className={`rounded-md border ${summaryColor}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {hasBlockers
          ? <AlertCircle    className="h-3.5 w-3.5 shrink-0" aria-hidden />
          : <AlertTriangle  className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        <span className="font-medium">
          {hasBlockers
            ? `Cannot submit — ${data.blockers.length} ${data.blockers.length === 1 ? "blocker" : "blockers"}`
            : `Submit allowed — ${data.warnings.length} ${data.warnings.length === 1 ? "warning" : "warnings"}`}
        </span>
        {data.warnings.length > 0 && hasBlockers ? (
          <span className="opacity-80">· {data.warnings.length} warning{data.warnings.length === 1 ? "" : "s"}</span>
        ) : null}
      </button>

      {expanded ? (
        <div className="border-t border-current/20 px-3 py-2">
          {data.blockers.length > 0 ? (
            <IssueList
              heading="Blockers"
              issues={data.blockers}
              icon={<AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />}
              onJumpToSection={onJumpToSection}
            />
          ) : null}
          {data.warnings.length > 0 ? (
            <IssueList
              heading="Warnings"
              issues={data.warnings}
              icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden />}
              onJumpToSection={onJumpToSection}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IssueList({
  heading,
  issues,
  icon,
  onJumpToSection,
}: {
  heading:  string;
  issues:   SubmitPreflightIssue[];
  icon:     React.ReactNode;
  onJumpToSection?: (section: string) => void;
}) {
  return (
    <div className="mt-1 flex flex-col gap-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{heading}</p>
      <ul className="flex flex-col gap-1">
        {issues.map((issue) => (
          <li key={issue.code} className="flex items-start gap-2 text-xs">
            <span className="mt-[2px]">{icon}</span>
            <span className="flex-1 leading-snug text-foreground">{issue.message}</span>
            {issue.section && onJumpToSection ? (
              <button
                type="button"
                onClick={() => onJumpToSection(issue.section!)}
                className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Jump to {issue.section}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
