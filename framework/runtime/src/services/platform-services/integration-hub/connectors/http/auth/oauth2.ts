/**
 * OAuth2 Client Credentials auth strategy with in-memory token cache.
 */

import type { Logger } from "../../../../../../kernel/logger.js";
import type { AuthStrategy, HttpRequestConfig } from "../HttpConnectorClient.js";

interface CachedToken {
    accessToken: string;
    expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

export class OAuth2AuthStrategy implements AuthStrategy {
    constructor(private readonly logger: Logger) {}

    apply(request: HttpRequestConfig, config: Record<string, unknown>): HttpRequestConfig {
        const tokenUrl = config.tokenUrl as string;
        const clientId = config.clientId as string;

        const cacheKey = `${tokenUrl}:${clientId}`;
        const cached = tokenCache.get(cacheKey);

        if (cached && cached.expiresAt > Date.now() + 30_000) {
            return {
                ...request,
                headers: { ...request.headers, Authorization: `Bearer ${cached.accessToken}` },
            };
        }

        // Token not cached or expired — caller must use applyAsync instead.
        // Set a placeholder that HttpConnectorClient will resolve.
        return {
            ...request,
            headers: { ...request.headers, "X-OAuth2-Pending": "true" },
        };
    }

    async applyAsync(request: HttpRequestConfig, config: Record<string, unknown>): Promise<HttpRequestConfig> {
        const tokenUrl = config.tokenUrl as string;
        const clientId = config.clientId as string;
        const clientSecret = config.clientSecret as string;
        const scope = config.scope as string | undefined;

        const cacheKey = `${tokenUrl}:${clientId}`;
        const cached = tokenCache.get(cacheKey);

        if (cached && cached.expiresAt > Date.now() + 30_000) {
            return {
                ...request,
                headers: { ...request.headers, Authorization: `Bearer ${cached.accessToken}` },
            };
        }

        const token = await this.fetchToken(tokenUrl, clientId, clientSecret, scope);
        tokenCache.set(cacheKey, token);

        return {
            ...request,
            headers: { ...request.headers, Authorization: `Bearer ${token.accessToken}` },
        };
    }

    private async fetchToken(
        tokenUrl: string,
        clientId: string,
        clientSecret: string,
        scope?: string,
    ): Promise<CachedToken> {
        const params = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
        });
        if (scope) params.set("scope", scope);

        this.logger.debug({ tokenUrl, clientId }, "[int:oauth2] Fetching access token");

        const res = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`OAuth2 token request failed (${res.status}): ${body}`);
        }

        const data = (await res.json()) as { access_token: string; expires_in?: number };
        const expiresIn = data.expires_in ?? 3600;

        return {
            accessToken: data.access_token,
            expiresAt: Date.now() + expiresIn * 1000,
        };
    }
}
