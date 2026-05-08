"use client";

/**
 * Comment Moderation — /setup/moderation
 *
 * Shows the comment flag queue with all 4 status tabs:
 * pending | reviewed | dismissed | actioned
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, RefreshCw, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Label, Textarea,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

type FlagStatus = "pending" | "reviewed" | "dismissed" | "actioned";

interface CommentFlag {
  id: string;
  contextType: string;
  commentId: string;
  flaggedBy: string;
  flagReason: string;
  note: string | null;
  status: FlagStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<FlagStatus, "warning" | "muted" | "success" | "destructive"> = {
  pending: "warning", reviewed: "muted", dismissed: "muted", actioned: "destructive",
};

// ── Action Dialog ─────────────────────────────────────────────────────────────

function ActionDialog({ flag, open, onOpenChange }: { flag: CommentFlag; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [reviewNote, setReviewNote] = useState("");
  const [action, setAction] = useState<"review" | "dismiss" | "action">("review");

  const mutate = useMutation({
    mutationFn: async () => {
      if (action === "action" && !reviewNote.trim()) throw new Error("Review note required when actioning");
      const res = await fetch(`/api/moderation/flags/${flag.id}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNote: reviewNote.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moderation-flags"] });
      onOpenChange(false);
      setReviewNote("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Moderate Flag</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-md bg-muted/30 p-3 space-y-1 text-sm">
            <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Reason:</span><span>{flag.flagReason}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Context:</span><span className="font-mono text-xs">{flag.contextType}</span></div>
            {flag.note && <div className="flex gap-2"><span className="text-muted-foreground w-24 shrink-0">Note:</span><span>{flag.note}</span></div>}
          </div>
          <div className="flex gap-2">
            {(["review", "dismiss", "action"] as const).map((a) => (
              <Button key={a} size="sm" variant={action === a ? "primary" : "outline"} className="text-xs"
                onClick={() => setAction(a)}>
                {a}
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Review Note {action === "action" ? "(required)" : "(optional)"}</Label>
            <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3}
              placeholder="Explain your moderation decision…" />
          </div>
          {mutate.error && <p className="text-xs text-destructive">{mutate.error.message}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutate.mutate()} disabled={mutate.isPending}>Apply {action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Flag list ─────────────────────────────────────────────────────────────────

function FlagList({ status }: { status: FlagStatus }) {
  const [selectedFlag, setSelectedFlag] = useState<CommentFlag | null>(null);

  const { data, isLoading } = useQuery<{ data: CommentFlag[] }>({
    queryKey: ["moderation-flags", status],
    queryFn: async () => {
      const res = await fetch(`/api/moderation/flags?status=${status}&limit=50`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });

  const flags = data?.data ?? [];

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  if (flags.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />}
        title={`No ${status} flags.`}
        className="py-16"
      />
    );
  }

  return (
    <>
      <div className="space-y-2">
        {flags.map((f) => (
          <RowCard
            key={f.id}
            badge={<Badge variant={STATUS_VARIANT[f.status]} className="text-doc-support">{f.status}</Badge>}
            title={f.flagReason}
            metadata={<>
              <span className="font-mono text-doc-support">{f.contextType}</span>
              {f.note && <p className="truncate">{f.note}</p>}
              <p className="text-doc-support">{new Date(f.createdAt).toLocaleString()}</p>
            </>}
            actions={
              (f.status === "pending" || f.status === "reviewed") ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedFlag(f)}>
                  Moderate
                </Button>
              ) : undefined
            }
          />
        ))}
      </div>
      {selectedFlag && (
        <ActionDialog flag={selectedFlag} open={!!selectedFlag} onOpenChange={(v) => !v && setSelectedFlag(null)} />
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ModerationPage() {
  const qc = useQueryClient();

  return (
    <PageFrame
      title="Comment Moderation"
      description="Review and action flagged comments across the platform"
      actions={
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["moderation-flags"] })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      <Tabs defaultValue="pending">
        <TabsList className="mb-4">
          <TabsTrigger value="pending">
            <Flag className="mr-1.5 h-3.5 w-3.5 text-warning" />Pending
          </TabsTrigger>
          <TabsTrigger value="reviewed">
            <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />Reviewed
          </TabsTrigger>
          <TabsTrigger value="dismissed">
            <XCircle className="mr-1.5 h-3.5 w-3.5" />Dismissed
          </TabsTrigger>
          <TabsTrigger value="actioned">
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Actioned
          </TabsTrigger>
        </TabsList>
        {(["pending", "reviewed", "dismissed", "actioned"] as FlagStatus[]).map((s) => (
          <TabsContent key={s} value={s} className="mt-4"><FlagList status={s} /></TabsContent>
        ))}
      </Tabs>
    </PageFrame>
  );
}
