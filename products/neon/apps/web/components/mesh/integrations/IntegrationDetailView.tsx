"use client";

import {
    Activity, AlertTriangle, ArrowDownToLine, ArrowUpFromLine,
    CheckCircle2, Clock, Cog, Copy, ExternalLink, Key,
    MoreVertical, Pause, Play, Plus, RefreshCw,
    Trash2, Webhook, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BackLink } from "@/components/mesh/shared/BackLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import { ENDPOINT_TYPE_BADGE, ACTIVE_BADGE } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface IntegrationFlow {
    id: string;
    code: string;
    name: string;
    entityName: string;
    flowDirection: "inbound" | "outbound" | "bidirectional";
    triggerMode: "realtime" | "scheduled" | "manual";
    scheduleCron: string | null;
    syncMode: "full" | "incremental" | "delta";
    fieldMappingCount: number;
    isActive: boolean;
    lastRunAt: string | null;
    lastRunStatus: "success" | "failure" | "partial" | null;
}

interface WebhookSubscription {
    id: string;
    eventPattern: string;
    targetUrl: string;
    authMethod: string;
    deliveryMode: "sync" | "async";
    isActive: boolean;
    lastDeliveryAt: string | null;
    lastDeliveryStatus: "success" | "failure" | null;
}

interface DeliveryLogEntry {
    id: string;
    flowId: string | null;
    direction: "outbound" | "inbound";
    status: "success" | "failure" | "partial";
    recordsSent: number | null;
    recordsFailed: number | null;
    durationMs: number | null;
    errorMessage: string | null;
    occurredAt: string;
}

interface IntegrationDetail {
    id: string;
    code: string;
    name: string;
    description: string | null;
    endpointType: "rest_api" | "graphql" | "soap" | "webhook";
    baseUrl: string;
    authMethod: "none" | "api_key" | "basic" | "oauth2" | "hmac";
    headers: Record<string, string> | null;
    timeoutMs: number;
    retryPolicy: {
        maxAttempts: number;
        backoffStrategy: string;
        initialDelayMs: number;
    } | null;
    circuitBreaker: {
        enabled: boolean;
        failureThreshold: number;
        successThreshold: number;
        timeoutMs: number;
    } | null;
    isActive: boolean;
    flows: IntegrationFlow[];
    webhooks: WebhookSubscription[];
    recentDeliveries: DeliveryLogEntry[];
    createdAt: string;
    updatedAt: string | null;
    createdBy: string;
}

type TabId = "flows" | "webhooks" | "deliveries" | "config";

// ─── Type & Auth Labels ──────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
    rest_api: "REST API",
    graphql: "GraphQL",
    soap: "SOAP",
    webhook: "Webhook",
};

const AUTH_LABELS: Record<string, string> = {
    none: "None",
    api_key: "API Key",
    basic: "Basic Auth",
    oauth2: "OAuth 2.0",
    hmac: "HMAC",
};

// ─── Direction Badge ─────────────────────────────────────────

function DirectionBadge({ direction }: { direction: string }) {
    if (direction === "inbound") {
        return (
            <Badge variant="outline" className="gap-1 text-xs">
                <ArrowDownToLine className="size-3" />
                Inbound
            </Badge>
        );
    }
    if (direction === "outbound") {
        return (
            <Badge variant="outline" className="gap-1 text-xs">
                <ArrowUpFromLine className="size-3" />
                Outbound
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className="gap-1 text-xs">
            <Activity className="size-3" />
            Bidirectional
        </Badge>
    );
}

// ─── Trigger Badge ───────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
    realtime: "Realtime",
    scheduled: "Scheduled",
    manual: "Manual",
};

function TriggerBadge({ mode, cron }: { mode: string; cron: string | null }) {
    const label = TRIGGER_LABELS[mode] ?? mode;
    return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {label}
            {cron && <code className="text-[10px] font-mono bg-muted px-1 rounded">{cron}</code>}
        </span>
    );
}

// ─── Status Icon ─────────────────────────────────────────────

function StatusIcon({ status }: { status: string | null }) {
    if (status === "success") return <CheckCircle2 className="size-3.5 text-success" />;
    if (status === "failure") return <XCircle className="size-3.5 text-destructive" />;
    if (status === "partial") return <AlertTriangle className="size-3.5 text-warning" />;
    return <span className="text-xs text-muted-foreground italic">—</span>;
}

