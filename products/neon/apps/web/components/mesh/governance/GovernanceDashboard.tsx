"use client";

import {
    Activity, AlertTriangle, Archive, CheckCircle2,
    Database, FileText, Hash, Lock, RefreshCw,
    ScrollText, Shield, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import { CIRCUIT_BREAKER_BADGE, ENABLED_BADGE, SUMMARY_BORDER, SUMMARY_VALUE, healthIndicatorColor, percentBarColor } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface PipelineHealth {
    outbox: {
        pending: number;
        processing: number;
        failed: number;
        dead: number;
    };
    memoryBuffer: {
        depth: number;
        maxSize: number;
    };
    circuitBreaker: {
        state: "CLOSED" | "OPEN" | "HALF_OPEN";
        failures: number;
        successes: number;
    };
    dlq: {
        total: number;
        unreplayed: number;
        oldestAt: string | null;
    };
}

interface HashChainStatus {
    tenantsVerified: number;
    tenantsTotal: number;
    lastVerifiedAt: string | null;
    lastAnchorDate: string | null;
    chainBreaks: number;
    eventsTotal: number;
}

interface RetentionInfo {
    retentionDays: number;
    partitions: PartitionEntry[];
    nextPartitionDate: string | null;
    lastCleanupAt: string | null;
}

interface PartitionEntry {
    name: string;
    rangeStart: string;
    rangeEnd: string;
    estimatedRows: number;
    sizeBytes: number;
}

interface ComplianceStats {
    eventsTotal: number;
    eventsRedacted: number;
    eventsEncrypted: number;
    redactionCoverage: number;
    encryptionCoverage: number;
    dsarRequestsOpen: number;
    dsarRequestsCompleted: number;
}

interface FeatureFlags {
    writeMode: "off" | "sync" | "outbox";
    hashChainEnabled: boolean;
    timelineEnabled: boolean;
    encryptionEnabled: boolean;
    loadSheddingEnabled: boolean;
    tieringEnabled: boolean;
}

interface RecentAuditAccess {
    id: string;
    userId: string;
    action: string;
    scope: string;
    timestamp: string;
}

interface GovernanceData {
    pipeline: PipelineHealth;
    hashChain: HashChainStatus;
    retention: RetentionInfo;
    compliance: ComplianceStats;
    featureFlags: FeatureFlags;
    recentAccess: RecentAuditAccess[];
}

// ─── Status Helpers ──────────────────────────────────────────

function CircuitBreakerBadge({ state }: { state: string }) {
    const color = CIRCUIT_BREAKER_BADGE[state] ?? CIRCUIT_BREAKER_BADGE.HALF_OPEN;
    const icons: Record<string, typeof CheckCircle2> = { CLOSED: CheckCircle2, OPEN: XCircle };
    const labels: Record<string, string> = { CLOSED: "Closed", OPEN: "Open", HALF_OPEN: "Half-Open" };
    const Icon = icons[state] ?? AlertTriangle;
    return (
        <Badge variant="outline" className={cn("gap-1 text-xs", color)}>
            <Icon className="size-3" />
            {labels[state] ?? state}
        </Badge>
    );
}

function HealthIndicator({ value, warningThreshold, criticalThreshold, label }: {
    value: number;
    warningThreshold: number;
    criticalThreshold: number;
    label: string;
}) {
    const color = healthIndicatorColor(value, warningThreshold, criticalThreshold);

    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className={cn("text-sm font-mono font-bold", color)}>
                {value.toLocaleString()}
            </span>
        </div>
    );
}

function FeatureFlagRow({ label, enabled, value }: { label: string; enabled?: boolean; value?: string }) {
    if (value !== undefined) {
        return (
            <div className="flex items-center justify-between py-1">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Badge variant="secondary" className="text-xs font-mono">{value}</Badge>
            </div>
        );
    }
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-sm text-muted-foreground">{label}</span>
            {enabled ? (
                <Badge variant="outline" className={cn("text-xs", ENABLED_BADGE)}>
                    Enabled
                </Badge>
            ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                    Disabled
                </Badge>
            )}
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function PercentBar({ value, label }: { value: number; label: string }) {
    const barColor = percentBarColor(value);

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-medium">{value.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all", barColor)}
                    style={{ width: `${Math.min(100, value)}%` }}
                />
            </div>
        </div>
    );
}

// ─── Section Components ──────────────────────────────────────

