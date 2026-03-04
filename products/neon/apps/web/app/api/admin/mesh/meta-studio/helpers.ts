import "server-only";

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import { hasDirectDb, getEntityDirect } from "./db";
import { checkRateLimit } from "./rate-limit";
import { isStubEnabled, resolveStub } from "./stubs";

import type { NextRequest } from "next/server";
import type { ZodSchema, ZodError } from "zod";

// ─── Path Allowlist ───────────────────────────────────────────
// Only paths matching this pattern may be proxied to the runtime API.
// Prevents arbitrary upstream requests if a route handler has a bug.

const ALLOWED_PATH_PATTERN =
    /^\/api\/meta\/entities(\/[a-zA-Z0-9_-]+(\/(?:fields|relations|indexes|policies|overlays|lifecycle|compiled|compile|versions|validation|validation\/test|diff))?)?\/?$/;

// ─── Body Size Limit ──────────────────────────────────────────

const MAX_BODY_SIZE = 256 * 1024; // 256 KB

// ─── Auth Context ─────────────────────────────────────────────

export interface AdminAuthContext {
    ok: true;
    sid: string;
    tenantId: string;
    runtimeApiUrl: string;
    correlationId: string;
}

interface AdminAuthError {
    ok: false;
    response: NextResponse;
}

/**
 * Validates the admin session and returns the session context.
 * Returns a NextResponse error if unauthorized, or the session data.
 */
export async function requireAdminSession(): Promise<AdminAuthContext | AdminAuthError> {
    const sid = await getSessionId();
    if (!sid) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "Session required" } },
                { status: 401 },
            ),
        };
    }

    const runtimeApiUrl = process.env.RUNTIME_API_URL ?? "";
    if (!runtimeApiUrl && !process.env.DATABASE_URL) {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: { code: "NOT_CONFIGURED", message: "Neither Runtime API nor DATABASE_URL configured" } },
                { status: 503 },
            ),
        };
    }

    const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
    const correlationId = crypto.randomUUID();

    return { ok: true, sid, tenantId, runtimeApiUrl, correlationId };
}

// ─── Path Validation ──────────────────────────────────────────

function isAllowedPath(path: string): boolean {
    return ALLOWED_PATH_PATTERN.test(path);
}

// ─── Rate Limit Middleware ────────────────────────────────────

async function enforceRateLimit(
    tenantId: string,
    sid: string,
    isWrite: boolean,
): Promise<NextResponse | null> {
    const result = await checkRateLimit(tenantId, sid, isWrite);
    if (!result.allowed) {
        const retryAfter = Math.ceil((result.retryAfterMs ?? 60_000) / 1000);
        return NextResponse.json(
            { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
            {
                status: 429,
                headers: {
                    "Retry-After": String(retryAfter),
                    "X-RateLimit-Remaining": "0",
                },
            },
        );
    }
    return null;
}

// ─── Body Validation ──────────────────────────────────────────

export interface ValidateBodyOk<T> {
    ok: true;
    data: T;
}

interface ValidateBodyError {
    ok: false;
    response: NextResponse;
}

/**
 * Parse and validate a request body against a Zod schema.
 * Returns structured 400 errors with field-level details.
 */
export function validateBody<T>(body: unknown, schema: ZodSchema<T>): ValidateBodyOk<T> | ValidateBodyError {
    const result = schema.safeParse(body);
    if (!result.success) {
        const zodError = result.error as ZodError;
        const fieldErrors = zodError.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
        }));
        return {
            ok: false,
            response: NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "Request body validation failed",
                        fieldErrors,
                    },
                },
                { status: 400 },
            ),
        };
    }
    return { ok: true, data: result.data };
}

/**
 * Parse JSON body from a request with size limit enforcement.
 */
export async function parseJsonBody(request: NextRequest): Promise<
    { ok: true; body: unknown } | { ok: false; response: NextResponse }
