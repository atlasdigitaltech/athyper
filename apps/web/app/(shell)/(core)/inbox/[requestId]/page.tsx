"use client";

/**
 * Workflow Request Detail — /inbox/[requestId]
 *
 * Shows the full approval context (stages, work items, quorum) alongside
 * the event activity trail for a workflow request.
 */

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Forward,
  Loader2,
} from "lucide-react";
import {
  useApprovalContext,
  useWorkflowActivity,
} from "@athyper/query";
import { ApprovalPanel } from "@athyper/workflow-ui/approval";
import type { WorkflowEvent } from "@athyper/api-contracts/workflow";
import {
  Badge,
  Button,
  Skeleton,
  Separator,
} from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";

// ── Event timeline ────────────────────────────────────────────────────────────

const EVENT_ICON: Record<string, React.ReactNode> = {
  approved:    <CheckCircle className="h-3.5 w-3.5 text-success" />,
  rejected:    <XCircle    className="h-3.5 w-3.5 text-destructive" />,
  delegated:   <Forward    className="h-3.5 w-3.5 text-info" />,
  escalated:   <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  timed_out:   <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
};

function eventIcon(event: WorkflowEvent) {
  if (event.action) return EVENT_ICON[event.action] ?? <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  return EVENT_ICON[event.event_type] ?? <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

function severityVariant(sev: WorkflowEvent["severity"]): "destructive" | "warning" | "muted" {
  if (sev === "error") return "destructive";
  if (sev === "warn")  return "warning";
  return "muted";
}

function ActivityTimeline({ requestId }: { requestId: string }) {
  const { data, isLoading } = useWorkflowActivity(requestId);
  const events = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-muted ml-2">
      {events.map((event) => (
        <li key={event.id} className="relative pl-6 pb-5 last:pb-0">
          {/* dot */}
          <span className="absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background">
            {eventIcon(event)}
          </span>

          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {event.actor_name ?? "System"}
                </span>
                {event.action && (
                  <Badge variant={severityVariant(event.severity)} className="text-doc-support capitalize">
                    {event.action}
                  </Badge>
                )}
                {event.from_status && event.to_status && (
                  <span className="text-doc-support text-muted-foreground">
                    {event.from_status} → {event.to_status}
                  </span>
                )}
              </div>
              {event.comment && (
                <p className="mt-0.5 text-xs text-muted-foreground italic">
                  &ldquo;{event.comment}&rdquo;
                </p>
              )}
            </div>
            <span className="shrink-0 text-doc-support text-muted-foreground">
              {new Date(event.created_at).toLocaleString()}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Approval context section ──────────────────────────────────────────────────

function ApprovalSection({ requestId }: { requestId: string }) {
  const { data: context, isLoading } = useApprovalContext(requestId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading approval context…
      </div>
    );
  }

  if (!context) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Approval context not available.
      </p>
    );
  }

  return <ApprovalPanel context={context} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkflowRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);

  return (
    <PageFrame
      title="Workflow Request"
      description={`Request ID: ${requestId}`}
    >
      {/* Back link */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/inbox">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Inbox
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Approval stages — wider column */}
        <div className="lg:col-span-3 space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Approval Stages
          </h2>
          <ApprovalSection requestId={requestId} />
        </div>

        {/* Vertical divider (desktop) */}
        <div className="hidden lg:flex lg:col-span-0 justify-center">
          <Separator orientation="vertical" />
        </div>

        {/* Activity timeline — narrower column */}
        <div className="lg:col-span-2 space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Activity Trail
          </h2>
          <ActivityTimeline requestId={requestId} />
        </div>
      </div>
    </PageFrame>
  );
}
