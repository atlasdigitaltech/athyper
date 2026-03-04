"use client";

// components/debug/SessionDebugConsole.tsx
//
// Read-only debug data display for the current auth session.
// Renders 4 tabs: Session, Identity, Security, Platform.
// Receives data as props from DiagnosticsConsole (parent).

import {
    AlertTriangle,
    Loader2,
} from "lucide-react";
import { useState } from "react";

import { DebugRow, DebugSection } from "@/components/debug/DebugSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMessages } from "@/lib/i18n/messages-context";

// Type alias for the debug API response
type DebugData = Record<string, any>;

// Badge color mapping for session verdicts
function verdictVariant(verdict: string): "default" | "secondary" | "destructive" | "outline" {
    switch (verdict) {
        case "healthy": return "default";
        case "degraded": return "secondary";
        case "reauth_required": return "destructive";
        default: return "outline";
    }
}

function stateVariant(state: string): "default" | "secondary" | "destructive" | "outline" {
    switch (state) {
        case "active":
        case "valid":
            return "default";
        case "idle_warning":
        case "expiring":
            return "secondary";
        case "idle_expired":
        case "expired":
        case "revoked":
            return "destructive";
        default:
            return "outline";
    }
}

function boolBadge(val: boolean | null | undefined, trueLabel = "Yes", falseLabel = "No") {
    if (val === null || val === undefined) return <Badge variant="outline">—</Badge>;
    return val
        ? <Badge variant="default">{trueLabel}</Badge>
        : <Badge variant="destructive">{falseLabel}</Badge>;
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

function formatSeconds(sec: number | null | undefined): string {
    if (sec === null || sec === undefined) return "—";
    if (sec <= 0) return "0s (expired)";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface SessionDebugConsoleProps {
    data: DebugData | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
}

export function SessionDebugConsole({ data, loading, error, onRetry }: SessionDebugConsoleProps) {
    const [revealTokens, setRevealTokens] = useState(false);
    const { t } = useMessages();

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="ms-2 text-muted-foreground">{t("diag.inspector.loading")}</span>
            </div>
        );
    }

    // Error state
    if (error || !data) {
        return (
            <Card>
                <CardContent className="flex items-center gap-3 p-6">
                    <AlertTriangle className="size-5 text-destructive" />
                    <div>
                        <p className="font-medium">{t("diag.inspector.load_failed")}</p>
                        <p className="text-sm text-muted-foreground">{error ?? t("diag.inspector.no_data")}</p>
                    </div>
                    <Button variant="outline" size="sm" className="ms-auto" onClick={onRetry}>
                        {t("diag.inspector.retry")}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const session = data.session as DebugData | undefined;
    const keycloak = data.keycloak as DebugData | undefined;
    const audiencePolicy = data.audiencePolicy as DebugData | undefined;
    const tenantCheck = data.tenantCheck as DebugData | undefined;
    const jwt = data.jwt as DebugData | undefined;
    const refreshToken = data.refreshToken as DebugData | undefined;
    const refreshStrategy = data.refreshStrategy as DebugData | undefined;
    const jwksStatus = data.jwksStatus as DebugData | undefined;
    const redis = data.redis as DebugData | undefined;
    const canRevealTokens = data.canRevealTokens ?? (jwt?.redacted === false);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{t("diag.inspector.title")}</h3>
                <span className="text-xs text-muted-foreground">{t("diag.inspector.auto_refresh")}</span>
            </div>

            <Tabs defaultValue="session">
                <TabsList>
                    <TabsTrigger value="session">{t("diag.inspector.tab.session")}</TabsTrigger>
                    <TabsTrigger value="identity">{t("diag.inspector.tab.identity")}</TabsTrigger>
                    <TabsTrigger value="security">{t("diag.inspector.tab.security")}</TabsTrigger>
                    <TabsTrigger value="platform">{t("diag.inspector.tab.platform")}</TabsTrigger>
                </TabsList>

                {/* Tab 1: Session */}
                <TabsContent value="session" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.session_health")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">{t("diag.field.verdict")}</p>
                                    <Badge variant={verdictVariant(session?.verdict ?? "")}>
                                        {session?.verdict ?? "—"}
                                    </Badge>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">{t("diag.field.session_state")}</p>
                                    <Badge variant={stateVariant(session?.sessionState ?? "")}>
                                        {session?.sessionState ?? "—"}
                                    </Badge>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">{t("diag.field.token_state")}</p>
                                    <Badge variant={stateVariant(session?.tokenState ?? "")}>
                                        {session?.tokenState ?? "—"}
                                    </Badge>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">{t("diag.field.refresh_valid")}</p>
                                    {boolBadge(session?.refreshValid, t("diag.value.yes"), t("diag.value.no"))}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">{t("diag.field.session_source")}</p>
                                    <Badge variant="outline">{session?.sessionSource ?? "—"}</Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.identity_card")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <DebugRow label={t("diag.field.user_id")} value={session?.userId} mono />
                            <DebugRow label={t("diag.field.username")} value={session?.username} />
                            <DebugRow label={t("diag.field.display_name")} value={session?.displayName} />
                            <DebugRow label={t("diag.field.email")} value={session?.email ?? "—"} />
                            <DebugRow label={t("diag.field.persona")} value={<Badge variant="secondary">{session?.persona ?? "—"}</Badge>} />
                            <DebugRow label={t("diag.field.workbench")} value={session?.workbench} />
                            <DebugRow label={t("diag.field.realm")} value={session?.realmKey} mono />
                            <DebugRow label={t("diag.field.tenant_id")} value={session?.tenantId} mono />
                            <Separator className="my-2" />
                            <DebugRow
                                label={t("diag.field.roles")}
                                value={
                                    Array.isArray(session?.roles) && session.roles.length > 0 ? (
                                        <div className="flex flex-wrap gap-1 justify-end">
                                            {session.roles.map((r: string) => (
                                                <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                                            ))}
                                        </div>
                                    ) : "—"
                                }
                            />
                            <DebugRow label={t("diag.field.token_type")} value={session?.tokenType} />
                            <DebugRow label={t("diag.field.scope")} value={session?.scope} mono />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 2: Identity */}
                <TabsContent value="identity" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.identity_session")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <DebugRow label={t("diag.field.identity_session_id")} value={session?.keycloakSessionId} mono />
                            <DebugRow label={t("diag.field.token_remaining")} value={formatSeconds(session?.tokenRemaining)} />
                            <DebugRow label={t("diag.field.idle_remaining")} value={formatSeconds(session?.idleRemaining)} />
                            <DebugRow label={t("diag.field.idle_timeout")} value={`${session?.idleTimeoutSec ?? 900}s`} />
                            <Separator className="my-2" />
                            <DebugRow label={t("diag.field.issued_at")} value={formatDate(session?.issuedAt)} />
                            <DebugRow label={t("diag.field.expires_at")} value={formatDate(session?.expiresAt)} />
                            <DebugRow label={t("diag.field.last_seen")} value={formatDate(session?.lastSeenAt)} />
                            <DebugRow label={t("diag.field.server_time")} value={formatDate(data.serverTime as string)} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.idp_config")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <DebugRow label={t("diag.field.base_url")} value={keycloak?.baseUrl} mono />
                            <DebugRow label={t("diag.field.realm")} value={keycloak?.realm} />
                            <DebugRow label={t("diag.field.client_id")} value={keycloak?.clientId} mono />
                            <DebugRow label={t("diag.field.issuer_url")} value={keycloak?.issuerUrl} mono />
                            <DebugRow label={t("diag.field.token_endpoint")} value={keycloak?.tokenEndpoint} mono />
                            <DebugRow label={t("diag.field.userinfo_endpoint")} value={keycloak?.userinfoEndpoint} mono />
                            <Separator className="my-2" />
                            <DebugRow
                                label={t("diag.field.jwks_status")}
                                value={boolBadge(jwksStatus?.reachable, t("diag.value.reachable"), t("diag.value.unreachable"))}
                            />
                            <DebugRow label={t("diag.field.jwks_latency")} value={jwksStatus?.fetchLatencyMs != null ? `${jwksStatus.fetchLatencyMs}ms` : "—"} />
                            <DebugRow label={t("diag.field.jwks_key_count")} value={jwksStatus?.keyCount ?? "—"} />
                            {jwksStatus?.lastError && (
                                <DebugRow label={t("diag.field.jwks_error")} value={<span className="text-destructive text-xs">{String(jwksStatus.lastError)}</span>} />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 3: Security */}
                <TabsContent value="security" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.audience_policy")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <DebugRow label={t("diag.field.aud")} value={typeof audiencePolicy?.aud === "string" ? audiencePolicy.aud : JSON.stringify(audiencePolicy?.aud)} mono />
                            <DebugRow label={t("diag.field.azp")} value={audiencePolicy?.azp} mono />
                            <DebugRow label={t("diag.field.enforcement")} value={audiencePolicy?.enforcement} />
                            <Separator className="my-2" />
                            <DebugRow
                                label={t("diag.field.granted_scopes")}
                                value={
                                    Array.isArray(audiencePolicy?.grantedScopes) ? (
                                        <div className="flex flex-wrap gap-1 justify-end">
                                            {audiencePolicy.grantedScopes.map((s: string) => (
                                                <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                                            ))}
                                        </div>
                                    ) : "—"
                                }
                            />
                            <DebugRow
                                label={t("diag.field.required_scopes")}
                                value={
                                    Array.isArray(audiencePolicy?.requiredScopes) ? (
                                        <div className="flex flex-wrap gap-1 justify-end">
                                            {audiencePolicy.requiredScopes.map((s: string) => (
                                                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                                            ))}
                                        </div>
                                    ) : "—"
                                }
                            />
                            <DebugRow
                                label={t("diag.field.scope_check")}
                                value={
                                    <Badge variant={audiencePolicy?.scopeCheck === "pass" ? "default" : "destructive"}>
                                        {audiencePolicy?.scopeCheck ?? "—"}
                                    </Badge>
                                }
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.tenant_isolation")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <DebugRow
                                label={t("diag.field.validated")}
                                value={boolBadge(tenantCheck?.validated, t("diag.value.pass"), t("diag.value.mismatch"))}
                            />
                            <DebugRow label={t("diag.field.request_tenant")} value={tenantCheck?.requestTenantId} mono />
                            <DebugRow label={t("diag.field.session_tenant")} value={tenantCheck?.sessionTenantId} mono />
                            <DebugRow label={t("diag.field.source")} value={tenantCheck?.tenantSource} />
                            {tenantCheck?.note && (
                                <p className="text-xs text-muted-foreground mt-2 italic">{tenantCheck.note}</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.jwt_metadata")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <DebugSection title={t("diag.inspector.access_token_header")}>
                                <DebugRow label={t("diag.field.algorithm")} value={jwt?.header?.alg} mono />
                                <DebugRow label={t("diag.field.type")} value={jwt?.header?.typ} />
                                <DebugRow label={t("diag.field.key_id")} value={jwt?.header?.kid} mono />
                            </DebugSection>

                            <Separator className="my-3" />

                            <DebugSection title={t("diag.inspector.access_token_payload")}>
                                <DebugRow label={t("diag.field.issuer_iss")} value={jwt?.payload?.iss} mono />
                                <DebugRow label={t("diag.field.subject_sub")} value={jwt?.payload?.sub} mono />
                                <DebugRow label={t("diag.field.audience_aud")} value={typeof jwt?.payload?.aud === "string" ? jwt.payload.aud : JSON.stringify(jwt?.payload?.aud)} mono />
                                <DebugRow label={t("diag.field.issued_at_iat")} value={jwt?.payload?.iat ? formatDate(new Date((jwt.payload.iat as number) * 1000).toISOString()) : "—"} />
                                <DebugRow label={t("diag.field.expires_at_exp")} value={jwt?.payload?.exp ? formatDate(new Date((jwt.payload.exp as number) * 1000).toISOString()) : "—"} />
                                <DebugRow label={t("diag.field.scope")} value={jwt?.payload?.scope} mono />
                            </DebugSection>

                            <Separator className="my-3" />

                            <DebugRow label={t("diag.field.signature_present")} value={boolBadge(jwt?.signaturePresent, t("diag.value.yes"), t("diag.value.no"))} />
                            <DebugRow label={t("diag.field.payload_redacted")} value={jwt?.redacted ? t("diag.value.safe_mode") : t("diag.value.expose_mode")} />

                            {canRevealTokens && (
                                <>
                                    <Separator className="my-3" />
                                    <div className="flex items-center justify-between py-2">
                                        <label htmlFor="reveal-tokens" className="text-sm text-muted-foreground">
                                            {t("diag.inspector.reveal_payload")}
                                        </label>
                                        <Switch
                                            id="reveal-tokens"
                                            checked={revealTokens}
                                            onCheckedChange={setRevealTokens}
                                        />
                                    </div>
                                    {revealTokens && jwt?.payload && (
                                        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs font-mono">
                                            {JSON.stringify(jwt.payload, null, 2)}
                                        </pre>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.refresh_token")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            {refreshToken ? (
                                <>
                                    <DebugRow label={t("diag.field.type")} value={refreshToken.type} />
                                    <DebugRow label={t("diag.field.expires_at")} value={formatDate(refreshToken.expiresAt)} />
                                    <DebugRow label={t("diag.field.remaining")} value={formatSeconds(refreshToken.remainingSeconds)} />
                                    <DebugRow label={t("diag.field.expired")} value={boolBadge(refreshToken.isExpired, t("diag.value.yes"), t("diag.value.no"))} />
                                    <DebugRow label={t("diag.field.issuer")} value={refreshToken.issuer} mono />
                                    <DebugRow label={t("diag.field.identity_sid")} value={refreshToken.keycloakSid} mono />
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground italic">{t("diag.inspector.no_refresh_token")}</p>
                            )}

                            <Separator className="my-3" />

                            <DebugSection title={t("diag.inspector.refresh_strategy")}>
                                <DebugRow label={t("diag.field.mode")} value={refreshStrategy?.refreshMode} />
                                <DebugRow label={t("diag.field.trigger")} value={<Badge variant="outline">{refreshStrategy?.refreshTrigger ?? "—"}</Badge>} />
                                <DebugRow label={t("diag.field.execution_status")} value={<Badge variant="outline">{refreshStrategy?.refreshExecutionStatus ?? "—"}</Badge>} />
                                <DebugRow label={t("diag.field.should_refresh_now")} value={boolBadge(refreshStrategy?.shouldRefreshNow, t("diag.value.yes"), t("diag.value.no"))} />
                                <DebugRow label={t("diag.field.last_refresh_at")} value={formatDate(refreshStrategy?.lastRefreshAt)} />
                                <DebugRow label={t("diag.field.attempts")} value={refreshStrategy?.refreshAttempts ?? 0} />
                                <DebugRow label={t("diag.field.locked")} value={boolBadge(refreshStrategy?.refreshLocked, t("diag.value.locked"), t("diag.value.no"))} />
                                <DebugRow label={t("diag.field.token_remaining")} value={formatSeconds(refreshStrategy?.refreshTokenRemaining)} />
                                {refreshStrategy?.refreshBlockedReason && (
                                    <DebugRow
                                        label={t("diag.field.blocked_reason")}
                                        value={<Badge variant="destructive">{refreshStrategy.refreshBlockedReason}</Badge>}
                                    />
                                )}
                            </DebugSection>

                            {refreshStrategy?.note && (
                                <p className="text-xs text-muted-foreground mt-2 italic">{refreshStrategy.note}</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 4: Platform */}
                <TabsContent value="platform" className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.cache_store")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <DebugRow
                                label={t("diag.field.status")}
                                value={
                                    <Badge variant={redis?.status === "connected" ? "default" : "destructive"}>
                                        {redis?.status ?? "unknown"}
                                    </Badge>
                                }
                            />
                            <DebugRow label={t("diag.field.url")} value={redis?.url} mono />
                            <DebugRow label={t("diag.field.session_key")} value={redis?.sessionKey} mono />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t("diag.inspector.server")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DebugRow label={t("diag.field.server_time")} value={formatDate(data.serverTime as string)} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