> {
    try {
        const text = await request.text();
        if (text.length > MAX_BODY_SIZE) {
            return {
                ok: false,
                response: NextResponse.json(
                    { success: false, error: { code: "PAYLOAD_TOO_LARGE", message: `Request body exceeds ${MAX_BODY_SIZE / 1024}KB limit` } },
                    { status: 413 },
                ),
            };
        }
        const body: unknown = JSON.parse(text);
        return { ok: true, body };
    } catch {
        return {
            ok: false,
            response: NextResponse.json(
                { success: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
                { status: 400 },
            ),
        };
    }
}

// ─── Draft Version Guard ─────────────────────────────────────

interface EntityMetaResponse {
    success: boolean;
    data?: { currentVersion?: { id: string; status: string } };
}

/**
 * Asserts that the entity's current version is in "draft" status.
 * Published and archived versions are immutable — mutations must be rejected.
 * Returns null if draft (OK to proceed), or a NextResponse error.
 */
export async function assertDraftVersion(
    auth: AdminAuthContext,
    entityName: string,
): Promise<NextResponse | null> {
    try {
        // Try direct DB first
        if (hasDirectDb()) {
            const result = await getEntityDirect(entityName);
            const status = (result.data as any)?.currentVersion?.status;
            if (status && status !== "draft") {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: "IMMUTABLE_VERSION",
                            message: `Cannot modify a ${status} version. Create a new draft version first.`,
                            currentStatus: status,
                        },
                    },
                    { status: 403 },
                );
            }
            return null;
        }

        const res = await fetch(
            `${auth.runtimeApiUrl}/api/meta/entities/${encodeURIComponent(entityName)}`,
            {
                headers: {
                    "X-Correlation-Id": auth.correlationId,
                    "X-Tenant-Id": auth.tenantId,
                },
                signal: AbortSignal.timeout(5_000),
            },
        );
        if (!res.ok) return null; // Can't verify — let upstream decide

        const body = (await res.json()) as EntityMetaResponse;
        const status = body.data?.currentVersion?.status;

        if (status && status !== "draft") {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "IMMUTABLE_VERSION",
                        message: `Cannot modify a ${status} version. Create a new draft version first.`,
                        currentStatus: status,
                    },
                },
                { status: 403 },
            );
        }
    } catch {
        // If check fails, let the mutation proceed — upstream is source of truth
    }
    return null;
}

// ─── Connection Error Detection ──────────────────────────────

function isConnectionError(err: unknown): boolean {
    if (err instanceof TypeError && err.message === "fetch failed") return true;
    const msg = String(err).toLowerCase();
    return msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("fetch failed");
}

// ─── Observability ────────────────────────────────────────────

function emitProxyMetric(entry: {
    correlationId: string;
    endpoint: string;
    method: string;
    durationMs: number;
    status: number;
    error?: string;
}) {
    // Structured log — can be picked up by log aggregators (Datadog, Grafana, etc.)
    if (process.env.NODE_ENV !== "test") {
        console.log(JSON.stringify({
            type: "mesh_proxy_metric",
            ts: new Date().toISOString(),
            ...entry,
        }));
    }
}

// ─── Proxy: GET ───────────────────────────────────────────────

/**
 * Proxies a GET request to the runtime API.
 * Enforces path allowlist and rate limiting.
 * Forwards ETag and correlation ID headers.
 */
export async function proxyGet(
    auth: AdminAuthContext,
    path: string,
): Promise<NextResponse> {
    if (!isAllowedPath(path)) {
        return NextResponse.json(
            { success: false, error: { code: "FORBIDDEN_PATH", message: "Requested upstream path is not allowed" } },
            { status: 400 },
        );
    }

    const rateLimited = await enforceRateLimit(auth.tenantId, auth.sid, false);
    if (rateLimited) return rateLimited;

    const startTime = performance.now();
    try {
        const res = await fetch(`${auth.runtimeApiUrl}${path}`, {
            headers: {
                "X-Correlation-Id": auth.correlationId,
                "X-Tenant-Id": auth.tenantId,
            },
            signal: AbortSignal.timeout(10_000),
        });

        const durationMs = Math.round(performance.now() - startTime);
        emitProxyMetric({ correlationId: auth.correlationId, endpoint: path, method: "GET", durationMs, status: res.status });

        if (!res.ok) {
            // Fall back to stubs when upstream returns an error in dev mode
            if (isStubEnabled()) {
                const stubData = resolveStub(path);
                if (stubData !== null) {
                    emitProxyMetric({ correlationId: auth.correlationId, endpoint: path, method: "GET", durationMs, status: 200, error: "stub_fallback" });
                    return NextResponse.json(
                        { success: true, data: stubData },
                        {
                            headers: {
                                "X-Correlation-Id": auth.correlationId,
                                "X-Stub-Response": "true",
                                "X-Stub-Reason": `upstream_${res.status}`,
                            },
                        },
                    );
                }
            }

            const text = await res.text();
            return NextResponse.json(
                { success: false, error: { code: "UPSTREAM_ERROR", message: text } },
                { status: res.status },
            );
        }

        const body: unknown = await res.json();

        // Forward concurrency headers from upstream
        const etag = res.headers.get("ETag");
        const responseHeaders: Record<string, string> = {
            "X-Correlation-Id": auth.correlationId,
            "X-Response-Time": `${durationMs}ms`,
        };
        if (etag) responseHeaders["ETag"] = etag;

        const entityRevision = res.headers.get("X-Entity-Revision");
        if (entityRevision) responseHeaders["X-Entity-Revision"] = entityRevision;

        // Forward upstream response as-is (it already has { success, data, meta } shape)
        return NextResponse.json(body, { headers: responseHeaders });
    } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);

        // Stub fallback for connection errors in development
        if (isConnectionError(err) && isStubEnabled()) {
            const stubData = resolveStub(path);
            if (stubData !== null) {
                emitProxyMetric({ correlationId: auth.correlationId, endpoint: path, method: "GET", durationMs, status: 200, error: "stub_fallback" });
                return NextResponse.json(
                    { success: true, data: stubData },
                    {
                        headers: {
                            "X-Correlation-Id": auth.correlationId,
                            "X-Stub-Response": "true",
                            "X-Stub-Reason": "connection_error",
                            "X-Response-Time": `${durationMs}ms`,
                        },
                    },
                );
            }
        }

        const errorMessage = isConnectionError(err)
            ? `Unable to connect to the platform API at ${auth.runtimeApiUrl}. Ensure backend services are running.`
            : String(err);
        emitProxyMetric({ correlationId: auth.correlationId, endpoint: path, method: "GET", durationMs, status: 502, error: String(err) });
        return NextResponse.json(
            { success: false, error: { code: "PROXY_ERROR", message: errorMessage } },
            { status: 502 },
        );
    }
}

