"use client";

import {
    ArrowLeft, Check, CheckCircle2, Circle,
    Loader2, X, XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { ApprovalCommentPanel } from "@/components/collab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
    useApprovalInstance,
    type ApprovalStage,
    type ApprovalTask,
} from "@/lib/collab/use-approval-instance";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";

// ─── Status Badge ────────────────────────────────────────────

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    open: "default",
    completed: "secondary",
    rejected: "destructive",
    canceled: "outline",
    active: "default",
    pending: "outline",
    skipped: "secondary",
    approved: "secondary",
};

function StatusBadge({ status }: { status: string }) {
    return (
        <Badge variant={STATUS_VARIANTS[status] ?? "outline"} className="capitalize">
            {status}
        </Badge>
    );
}

// ─── Stage Timeline ──────────────────────────────────────────

function StageTimeline({ stages, currentStageNumber }: { stages: ApprovalStage[]; currentStageNumber: number }) {
    return (
        <div className="flex items-center gap-1">
            {stages.map((stage, i) => {
                const isCurrent = stage.stageNumber === currentStageNumber;
                const isCompleted = stage.status === "completed";
                const isRejected = stage.status === "rejected";

                return (
                    <div key={stage.id} className="flex items-center gap-1">
                        {i > 0 && (
                            <div
                                className={`h-0.5 w-6 ${
                                    isCompleted || isRejected ? "bg-foreground/30" : "bg-muted"
                                }`}
                            />
                        )}
                        <div
                            className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors ${
                                isCompleted
                                    ? "border-green-500 bg-green-500/10 text-green-600"
                                    : isRejected
                                      ? "border-red-500 bg-red-500/10 text-red-600"
                                      : isCurrent
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-muted bg-muted text-muted-foreground"
                            }`}
                            title={`${stage.name} (${stage.mode})`}
                        >
                            {isCompleted ? (
                                <Check className="size-3.5" />
                            ) : isRejected ? (
                                <X className="size-3.5" />
                            ) : (
                                stage.stageNumber
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Task List ───────────────────────────────────────────────

function TaskList({ tasks }: { tasks: ApprovalTask[] }) {
    if (tasks.length === 0) {
        return <p className="text-sm text-muted-foreground">No tasks in this stage.</p>;
    }

    return (
        <div className="space-y-2">
            {tasks.map((task) => (
                <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                >
                    <div className="flex items-center gap-3">
                        {task.status === "approved" ? (
                            <CheckCircle2 className="size-4 text-green-500" />
                        ) : task.status === "rejected" ? (
                            <XCircle className="size-4 text-red-500" />
                        ) : (
                            <Circle className="size-4 text-muted-foreground" />
                        )}
                        <div>
                            <p className="text-sm font-medium">
                                {task.assigneeName ?? task.assigneeId}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                                {task.taskType.replace(/_/g, " ")}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {task.dueDate && (
                            <span className="text-xs text-muted-foreground">
                                Due {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                        )}
                        <StatusBadge status={task.status} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Decision Actions ────────────────────────────────────────

function DecisionActions({
    instanceId,
    onDecided,
}: {
    instanceId: string;
    onDecided: () => void;
}) {
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleDecide = useCallback(
        async (decision: "approve" | "reject") => {
            if (decision === "reject" && !note.trim()) {
                setError("A note is required when rejecting.");
                return;
            }
            setSubmitting(decision);
            setError(null);

            try {
                const res = await fetch(
                    `/api/collab/approvals/${encodeURIComponent(instanceId)}/decide`,
                    {
                        method: "POST",
                        headers: {
                            ...buildHeaders(),
                            "Content-Type": "application/json",
                        },
                        credentials: "same-origin",
                        body: JSON.stringify({
                            decision,
                            note: note.trim() || undefined,
                        }),
                    },
                );

                if (!res.ok) {
                    const body = (await res.json()) as { error?: { message?: string } };
                    throw new Error(body.error?.message ?? `Decision failed (${res.status})`);
                }

                setNote("");
                onDecided();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Decision failed");
            } finally {
                setSubmitting(null);
            }
        },
        [instanceId, note, onDecided],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Your Decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <Textarea
                    placeholder="Add a note (required for rejection)..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    disabled={submitting !== null}
                />
                {error && (
                    <p className="text-sm text-destructive">{error}</p>
                )}
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => handleDecide("approve")}
                        disabled={submitting !== null}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {submitting === "approve" ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                            <Check className="mr-1.5 size-3.5" />
                        )}
                        Approve
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => handleDecide("reject")}
                        disabled={submitting !== null}
                    >
                        {submitting === "reject" ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                            <X className="mr-1.5 size-3.5" />
                        )}
                        Reject
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Main Page ───────────────────────────────────────────────

export default function ApprovalDetailPage() {
    const { entity, id, approvalId } = useParams<{
        entity: string;
        id: string;
        approvalId: string;
    }>();
    const { instance, currentUserTask, isLoading, error, mutate } =
        useApprovalInstance(approvalId);

    if (isLoading) {
        return (
            <div className="mx-auto max-w-3xl space-y-6 p-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto max-w-3xl p-6">
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={mutate}>
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    if (!instance) {
        return (
            <div className="mx-auto max-w-3xl p-6 text-center text-sm text-muted-foreground">
                Approval not found.
            </div>
        );
    }

    const activeStage = instance.stages.find(
        (s) => s.stageNumber === instance.currentStageNumber,
    );

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6">
            {/* Back link + header */}
            <div className="space-y-4">
                <Link
                    href={`/app/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/approvals`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-3.5" />
                    Back to Approvals
                </Link>

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {instance.policyName}
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Requested by {instance.requestedByName ?? instance.requestedBy}
                            {" on "}
                            {new Date(instance.requestedAt).toLocaleDateString()}
                        </p>
                    </div>
                    <StatusBadge status={instance.status} />
                </div>
            </div>

            {/* Stage Timeline */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Stages</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <StageTimeline
                        stages={instance.stages}
                        currentStageNumber={instance.currentStageNumber}
                    />
                    {activeStage && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium">
                                    Stage {activeStage.stageNumber}: {activeStage.name}
                                </h3>
                                <Badge variant="outline" className="text-xs capitalize">
                                    {activeStage.mode}
                                </Badge>
                            </div>
                            <TaskList tasks={activeStage.tasks} />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* All Stages (collapsed) */}
            {instance.stages.length > 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">All Stages</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {instance.stages.map((stage) => (
                            <div key={stage.id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-medium">
                                        Stage {stage.stageNumber}: {stage.name}
                                    </h4>
                                    <StatusBadge status={stage.status} />
                                    <Badge variant="outline" className="text-xs capitalize">
                                        {stage.mode}
                                    </Badge>
                                </div>
                                <TaskList tasks={stage.tasks} />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Decision Actions (only if user has a pending task) */}
            {currentUserTask && instance.status === "open" && (
                <DecisionActions instanceId={approvalId} onDecided={mutate} />
            )}

            {/* Comments */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Comments</CardTitle>
                </CardHeader>
                <CardContent>
                    <ApprovalCommentPanel instanceId={approvalId} />
                </CardContent>
            </Card>
        </div>
    );
}
