// framework/runtime/src/services/platform/foundation/security/auth-telemetry.ts
//
// OTel instrumentation for auth operations.
// Provides named spans for Keycloak exchange, JWKS fetch, Redis session, and refresh flows.

export interface Span {
    name: string;
    startTime: number;
    attributes: Record<string, string | number | boolean | undefined>;
    status?: "ok" | "error";
    error?: string;
    endTime?: number;
}

export interface AuthTelemetryConfig {
    emit: (envelope: unknown) => void;
    serviceName?: string;
}

/**
 * Semantic span attribute keys per OTel semantic conventions.
 */
export interface AuthSpanAttributes {
    "enduser.id"?: string;
    "enduser.role"?: string;
    "auth.session.id_hash"?: string;
    "auth.flow"?: "login" | "refresh" | "logout" | "jwks" | "mfa";
    "tenant.id"?: string;
    [key: string]: string | number | boolean | undefined;
}

// ─── Named Span Constants ────────────────────────────────────────

export const AUTH_SPANS = {
    KEYCLOAK_TOKEN_EXCHANGE: "auth.keycloak.token_exchange",
    JWKS_FETCH: "auth.jwks.fetch",
    SESSION_REDIS_LOAD: "auth.session.redis_load",
    SESSION_REDIS_SAVE: "auth.session.redis_save",
    REFRESH_FLOW: "auth.refresh.flow",
    MFA_VERIFY: "auth.mfa.verify",
    JWT_VERIFY: "auth.jwt.verify",
    LOGIN_FLOW: "auth.login.flow",
    LOGOUT_FLOW: "auth.logout.flow",
} as const;

// ─── AuthTelemetry ───────────────────────────────────────────────

export class AuthTelemetry {
    private readonly emit: (envelope: unknown) => void;
    private readonly serviceName: string;

    constructor(config: AuthTelemetryConfig) {
        this.emit = config.emit;
        this.serviceName = config.serviceName ?? "athyper-runtime";
    }

    startSpan(name: string, attributes: AuthSpanAttributes = {}): Span {
        return {
            name,
            startTime: Date.now(),
            attributes: { ...attributes },
        };
    }

    endSpan(span: Span, status: "ok" | "error", error?: string): void {
        span.endTime = Date.now();
        span.status = status;
        span.error = error;

        const durationMs = span.endTime - span.startTime;

        this.emit({
            type: "auth_span",
            timestamp: new Date(span.endTime).toISOString(),
            service: this.serviceName,
            span: {
                name: span.name,
                durationMs,
                status,
                error: error ?? undefined,
                attributes: span.attributes,
            },
        });
    }

    /**
     * Convenience: wrap an async operation with a named span.
     */
    async withSpan<T>(name: string, attributes: AuthSpanAttributes, fn: () => Promise<T>): Promise<T> {
        const span = this.startSpan(name, attributes);
        try {
            const result = await fn();
            this.endSpan(span, "ok");
            return result;
        } catch (err) {
            this.endSpan(span, "error", err instanceof Error ? err.message : String(err));
            throw err;
        }
    }
}