function PipelineSection({ pipeline }: { pipeline: PipelineHealth }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="size-4" />
                    Audit Pipeline
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <HealthIndicator
                    value={pipeline.outbox.pending}
                    warningThreshold={10000}
                    criticalThreshold={50000}
                    label="Outbox pending"
                />
                <HealthIndicator
                    value={pipeline.outbox.processing}
                    warningThreshold={500}
                    criticalThreshold={2000}
                    label="Outbox processing"
                />
                <HealthIndicator
                    value={pipeline.outbox.failed}
                    warningThreshold={10}
                    criticalThreshold={100}
                    label="Outbox failed"
                />
                <HealthIndicator
                    value={pipeline.outbox.dead}
                    warningThreshold={1}
                    criticalThreshold={50}
                    label="Outbox dead"
                />
                <div className="border-t pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Memory buffer</span>
                        <span className="text-sm font-mono">
                            {pipeline.memoryBuffer.depth} / {pipeline.memoryBuffer.maxSize}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Circuit breaker</span>
                        <CircuitBreakerBadge state={pipeline.circuitBreaker.state} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function DlqSection({ dlq }: { dlq: PipelineHealth["dlq"] }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ShieldAlert className="size-4" />
                    Dead Letter Queue
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total entries</span>
                    <span className={cn(
                        "text-2xl font-bold",
                        dlq.total > 0 ? "text-warning" : "text-success",
                    )}>
                        {dlq.total}
                    </span>
                </div>
                <HealthIndicator
                    value={dlq.unreplayed}
                    warningThreshold={1}
                    criticalThreshold={100}
                    label="Unreplayed"
                />
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Oldest entry</span>
                    <span className="text-xs font-mono text-muted-foreground">
                        {dlq.oldestAt ? new Date(dlq.oldestAt).toLocaleDateString() : "—"}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

function HashChainSection({ hashChain }: { hashChain: HashChainStatus }) {
    const allVerified = hashChain.tenantsVerified === hashChain.tenantsTotal && hashChain.chainBreaks === 0;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Hash className="size-4" />
                    Hash Chain Integrity
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    {allVerified ? (
                        <Badge variant="outline" className="gap-1 text-xs border-success text-success">
                            <ShieldCheck className="size-3" />
                            Verified
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="gap-1 text-xs border-destructive text-destructive">
                            <XCircle className="size-3" />
                            Issues
                        </Badge>
                    )}
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tenants verified</span>
                    <span className="text-sm font-mono">
                        {hashChain.tenantsVerified} / {hashChain.tenantsTotal}
                    </span>
                </div>
                <HealthIndicator
                    value={hashChain.chainBreaks}
                    warningThreshold={1}
                    criticalThreshold={1}
                    label="Chain breaks"
                />
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total events</span>
                    <span className="text-sm font-mono">{hashChain.eventsTotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Last anchor</span>
                    <span className="text-xs font-mono text-muted-foreground">
                        {hashChain.lastAnchorDate ?? "—"}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Last verified</span>
                    <span className="text-xs font-mono text-muted-foreground">
                        {hashChain.lastVerifiedAt ? new Date(hashChain.lastVerifiedAt).toLocaleString() : "—"}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

function ComplianceSection({ compliance }: { compliance: ComplianceStats }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="size-4" />
                    Compliance
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total audit events</span>
                    <span className="text-sm font-mono font-bold">{compliance.eventsTotal.toLocaleString()}</span>
                </div>
                <PercentBar value={compliance.redactionCoverage} label="PII redaction coverage" />
                <PercentBar value={compliance.encryptionCoverage} label="Column encryption coverage" />
                <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Events redacted</span>
                        <span className="font-mono">{compliance.eventsRedacted.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Events encrypted</span>
                        <span className="font-mono">{compliance.eventsEncrypted.toLocaleString()}</span>
                    </div>
                </div>
                <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <FileText className="size-3" />
                            DSAR open
                        </span>
                        <span className={cn(
                            "font-mono font-medium",
                            compliance.dsarRequestsOpen > 0 ? "text-warning" : "",
                        )}>
                            {compliance.dsarRequestsOpen}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CheckCircle2 className="size-3" />
                            DSAR completed
                        </span>
                        <span className="font-mono">{compliance.dsarRequestsCompleted}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function RetentionSection({ retention }: { retention: RetentionInfo }) {
    return (
        <Card className="md:col-span-2">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Archive className="size-4" />
                    Retention & Partitions
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-6 text-sm">
                    <span className="text-muted-foreground">
                        Retention: <span className="font-mono font-medium text-foreground">{retention.retentionDays} days</span>
                    </span>
                    <span className="text-muted-foreground">
                        Last cleanup: <span className="font-mono text-foreground">
                            {retention.lastCleanupAt ? new Date(retention.lastCleanupAt).toLocaleDateString() : "—"}
                        </span>
                    </span>
                    <span className="text-muted-foreground">
                        Next partition: <span className="font-mono text-foreground">
                            {retention.nextPartitionDate ?? "—"}
                        </span>
                    </span>
                </div>

                {retention.partitions.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Partition</TableHead>
                                <TableHead>Range</TableHead>
                                <TableHead className="text-right">Rows (est.)</TableHead>
                                <TableHead className="text-right">Size</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {retention.partitions.map((p) => (
                                <TableRow key={p.name}>
                                    <TableCell className="font-mono text-xs">{p.name}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {p.rangeStart} — {p.rangeEnd}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {p.estimatedRows.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {formatBytes(p.sizeBytes)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No partitions found.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function FeatureFlagsSection({ flags }: { flags: FeatureFlags }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Lock className="size-4" />
                    Feature Flags
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
                <FeatureFlagRow label="Write mode" value={flags.writeMode} />
                <FeatureFlagRow label="Hash chain" enabled={flags.hashChainEnabled} />
                <FeatureFlagRow label="Activity timeline" enabled={flags.timelineEnabled} />
                <FeatureFlagRow label="Column encryption" enabled={flags.encryptionEnabled} />
                <FeatureFlagRow label="Load shedding" enabled={flags.loadSheddingEnabled} />
                <FeatureFlagRow label="Storage tiering" enabled={flags.tieringEnabled} />
            </CardContent>
        </Card>
    );
}

function RecentAccessSection({ entries }: { entries: RecentAuditAccess[] }) {
    return (
        <Card className="md:col-span-2">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ScrollText className="size-4" />
                    Recent Audit Access
                </CardTitle>
            </CardHeader>
            <CardContent>
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No recent audit access events.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Timestamp</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Scope</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {entries.map((entry) => (
                                <TableRow key={entry.id}>
                                    <TableCell className="text-xs text-muted-foreground font-mono">
                                        {new Date(entry.timestamp).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono">{entry.userId}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="text-xs">
                                            {entry.action}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{entry.scope}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Data Hook ───────────────────────────────────────────────

interface UseGovernanceDataResult {
    data: GovernanceData | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

function useGovernanceData(): UseGovernanceDataResult {
    const [data, setData] = useState<GovernanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/admin/mesh/governance", {
                headers: buildHeaders(),
                credentials: "same-origin",
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load governance data (${res.status})`);
            }

            const body = (await res.json()) as { data: GovernanceData };
            setData(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load governance data");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchData();
        return () => abortRef.current?.abort();
    }, [fetchData]);

    return { data, loading, error, refresh: fetchData };
}

// ─── Dashboard ───────────────────────────────────────────────

export function GovernanceDashboard() {
    const { data, loading, error, refresh } = useGovernanceData();

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-80" />
                    </div>
                    <Skeleton className="h-9 w-24" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-[240px] rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Audit & Governance</h2>
                    <p className="text-sm text-muted-foreground">
                        Compliance controls, tamper evidence, and audit pipeline health.
                    </p>
                </div>
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                    <p className="text-sm text-destructive">{error ?? "Failed to load governance data"}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
                        <RefreshCw className="mr-1.5 size-3.5" />
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Audit & Governance</h2>
                    <p className="text-sm text-muted-foreground">
                        Compliance controls, tamper evidence, and audit pipeline health.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={refresh}>
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Refresh
                </Button>
            </div>

            {/* Top-level summary */}
            <div className="grid gap-4 md:grid-cols-4">
                <SummaryCard
                    icon={Database}
                    label="Outbox Lag"
                    value={data.pipeline.outbox.pending}
                    status={
                        data.pipeline.outbox.pending >= 50000 ? "critical"
                            : data.pipeline.outbox.pending >= 10000 ? "warning"
                                : "healthy"
                    }
                />
                <SummaryCard
                    icon={Hash}
                    label="Chain Integrity"
                    value={data.hashChain.chainBreaks === 0 ? "OK" : `${data.hashChain.chainBreaks} breaks`}
                    status={data.hashChain.chainBreaks === 0 ? "healthy" : "critical"}
                />
                <SummaryCard
                    icon={ShieldAlert}
                    label="DLQ Depth"
                    value={data.pipeline.dlq.unreplayed}
                    status={
                        data.pipeline.dlq.unreplayed >= 100 ? "critical"
                            : data.pipeline.dlq.unreplayed > 0 ? "warning"
                                : "healthy"
                    }
                />
                <SummaryCard
                    icon={Shield}
                    label="Redaction"
                    value={`${data.compliance.redactionCoverage.toFixed(0)}%`}
                    status={
                        data.compliance.redactionCoverage < 50 ? "critical"
                            : data.compliance.redactionCoverage < 80 ? "warning"
                                : "healthy"
                    }
                />
            </div>

            {/* Detail sections */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <PipelineSection pipeline={data.pipeline} />
                <HashChainSection hashChain={data.hashChain} />
                <ComplianceSection compliance={data.compliance} />
                <DlqSection dlq={data.pipeline.dlq} />
                <FeatureFlagsSection flags={data.featureFlags} />
            </div>

            {/* Wide sections */}
            <div className="grid gap-4 md:grid-cols-2">
                <RetentionSection retention={data.retention} />
                <RecentAccessSection entries={data.recentAccess} />
            </div>
        </div>
    );
}

// ─── Summary Card ────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, status }: {
    icon: typeof Database;
    label: string;
    value: number | string;
    status: "healthy" | "warning" | "critical";
}) {
    return (
        <Card className={cn("border-l-4", SUMMARY_BORDER[status])}>
            <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Icon className="size-4" />
                    <span className="text-xs font-medium">{label}</span>
                </div>
                <div className={cn("text-2xl font-bold font-mono", SUMMARY_VALUE[status])}>
                    {typeof value === "number" ? value.toLocaleString() : value}
                </div>
            </CardContent>
        </Card>
    );
}
