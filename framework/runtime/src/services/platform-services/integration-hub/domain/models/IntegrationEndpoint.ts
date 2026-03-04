/**
 * Integration Endpoint — registered external API endpoint config.
 */

export const AuthType = {
    NONE: "NONE",
    API_KEY: "API_KEY",
    BASIC: "BASIC",
    HMAC: "HMAC",
    OAUTH2: "OAUTH2",
} as const;
export type AuthType = (typeof AuthType)[keyof typeof AuthType];

export const HttpMethod = {
    GET: "GET",
    POST: "POST",
    PUT: "PUT",
    PATCH: "PATCH",
    DELETE: "DELETE",
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

export interface RetryPolicy {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
}

export interface RateLimitConfig {
    maxPerSecond?: number;
    maxPerMinute?: number;
}

export interface IntegrationEndpoint {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    description: string | null;
    url: string;
    httpMethod: HttpMethod;
    authType: AuthType;
    authConfig: Record<string, unknown>;
    defaultHeaders: Record<string, string>;
    timeoutMs: number;
    retryPolicy: RetryPolicy;
    rateLimitConfig: RateLimitConfig | null;
    isActive: boolean;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface CreateEndpointInput {
    tenantId: string;
    code: string;
    name: string;
    description?: string;
    url: string;
    httpMethod?: HttpMethod;
    authType?: AuthType;
    authConfig?: Record<string, unknown>;
    defaultHeaders?: Record<string, string>;
    timeoutMs?: number;
    retryPolicy?: RetryPolicy;
    rateLimitConfig?: RateLimitConfig;
    createdBy: string;
}

export interface UpdateEndpointInput {
    name?: string;
    description?: string | null;
    url?: string;
    httpMethod?: HttpMethod;
    authType?: AuthType;
    authConfig?: Record<string, unknown>;
    defaultHeaders?: Record<string, string>;
    timeoutMs?: number;
    retryPolicy?: RetryPolicy;
    rateLimitConfig?: RateLimitConfig | null;
    isActive?: boolean;
    updatedBy: string;
}