// ─── Proxy: Mutate ────────────────────────────────────────────

export interface MutateOptions {
    ifMatch?: string | null;
}

/**
 * Proxies a POST/PUT/DELETE request to the runtime API.
 * Enforces path allowlist, rate limiting, and body size.
 * Supports If-Match for optimistic concurrency control.
 */
export async function proxyMutate(
    auth: AdminAuthContext,
    path: string,
    method: "POST" | "PUT" | "DELETE",
    body?: unknown,
    options?: MutateOptions,
): Promise<NextResponse> {
    if (!isAllowedPath(path)) {
        return NextResponse.json(
            { success: false, error: { code: "FORBIDDEN_PATH", message: "Requested upstream path is not allowed" } },
            { status: 400 },
        );
    }

    const rateLimited = await enforceRateLimit(auth.tenantId, auth.sid, true);
    if (rateLimited) return rateLimited;

    const startTime = performance.now();
    try {
        const headers: Record<string, string> = {
            "X-Correlation-Id": auth.correlationId,
            "X-Tenant-Id": auth.tenantId,
        };
        if (body) headers["Content-Type"] = "application/json";
        if (options?.ifMatch) headers["If-Match"] = options.ifMatch;

        const res = await fetch(`${auth.runtimeApiUrl}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(15_000),
        });

        const durationMs = Math.round(performance.now() - startTime);
        emitProxyMetric({ correlationId: auth.correlationId, endpoint: path, method, durationMs, status: res.status });

        const statusForResponse = method === "POST" && res.status === 201 ? 201 : res.status;

        if (res.status === 412) {
            // Precondition Failed — concurrency conflict
            let serverVersion: string | undefined;
            let serverData: unknown;
            try {
                serverData = await res.json();
                serverVersion = res.headers.get("ETag") ?? undefined;
            } catch { /* ignore parse failures */ }

            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "CONFLICT",
                        message: "The resource was modified by another user. Please reload and try again.",
                        serverVersion,
                        serverData,
                    },
                },
                { status: 409 },
            );
        }

        if (!res.ok) {
            const text = await res.text();
            return NextResponse.json(
                { success: false, error: { code: "UPSTREAM_ERROR", message: text } },
                { status: res.status },
            );
        }

        const responseBody: unknown = await res.json();

        // Forward updated ETag from upstream
        const responseHeaders: Record<string, string> = {
            "X-Correlation-Id": auth.correlationId,
            "X-Response-Time": `${durationMs}ms`,
        };
        const newEtag = res.headers.get("ETag");
        if (newEtag) responseHeaders["ETag"] = newEtag;

        // Forward upstream response as-is (it already has { success, data } shape)
        return NextResponse.json(responseBody, { status: statusForResponse, headers: responseHeaders });
    } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        const isConnErr = isConnectionError(err);
        const stubHint = isConnErr && isStubEnabled()
            ? " Dev stubs are active for reads, but mutations require a running backend."
            : "";
        const errorMessage = isConnErr
            ? `Unable to connect to the platform API at ${auth.runtimeApiUrl}. Ensure backend services are running.${stubHint}`
            : String(err);
        emitProxyMetric({ correlationId: auth.correlationId, endpoint: path, method, durationMs, status: 502, error: String(err) });
        return NextResponse.json(
            { success: false, error: { code: "PROXY_ERROR", message: errorMessage } },
            { status: 502 },
        );
    }
}
