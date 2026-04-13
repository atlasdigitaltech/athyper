"use client";

/**
 * Workflow Inbox — pending approval tasks for the current user.
 *
 * Expanded row fetches the full ApprovalContext and renders ApprovalPanel
 * from @athyper/workflow-ui alongside the approve/reject action buttons.
 * Click the external link to open the full request detail page.
 */

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Clock, ChevronRight, ExternalLink, Inbox, Loader2 } from "lucide-react";
import { useInbox, useSubmitWorkflowAction, useApprovalContext } from "@athyper/query";
import { ApprovalPanel } from "@athyper/workflow-ui/approval";
import type { InboxItem } from "@athyper/api-contracts/workflow";
import {
  Card,
  CardContent,
  Button,
  Badge,
  Skeleton,
  Textarea,
  Separator,
} from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";

// ── Priority badge ────────────────────────────────────────────────────────────

function priorityVariant(p?: number): "destructive" | "warning" | "muted" {
  if (!p) return "muted";
  if (p >= 8) return "destructive";
  if (p >= 5) return "warning";
  return "muted";
}

// ── Action buttons (approve / reject) ─────────────────────────────────────────

interface ActionButtonsProps {
  item: InboxItem;
  onDone: () => void;
}

function ActionButtons({ item, onDone }: ActionButtonsProps) {
  const [remarks, setRemarks] = useState("");
  const submit = useSubmitWorkflowAction();

  async function act(action: "approve" | "reject") {
    await submit.mutateAsync({
      workItemId: item.work_item.id,
      action: { action, remarks: remarks || undefined },
    });
    onDone();
  }

  return (
    <div className="space-y-3">
      <Textarea
        placeholder="Remarks (optional)"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        rows={2}
        className="text-sm"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={() => act("approve")}
          loading={submit.isPending}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => act("reject")}
          loading={submit.isPending}
        >
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          Reject
        </Button>
      </div>
    </div>
  );
}

// ── Expanded detail panel ─────────────────────────────────────────────────────

function ExpandedPanel({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const requestId = item.work_item.workflow_request_id;
  const { data: context, isLoading } = useApprovalContext(requestId, true);

  return (
    <div className="mt-3 space-y-4 border-t pt-3">
      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading approval context…
        </div>
      ) : context ? (
        <>
          <ApprovalPanel context={context} />
          <Separator />
        </>
      ) : null}

      <ActionButtons item={item} onDone={onDone} />
    </div>
  );
}

// ── Inbox row ─────────────────────────────────────────────────────────────────

function InboxRow({ item }: { item: InboxItem }) {
  const [expanded, setExpanded] = useState(false);

  const submittedAt = new Date(item.submitted_at).toLocaleString();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />

          <div className="min-w-0 flex-1">
            {/* Title row */}
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{item.entity_title}</span>
              {item.priority !== undefined && (
                <Badge variant={priorityVariant(item.priority)} className="shrink-0 text-xs">
                  P{item.priority}
                </Badge>
              )}
            </div>

            {/* Meta row */}
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{item.entity_type}</span>
              {item.stage_label && <span>{item.stage_label}</span>}
              <span>by {item.submitted_by_name}</span>
              <span>{submittedAt}</span>
            </div>

            {/* Expanded panel */}
            {expanded && (
              <ExpandedPanel item={item} onDone={() => setExpanded(false)} />
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {item.work_item.workflow_request_id && (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/inbox/${item.work_item.workflow_request_id}`}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronRight
                className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { data, isLoading } = useInbox();
  const items = data?.data ?? [];

  return (
    <PageFrame
      title="Workflow Inbox"
      description="Pending approvals and workflow tasks assigned to you"
    >
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No pending tasks</p>
          <p className="max-w-xs text-xs text-muted-foreground/70">
            Approval requests and workflow tasks assigned to you will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <InboxRow key={item.work_item.id} item={item} />
          ))}
        </div>
      )}
    </PageFrame>
  );
}
