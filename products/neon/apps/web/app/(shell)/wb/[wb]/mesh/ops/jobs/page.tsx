"use client";

import {
    AlertCircle, CheckCircle2, Clock, Loader2,
    MoreHorizontal, Pause, Play, Plus, RefreshCw,
    RotateCcw, Timer, Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";

import { ConfirmDeleteDialog } from "@/components/mesh/shared/ConfirmDeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import {
    useJobQueues, useJobList, useJobDetail,
    type QueueMetrics, type JobStatus,
} from "@/lib/schema-manager/use-jobs";

// ─── Status Helpers ──────────────────────────────────────────

const STATUS_TABS: { value: JobStatus; label: string }[] = [
    { value: "active", label: "Active" },
    { value: "pending", label: "Pending" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "delayed", label: "Delayed" },
];

function statusIcon(status: string) {
    switch (status) {
        case "active": return <Loader2 className="size-3.5 animate-spin text-blue-500" />;
        case "pending": return <Clock className="size-3.5 text-muted-foreground" />;
        case "completed": return <CheckCircle2 className="size-3.5 text-green-500" />;
        case "failed": return <AlertCircle className="size-3.5 text-red-500" />;
        case "delayed": return <Timer className="size-3.5 text-yellow-500" />;
        default: return <Clock className="size-3.5 text-muted-foreground" />;
    }
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    switch (status) {
        case "active": return "default";
        case "completed": return "secondary";
        case "failed": return "destructive";
        default: return "outline";
    }
}

// ─── Queue Card ──────────────────────────────────────────────

