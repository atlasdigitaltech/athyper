"use client";

import {
  CheckCircle,
  Clock,
  FileText,
  Plus,
  Send,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";

import type {
  ChangeRequest,
  ChangeRequestStatus,
} from "@/lib/schema-manager/change-request";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  RISK_LABELS,
  STATUS_LABELS,
} from "@/lib/schema-manager/change-request";
import { CHECK_STATUS_COLOR } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

// ─── Status Icon ─────────────────────────────────────────────

function StatusIcon({ status }: { status: ChangeRequestStatus }) {
  switch (status) {
    case "approved":
    case "applied":
      return (
        <CheckCircle className={cn("size-4", CHECK_STATUS_COLOR.passed)} />
      );
    case "rejected":
      return <XCircle className={cn("size-4", CHECK_STATUS_COLOR.failed)} />;
    case "pending_review":
      return <Clock className={cn("size-4", CHECK_STATUS_COLOR.warning)} />;
    default:
      return <FileText className={cn("size-4", CHECK_STATUS_COLOR.pending)} />;
  }
}

// ─── Component ───────────────────────────────────────────────

interface ChangeRequestPanelProps {
  entityName: string;
  changeRequests: ChangeRequest[];
  readonly?: boolean;
  onCreateCR?: (title: string, rationale: string) => void;
  onSubmitForReview?: (crId: string) => void;
  onApprove?: (crId: string, comment: string) => void;
  onReject?: (crId: string, comment: string) => void;
}

export function ChangeRequestPanel({
  entityName,
  changeRequests,
  readonly,
  onCreateCR,
  onSubmitForReview,
  onApprove,
  onReject,
}: ChangeRequestPanelProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newRationale, setNewRationale] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [selectedCR, setSelectedCR] = useState<string | null>(null);

  const handleCreate = useCallback(() => {
    if (!newTitle.trim()) return;
    onCreateCR?.(newTitle, newRationale);
    setNewTitle("");
    setNewRationale("");
    setCreateDialogOpen(false);
  }, [newTitle, newRationale, onCreateCR]);

  const sortedCRs = [...changeRequests].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Change Requests</h3>
          <Badge variant="secondary" className="text-xs">
            {changeRequests.length}
          </Badge>
        </div>
        {!readonly && (
          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            New Change Request
          </Button>
        )}
      </div>

      {sortedCRs.length === 0 ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          No change requests for this entity
        </div>
      ) : (
        <div className="space-y-2">
          {sortedCRs.map((cr) => {
            const statusInfo = STATUS_LABELS[cr.status];
            const riskInfo = RISK_LABELS[cr.riskLevel];
            const isExpanded = selectedCR === cr.id;

            return (
              <div key={cr.id} className="rounded-md border">
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
                  onClick={() => setSelectedCR(isExpanded ? null : cr.id)}
                >
                  <StatusIcon status={cr.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cr.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {cr.changes.length} change
                      {cr.changes.length === 1 ? "" : "s"} &middot;{" "}
                      {new Date(cr.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${riskInfo.color}`}
                    >
                      {riskInfo.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${statusInfo.color}`}
                    >
                      {statusInfo.label}
                    </Badge>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t px-3 py-3 space-y-3">
                    {cr.rationale && (
                      <p className="text-xs text-muted-foreground">
                        {cr.rationale}
                      </p>
                    )}

                    {/* Changes list */}
                    <div className="space-y-1">
                      {cr.changes.map((c, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Badge variant="outline" className="text-[10px]">
                            {c.type}
                          </Badge>
                          <span className="font-mono">{c.target}</span>
                          {c.breaking && (
                            <Badge
                              variant="destructive"
                              className="text-[10px]"
                            >
                              Breaking
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Review comment */}
                    {cr.reviewComment && (
                      <div className="rounded bg-muted/30 p-2 text-xs">
                        <p className="font-medium">Review:</p>
                        <p className="text-muted-foreground">
                          {cr.reviewComment}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    {!readonly && (
                      <div className="flex items-center gap-2">
                        {cr.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-7 text-xs"
                            onClick={() => onSubmitForReview?.(cr.id)}
                          >
                            <Send className="size-3" />
                            Submit for Review
                          </Button>
                        )}
                        {cr.status === "pending_review" && (
                          <>
                            <Input
                              placeholder="Review comment..."
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              className="h-7 text-xs flex-1"
                            />
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1.5 h-7 text-xs"
                              onClick={() => {
                                onApprove?.(cr.id, reviewComment);
                                setReviewComment("");
                              }}
                            >
                              <CheckCircle className="size-3" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1.5 h-7 text-xs"
                              onClick={() => {
                                onReject?.(cr.id, reviewComment);
                                setReviewComment("");
                              }}
                            >
                              <XCircle className="size-3" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Change Request</DialogTitle>
            <DialogDescription>
              Create a change request for &quot;{entityName}&quot; to track
              schema modifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title (e.g., Add payment fields)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Textarea
              placeholder="Rationale — why is this change needed?"
              rows={3}
              value={newRationale}
              onChange={(e) => setNewRationale(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
