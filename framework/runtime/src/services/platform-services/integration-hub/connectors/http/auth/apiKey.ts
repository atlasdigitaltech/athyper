/**
 * API Key auth strategy — injects key as header or query param.
 */

import type { AuthStrategy, HttpRequestConfig } from "../HttpConnectorClient.js";

export class ApiKeyAuthStrategy implements AuthStrategy {
    apply(request: HttpRequestConfig, config: Record<string, unknown>): HttpRequestConfig {
        const key = config.apiKey as string;
        const placement = (config.placement as string) ?? "header";
        const headerName = (config.headerName as string) ?? "X-API-Key";

        if (placement === "query") {
            const sep = request.url.includes("?") ? "&" : "?";
            const paramName = (config.paramName as string) ?? "api_key";
            return {
                ...request,
                url: `${request.url}${sep}${encodeURIComponent(paramName)}=${encodeURIComponent(key)}`,
            };
        }

        return {
            ...request,
            headers: { ...request.headers, [headerName]: key },
        };
    }
}