function QueueCard({
    queue,
    isSelected,
    onSelect,
    onTogglePause,
}: {
    queue: QueueMetrics;
    isSelected: boolean;
    onSelect: () => void;
    onTogglePause: () => void;
}) {
    return (
        <Card
            className={`cursor-pointer transition-all hover:shadow-sm ${
                isSelected ? "border-primary ring-1 ring-primary/20" : "hover:border-foreground/20"
            }`}
            onClick={onSelect}
        >
            <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold truncate">{queue.name}</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            onTogglePause();
                        }}
                        title={queue.isPaused ? "Resume" : "Pause"}
                    >
                        {queue.isPaused ? (
                            <Play className="size-3.5 text-green-500" />
                        ) : (
                            <Pause className="size-3.5 text-yellow-500" />
                        )}
                    </Button>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {queue.waiting}
                    </span>
                    <span className="flex items-center gap-1">
                        <Loader2 className="size-3" />
                        {queue.active}
                    </span>
                    <span className="flex items-center gap-1">
                        <CheckCircle2 className="size-3" />
                        {queue.completed}
                    </span>
                    <span className="flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        {queue.failed}
                    </span>
                </div>
                {queue.isPaused && (
                    <Badge variant="outline" className="text-xs text-yellow-600">
                        Paused
                    </Badge>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Job Detail Drawer ───────────────────────────────────────

function JobDetailDrawer({
    queue,
    jobId,
    open,
    onOpenChange,
    onRetry,
    onRemove,
}: {
    queue: string | null;
    jobId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRetry: (jobId: string) => void;
    onRemove: (jobId: string) => void;
}) {
    const { job, loading, error } = useJobDetail(open ? queue : null, open ? jobId : null);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Job Detail</SheetTitle>
                </SheetHeader>

                {loading && (
                    <div className="space-y-3 mt-4">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                        {error}
                    </div>
                )}

                {job && !loading && (
                    <div className="mt-4 space-y-4">
                        {/* Overview */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                {statusIcon(job.status)}
                                <span className="text-sm font-medium">{job.name}</span>
                                <Badge variant={statusBadgeVariant(job.status)} className="capitalize text-xs">
                                    {job.status}
                                </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                <div>
                                    <span className="font-medium text-foreground">ID:</span> {job.id}
                                </div>
                                <div>
                                    <span className="font-medium text-foreground">Priority:</span> {job.priority}
                                </div>
                                <div>
                                    <span className="font-medium text-foreground">Attempts:</span> {job.attempts}/{job.maxAttempts}
                                </div>
                                {job.progress !== undefined && (
                                    <div>
                                        <span className="font-medium text-foreground">Progress:</span> {job.progress}%
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Timestamps */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-medium">Timestamps</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1 text-xs text-muted-foreground">
                                <div>Created: {new Date(job.createdAt).toLocaleString()}</div>
                                {job.processedAt && <div>Processed: {new Date(job.processedAt).toLocaleString()}</div>}
                                {job.completedAt && <div>Completed: {new Date(job.completedAt).toLocaleString()}</div>}
                            </CardContent>
                        </Card>

                        {/* Payload */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-medium">Payload</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                                    {JSON.stringify(job.data, null, 2)}
                                </pre>
                            </CardContent>
                        </Card>

                        {/* Return Value */}
                        {job.returnValue !== undefined && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-medium">Return Value</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <pre className="max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs">
                                        {JSON.stringify(job.returnValue, null, 2)}
                                    </pre>
                                </CardContent>
                            </Card>
                        )}

                        {/* Error / Stack Trace */}
                        {job.failedReason && (
                            <Card className="border-destructive/30">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-medium text-destructive">Error</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <p className="text-xs text-destructive">{job.failedReason}</p>
                                    {job.stackTrace && job.stackTrace.length > 0 && (
                                        <pre className="max-h-48 overflow-auto rounded-md bg-destructive/5 p-3 text-xs text-destructive/80">
                                            {job.stackTrace.join("\n")}
                                        </pre>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2">
                            {job.status === "failed" && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onRetry(job.id)}
                                >
                                    <RotateCcw className="mr-1.5 size-3.5" />
                                    Retry
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => onRemove(job.id)}
                            >
                                <Trash2 className="mr-1.5 size-3.5" />
                                Remove
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

// ─── Main Page ───────────────────────────────────────────────

export default function JobsPage() {
    const { queues, loading: queuesLoading, error: queuesError, refresh: refreshQueues } = useJobQueues();
    const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<JobStatus>("active");
    const { jobs, loading: jobsLoading, error: jobsError, refresh: refreshJobs } = useJobList(selectedQueue, statusFilter);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailJobId, setDetailJobId] = useState<string | null>(null);
    const [removeTarget, setRemoveTarget] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Trigger Job dialog
    const [triggerOpen, setTriggerOpen] = useState(false);
    const [triggerName, setTriggerName] = useState("");
    const [triggerPayload, setTriggerPayload] = useState("{}");
    const [triggerPriority, setTriggerPriority] = useState(0);
    const [triggerLoading, setTriggerLoading] = useState(false);

    // Auto-select first queue
    if (queues.length > 0 && selectedQueue === null) {
        setSelectedQueue(queues[0].name);
    }

    const handleTogglePause = useCallback(async (queueName: string, isPaused: boolean) => {
        try {
            await fetch(`/api/admin/mesh/jobs/queues/${encodeURIComponent(queueName)}`, {
                method: "POST",
                headers: { ...buildHeaders(), "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ action: isPaused ? "resume" : "pause" }),
            });
            refreshQueues();
        } catch {
            // Silently fail
        }
    }, [refreshQueues]);

    const handleRetry = useCallback(async (jobId: string) => {
        if (!selectedQueue) return;
        setActionLoading(true);
        try {
            await fetch(
                `/api/admin/mesh/jobs/queues/${encodeURIComponent(selectedQueue)}/${encodeURIComponent(jobId)}`,
                {
                    method: "POST",
                    headers: { ...buildHeaders(), "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ action: "retry" }),
                },
            );
            refreshJobs();
            setDetailOpen(false);
        } catch {
            // Silently fail
        } finally {
            setActionLoading(false);
        }
    }, [selectedQueue, refreshJobs]);

    const handleRemove = useCallback(async () => {
        if (!selectedQueue || !removeTarget) return;
        setActionLoading(true);
        try {
            await fetch(
                `/api/admin/mesh/jobs/queues/${encodeURIComponent(selectedQueue)}/${encodeURIComponent(removeTarget)}`,
                {
                    method: "POST",
                    headers: { ...buildHeaders(), "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ action: "remove" }),
                },
            );
            refreshJobs();
            setDetailOpen(false);
            setRemoveTarget(null);
        } catch {
            // Silently fail
        } finally {
            setActionLoading(false);
        }
    }, [selectedQueue, removeTarget, refreshJobs]);

    const handleTriggerJob = useCallback(async () => {
        if (!selectedQueue || !triggerName.trim()) return;
        setTriggerLoading(true);
        try {
            let data: unknown = {};
            try { data = JSON.parse(triggerPayload); } catch { /* use empty object */ }

            await fetch(`/api/admin/mesh/jobs/queues/${encodeURIComponent(selectedQueue)}`, {
                method: "POST",
                headers: { ...buildHeaders(), "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    action: "trigger",
                    name: triggerName.trim(),
                    data,
                    priority: triggerPriority,
                }),
            });
            refreshJobs();
            setTriggerOpen(false);
            setTriggerName("");
            setTriggerPayload("{}");
            setTriggerPriority(0);
        } catch {
            // Silently fail
        } finally {
            setTriggerLoading(false);
        }
    }, [selectedQueue, triggerName, triggerPayload, triggerPriority, refreshJobs]);

    if (queuesLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <div className="grid gap-4 md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-lg" />
                    ))}
                </div>
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (queuesError) {
        return (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                <p className="text-sm text-destructive">{queuesError}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={refreshQueues}>
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Job Queues</h2>
                    <p className="text-sm text-muted-foreground">
                        Monitor background job queues and manage job processing.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedQueue && (
                        <Button variant="outline" size="sm" onClick={() => setTriggerOpen(true)}>
                            <Plus className="mr-1.5 size-3.5" />
                            Trigger Job
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { refreshQueues(); refreshJobs(); }}>
                        <RefreshCw className="size-3.5" />
                    </Button>
                </div>
            </div>

            {/* Queue Cards */}
            {queues.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                    No job queues found.
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {queues.map((q) => (
                        <QueueCard
                            key={q.name}
                            queue={q}
                            isSelected={selectedQueue === q.name}
                            onSelect={() => setSelectedQueue(q.name)}
                            onTogglePause={() => handleTogglePause(q.name, q.isPaused)}
                        />
                    ))}
                </div>
            )}

            {/* Job Table */}
            {selectedQueue && (
                <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-base">{selectedQueue}</CardTitle>
                        <Tabs
                            value={statusFilter}
                            onValueChange={(v) => setStatusFilter(v as JobStatus)}
                        >
                            <TabsList className="h-8">
                                {STATUS_TABS.map((tab) => (
                                    <TabsTrigger key={tab.value} value={tab.value} className="text-xs px-2.5">
                                        {tab.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <CardContent>
                        {jobsLoading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Skeleton key={i} className="h-10 w-full" />
                                ))}
                            </div>
                        ) : jobsError ? (
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                                {jobsError}
                            </div>
                        ) : jobs.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                No {statusFilter} jobs in this queue.
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">Status</TableHead>
                                            <TableHead>ID</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead className="w-20">Priority</TableHead>
                                            <TableHead className="w-20">Attempts</TableHead>
                                            <TableHead>Created</TableHead>
                                            <TableHead className="w-12" />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {jobs.map((job) => (
                                            <TableRow
                                                key={job.id}
                                                className="cursor-pointer hover:bg-muted/50"
                                                onClick={() => {
                                                    setDetailJobId(job.id);
                                                    setDetailOpen(true);
                                                }}
                                            >
                                                <TableCell>{statusIcon(job.status)}</TableCell>
                                                <TableCell className="font-mono text-xs truncate max-w-[120px]">
                                                    {job.id}
                                                </TableCell>
                                                <TableCell className="text-xs">{job.name}</TableCell>
                                                <TableCell className="text-xs">{job.priority}</TableCell>
                                                <TableCell className="text-xs">
                                                    {job.attempts}/{job.maxAttempts}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {new Date(job.createdAt).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                            <Button variant="ghost" size="sm" className="size-7 p-0">
                                                                <MoreHorizontal className="size-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDetailJobId(job.id);
                                                                    setDetailOpen(true);
                                                                }}
                                                            >
                                                                View Details
                                                            </DropdownMenuItem>
                                                            {job.status === "failed" && (
                                                                <DropdownMenuItem
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleRetry(job.id);
                                                                    }}
                                                                >
                                                                    <RotateCcw className="mr-1.5 size-3.5" />
                                                                    Retry
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem
                                                                className="text-destructive"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setRemoveTarget(job.id);
                                                                }}
                                                            >
                                                                <Trash2 className="mr-1.5 size-3.5" />
                                                                Remove
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Detail Drawer */}
            <JobDetailDrawer
                queue={selectedQueue}
                jobId={detailJobId}
                open={detailOpen}
                onOpenChange={setDetailOpen}
                onRetry={handleRetry}
                onRemove={(id) => setRemoveTarget(id)}
            />

            {/* Remove Confirmation */}
            <ConfirmDeleteDialog
                open={removeTarget !== null}
                onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
                title="Remove Job"
                description="Are you sure you want to remove this job? This action cannot be undone."
                onConfirm={handleRemove}
                loading={actionLoading}
            />

            {/* Trigger Job Dialog */}
            <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Trigger Job</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium">Job Name</label>
                            <Input
                                placeholder="e.g., schema_migration"
                                value={triggerName}
                                onChange={(e) => setTriggerName(e.target.value)}
                                className="font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium">Payload (JSON)</label>
                            <Textarea
                                placeholder='{"key": "value"}'
                                value={triggerPayload}
                                onChange={(e) => setTriggerPayload(e.target.value)}
                                rows={5}
                                className="font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium">Priority</label>
                            <Input
                                type="number"
                                min={0}
                                value={triggerPriority}
                                onChange={(e) => setTriggerPriority(parseInt(e.target.value, 10) || 0)}
                                className="w-24 text-xs"
                            />
                            <p className="text-xs text-muted-foreground">
                                Higher priority jobs are processed first.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTriggerOpen(false)}>Cancel</Button>
                        <Button onClick={handleTriggerJob} disabled={!triggerName.trim() || triggerLoading}>
                            {triggerLoading ? (
                                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                            ) : (
                                <Play className="mr-1.5 size-3.5" />
                            )}
                            {triggerLoading ? "Triggering..." : "Trigger"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
