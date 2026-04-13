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
import {
  Button, Badge, Card, CardContent, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent,
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
              <Button key={a} size="sm" variant={action === a ? "default" : "outline"} className="text-xs"
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
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No {status} flags.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {flags.map((f) => (
          <Card key={f.id}>
            <CardContent className="p-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={STATUS_VARIANT[f.status]} className="text-[10px]">{f.status}</Badge>
                  <span className="text-xs font-medium">{f.flagReason}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{f.contextType}</span>
                </div>
                {f.note && <p className="text-xs text-muted-foreground truncate">{f.note}</p>}
                <p className="text-[10px] text-muted-foreground">{new Date(f.createdAt).toLocaleString()}</p>
              </div>
              {(f.status === "pending" || f.status === "reviewed") && (
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setSelectedFlag(f)}>
                  Moderate
                </Button>
              )}
            </CardContent>
          </Card>
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
            <Flag className="mr-1.5 h-3.5 w-3.5 text-amber-500" />Pending
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
          <TabsContent key={s} value={s}><FlagList status={s} /></TabsContent>
        ))}
      </Tabs>
    </PageFrame>
  );
}
