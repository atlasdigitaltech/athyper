/**
 * HTTP Connector Client — executes HTTP requests with auth, retry, timeout.
 */

import { ApiKeyAuthStrategy } from "./auth/apiKey.js";
import { BasicAuthStrategy } from "./auth/basic.js";
import { HmacAuthStrategy } from "./auth/hmac.js";
import { OAuth2AuthStrategy } from "./auth/oauth2.js";

import type { Logger } from "../../../../../kernel/logger.js";
import type { IntegrationEndpoint } from "../../domain/models/IntegrationEndpoint.js";
import type { DeliveryLogRepo } from "../../persistence/DeliveryLogRepo.js";

// ── Shared types ────────────────────────────────────────────────────────

export interface AuthStrategy {
    apply(request: HttpRequestConfig, config: Record<string, unknown>): HttpRequestConfig;
    applyAsync?(request: HttpRequestConfig, config: Record<string, unknown>): Promise<HttpRequestConfig>;
}

export interface HttpRequestConfig {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
    timeoutMs: number;
}

export interface HttpConnectorResponse {
    status: number;
    headers: Record<string, string>;
    body: unknown;
    durationMs: number;
}

// ── No-op auth strategy ─────────────────────────────────────────────────

const noopAuth: AuthStrategy = { apply: (r) => r };

// ── Client ──────────────────────────────────────────────────────────────

export class HttpConnectorClient {
    private authStrategies: Map<string, AuthStrategy>;

    constructor(
        private readonly logger: Logger,
        private readonly deliveryLogRepo: DeliveryLogRepo | null,
    ) {
        this.authStrategies = new Map<string, AuthStrategy>([
            ["NONE", noopAuth],
            ["API_KEY", new ApiKeyAuthStrategy()],
            ["BASIC", new BasicAuthStrategy()],
            ["HMAC", new HmacAuthStrategy()],
            ["OAUTH2", new OAuth2AuthStrategy(logger)],
        ]);
    }

    async execute(
        endpoint: IntegrationEndpoint,
        request: {
            body?: unknown;
            headers?: Record<string, string>;
            queryParams?: Record<string, string>;
        },
        outboxItemId?: string,
    ): Promise<HttpConnectorResponse> {
        // Build base request config
        let url = endpoint.url;
        if (request.queryParams) {
            const params = new URLSearchParams(request.queryParams);
            const sep = url.includes("?") ? "&" : "?";
            url = `${url}${sep}${params.toString()}`;
        }

        let config: HttpRequestConfig = {
            url,
            method: endpoint.httpMethod,
            headers: {
                "Content-Type": "application/json",
                ...endpoint.defaultHeaders,
                ...request.headers,
            },
            body: request.body,
            timeoutMs: endpoint.timeoutMs,
        };

        // Apply auth strategy
        const strategy = this.authStrategies.get(endpoint.authType) ?? noopAuth;
        if (strategy.applyAsync) {
            config = await strategy.applyAsync(config, endpoint.authConfig);
        } else {
            config = strategy.apply(config, endpoint.authConfig);
        }

        // Execute fetch with timeout
        const start = Date.now();
        let responseStatus: number | null = null;
        let responseHeaders: Record<string, string> = {};
        let responseBody: unknown = null;
        let success = false;
        let error: string | null = null;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

            const fetchOpts: RequestInit = {
                method: config.method,
                headers: config.headers,
                signal: controller.signal,
            };

            if (config.body != null && config.method !== "GET") {
                fetchOpts.body = JSON.stringify(config.body);
            }

            const res = await fetch(config.url, fetchOpts);
            clearTimeout(timeout);

            responseStatus = res.status;
            responseHeaders = Object.fromEntries(res.headers.entries());

            const contentType = res.headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
                responseBody = await res.json();
            } else {
                responseBody = await res.text();
            }

            success = res.ok;
            if (!res.ok) {
                error = `HTTP ${res.status}: ${typeof responseBody === "string" ? responseBody.slice(0, 500) : JSON.stringify(responseBody).slice(0, 500)}`;
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            error = errMsg;
            if (errMsg.includes("aborted")) {
                error = `Timeout after ${config.timeoutMs}ms`;
            }
        }

        const durationMs = Date.now() - start;

        // Log delivery attempt
        if (this.deliveryLogRepo) {
            try {
                await this.deliveryLogRepo.append({
                    tenantId: endpoint.tenantId,
                    endpointId: endpoint.id,
                    outboxItemId: outboxItemId ?? null,
                    requestUrl: config.url,
                    requestMethod: config.method,
                    requestHeaders: config.headers,
                    requestBody: config.body ?? null,
                    responseStatus,
                    responseHeaders: Object.keys(responseHeaders).length > 0 ? responseHeaders : null,
                    responseBody: typeof responseBody === "string"
                        ? responseBody.slice(0, 10_000)
                        : JSON.stringify(responseBody)?.slice(0, 10_000) ?? null,
                    durationMs,
                    success,
                    error,
                });
            } catch (logErr) {
                this.logger.warn({ error: String(logErr) }, "[int:http] Failed to log delivery");
            }
        }

        if (!success && error) {
            this.logger.warn(
                { endpoint: endpoint.code, url: config.url, status: responseStatus, durationMs, error },
                "[int:http] Request failed",
            );
        } else {
            this.logger.debug(
                { endpoint: endpoint.code, url: config.url, status: responseStatus, durationMs },
                "[int:http] Request succeeded",
            );
        }

        return {
            status: responseStatus ?? 0,
            headers: responseHeaders,
            body: responseBody,
            durationMs,
        };
    }
}