// ─── Tabs ────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
    { id: "flows", label: "Data Flows" },
    { id: "webhooks", label: "Webhooks" },
    { id: "deliveries", label: "Delivery Log" },
    { id: "config", label: "Configuration" },
];

// ─── Flows Tab ───────────────────────────────────────────────

function FlowsTab({ flows }: { flows: IntegrationFlow[] }) {
    if (flows.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                    <Activity className="size-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">No data flows configured</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Create data flows to synchronize entity records with this integration endpoint.
                </p>
                <Button size="sm" className="mt-4">
                    <Plus className="mr-1.5 size-3.5" />
                    Add Flow
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <Button size="sm">
                    <Plus className="mr-1.5 size-3.5" />
                    Add Flow
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Sync Mode</TableHead>
                        <TableHead className="text-center">Mappings</TableHead>
                        <TableHead>Last Run</TableHead>
                        <TableHead className="w-[60px]" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {flows.map((flow) => (
                        <TableRow key={flow.id} className={cn(!flow.isActive && "opacity-50")}>
                            <TableCell>
                                <div>
                                    <span className="font-medium">{flow.name}</span>
                                    <p className="text-xs text-muted-foreground font-mono">{flow.code}</p>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="secondary" className="text-xs font-mono">
                                    {flow.entityName}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <DirectionBadge direction={flow.flowDirection} />
                            </TableCell>
                            <TableCell>
                                <TriggerBadge mode={flow.triggerMode} cron={flow.scheduleCron} />
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className="text-xs capitalize">
                                    {flow.syncMode}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-center text-xs">
                                {flow.fieldMappingCount}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5">
                                    <StatusIcon status={flow.lastRunStatus} />
                                    {flow.lastRunAt && (
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(flow.lastRunAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="size-7 p-0">
                                            <MoreVertical className="size-3.5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem>
                                            <Play className="mr-2 size-3.5" />
                                            Run Now
                                        </DropdownMenuItem>
                                        <DropdownMenuItem>
                                            <Copy className="mr-2 size-3.5" />
                                            Duplicate
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive">
                                            <Trash2 className="mr-2 size-3.5" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

// ─── Webhooks Tab ────────────────────────────────────────────

function WebhooksTab({ webhooks }: { webhooks: WebhookSubscription[] }) {
    if (webhooks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                    <Webhook className="size-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">No webhook subscriptions</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Subscribe to events and deliver notifications to external systems via webhooks.
                </p>
                <Button size="sm" className="mt-4">
                    <Plus className="mr-1.5 size-3.5" />
                    Add Webhook
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <Button size="sm">
                    <Plus className="mr-1.5 size-3.5" />
                    Add Webhook
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Event Pattern</TableHead>
                        <TableHead>Target URL</TableHead>
                        <TableHead>Auth</TableHead>
                        <TableHead>Delivery</TableHead>
                        <TableHead>Last Delivery</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px]" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {webhooks.map((webhook) => (
                        <TableRow key={webhook.id} className={cn(!webhook.isActive && "opacity-50")}>
                            <TableCell>
                                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                                    {webhook.eventPattern}
                                </code>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono max-w-[200px] truncate">
                                {webhook.targetUrl}
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className="text-xs">
                                    {AUTH_LABELS[webhook.authMethod] ?? webhook.authMethod}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className="text-xs capitalize">
                                    {webhook.deliveryMode}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-1.5">
                                    <StatusIcon status={webhook.lastDeliveryStatus} />
                                    {webhook.lastDeliveryAt && (
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(webhook.lastDeliveryAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                {webhook.isActive ? (
                                    <Badge variant="outline" className={cn("text-xs", ACTIVE_BADGE)}>
                                        Active
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                        Paused
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="size-7 p-0">
                                            <MoreVertical className="size-3.5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem>
                                            <RefreshCw className="mr-2 size-3.5" />
                                            Test Delivery
                                        </DropdownMenuItem>
                                        <DropdownMenuItem>
                                            {webhook.isActive ? (
                                                <><Pause className="mr-2 size-3.5" />Pause</>
                                            ) : (
                                                <><Play className="mr-2 size-3.5" />Resume</>
                                            )}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive">
                                            <Trash2 className="mr-2 size-3.5" />
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

// ─── Delivery Log Tab ────────────────────────────────────────

function DeliveryLogTab({ deliveries }: { deliveries: DeliveryLogEntry[] }) {
    if (deliveries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                    <Clock className="size-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium">No delivery history</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Delivery logs will appear here once data flows or webhooks have executed.
                </p>
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Sent</TableHead>
                    <TableHead className="text-center">Failed</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Error</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {deliveries.map((entry) => (
                    <TableRow key={entry.id}>
                        <TableCell className="text-xs text-muted-foreground">
                            {new Date(entry.occurredAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                            <DirectionBadge direction={entry.direction} />
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-1.5">
                                <StatusIcon status={entry.status} />
                                <span className="text-xs capitalize">{entry.status}</span>
                            </div>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                            {entry.recordsSent ?? "—"}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                            {entry.recordsFailed ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground font-mono">
                            {entry.durationMs != null ? `${entry.durationMs}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                            {entry.errorMessage ?? "—"}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

// ─── Config Tab ──────────────────────────────────────────────

function ConfigTab({ integration }: { integration: IntegrationDetail }) {
    return (
        <div className="space-y-6">
            {/* Connection */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Connection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <ConfigRow label="Base URL" value={integration.baseUrl} mono />
                    <ConfigRow
                        label="Endpoint Type"
                        value={TYPE_LABELS[integration.endpointType] ?? integration.endpointType}
                    />
                    <ConfigRow label="Timeout" value={`${integration.timeoutMs}ms`} />
                </CardContent>
            </Card>

            {/* Authentication */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Key className="size-4" />
                        Authentication
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <ConfigRow
                        label="Method"
                        value={AUTH_LABELS[integration.authMethod] ?? integration.authMethod}
                    />
                    {integration.authMethod !== "none" && (
                        <div className="rounded-md border border-warning bg-warning/10 px-3 py-1.5 text-xs text-warning">
                            Credentials are encrypted and not displayed. Edit to update.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Headers */}
            {integration.headers && Object.keys(integration.headers).length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Custom Headers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border overflow-hidden">
                            {Object.entries(integration.headers).map(([key, value]) => (
                                <div key={key} className="flex border-b last:border-b-0">
                                    <span className="px-3 py-1.5 text-xs font-mono font-medium bg-muted w-1/3 border-r">
                                        {key}
                                    </span>
                                    <span className="px-3 py-1.5 text-xs font-mono text-muted-foreground flex-1">
                                        {value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Retry Policy */}
            {integration.retryPolicy && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Retry Policy</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <ConfigRow label="Max Attempts" value={String(integration.retryPolicy.maxAttempts)} />
                        <ConfigRow label="Backoff" value={integration.retryPolicy.backoffStrategy} />
                        <ConfigRow label="Initial Delay" value={`${integration.retryPolicy.initialDelayMs}ms`} />
                    </CardContent>
                </Card>
            )}

            {/* Circuit Breaker */}
            {integration.circuitBreaker && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Circuit Breaker</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <ConfigRow
                            label="Status"
                            value={integration.circuitBreaker.enabled ? "Enabled" : "Disabled"}
                        />
                        <ConfigRow label="Failure Threshold" value={String(integration.circuitBreaker.failureThreshold)} />
                        <ConfigRow label="Success Threshold" value={String(integration.circuitBreaker.successThreshold)} />
                        <ConfigRow label="Timeout" value={`${integration.circuitBreaker.timeoutMs}ms`} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("font-medium", mono && "font-mono text-xs")}>{value}</span>
        </div>
    );
}

// ─── Data Hook ───────────────────────────────────────────────

interface UseIntegrationDetailResult {
    integration: IntegrationDetail | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

function useIntegrationDetail(integrationId: string): UseIntegrationDetailResult {
    const [integration, setIntegration] = useState<IntegrationDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchIntegration = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/admin/mesh/integration-studio/${encodeURIComponent(integrationId)}`, {
                headers: buildHeaders(),
                credentials: "same-origin",
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load integration (${res.status})`);
            }

            const body = (await res.json()) as { data: IntegrationDetail };
            setIntegration(body.data);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load integration");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [integrationId]);

    useEffect(() => {
        fetchIntegration();
        return () => abortRef.current?.abort();
    }, [fetchIntegration]);

    return { integration, loading, error, refresh: fetchIntegration };
}

// ─── Detail View ─────────────────────────────────────────────

interface IntegrationDetailViewProps {
    integrationId: string;
    backHref: string;
}

export function IntegrationDetailView({ integrationId, backHref }: IntegrationDetailViewProps) {
    const { integration, loading, error, refresh } = useIntegrationDetail(integrationId);
    const [activeTab, setActiveTab] = useState<TabId>("flows");

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[300px] rounded-lg" />
            </div>
        );
    }

    if (error || !integration) {
        return (
            <div className="space-y-4">
                <BackLink href={backHref} label="Back to Integration Studio" />
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
                    <p className="text-sm text-destructive">{error ?? "Integration not found"}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    const typeColor = ENDPOINT_TYPE_BADGE[integration.endpointType] ?? "";

    return (
        <div className="space-y-4">
            {/* Header */}
            <BackLink href={backHref} label="Back to Integration Studio" />

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight truncate">
                        {integration.name}
                    </h2>
                    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium shrink-0", typeColor)}>
                        {TYPE_LABELS[integration.endpointType] ?? integration.endpointType}
                    </span>
                    {integration.isActive ? (
                        <Badge variant="outline" className={cn("text-xs shrink-0", ACTIVE_BADGE)}>
                            Active
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                            Inactive
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={refresh}>
                        <RefreshCw className="size-3.5" />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <MoreVertical className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                                <Cog className="mr-2 size-4" />
                                Edit Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <ExternalLink className="mr-2 size-4" />
                                Test Connection
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                {integration.isActive ? (
                                    <><Pause className="mr-2 size-4" />Deactivate</>
                                ) : (
                                    <><Play className="mr-2 size-4" />Activate</>
                                )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                                <Trash2 className="mr-2 size-4" />
                                Delete Integration
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {integration.description && (
                <p className="text-sm text-muted-foreground">{integration.description}</p>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                    {integration.baseUrl}
                </code>
                <span>·</span>
                <span>{AUTH_LABELS[integration.authMethod] ?? integration.authMethod}</span>
                <span>·</span>
                <span>Timeout {integration.timeoutMs}ms</span>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Data Flows
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{integration.flows.length}</div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>
                                {integration.flows.filter((f) => f.isActive).length} active
                            </span>
                            <span>
                                {integration.flows.filter((f) => f.flowDirection === "outbound").length} outbound
                            </span>
                            <span>
                                {integration.flows.filter((f) => f.flowDirection === "inbound").length} inbound
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Webhooks
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{integration.webhooks.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {integration.webhooks.filter((w) => w.isActive).length} active subscriptions
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Recent Deliveries
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{integration.recentDeliveries.length}</div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="size-3 text-success" />
                                {integration.recentDeliveries.filter((d) => d.status === "success").length}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <XCircle className="size-3 text-destructive" />
                                {integration.recentDeliveries.filter((d) => d.status === "failure").length}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-1 border-b" role="tablist">
                {TABS.map((tab) => {
                    let count: number | null = null;
                    if (tab.id === "flows") count = integration.flows.length;
                    if (tab.id === "webhooks") count = integration.webhooks.length;
                    if (tab.id === "deliveries") count = integration.recentDeliveries.length;

                    return (
                        <button
                            key={tab.id}
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors",
                                activeTab === tab.id
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {tab.label}
                            {count != null && count > 0 && (
                                <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                                    {count}
                                </Badge>
                            )}
                            {activeTab === tab.id && (
                                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Tab Content */}
            <div className="min-h-[200px]">
                {activeTab === "flows" && <FlowsTab flows={integration.flows} />}
                {activeTab === "webhooks" && <WebhooksTab webhooks={integration.webhooks} />}
                {activeTab === "deliveries" && <DeliveryLogTab deliveries={integration.recentDeliveries} />}
                {activeTab === "config" && <ConfigTab integration={integration} />}
            </div>
        </div>
    );
}
