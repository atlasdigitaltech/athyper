/**
 * HTTP Basic auth strategy — Authorization: Basic base64(user:pass).
 */

import type { AuthStrategy, HttpRequestConfig } from "../HttpConnectorClient.js";

export class BasicAuthStrategy implements AuthStrategy {
    apply(request: HttpRequestConfig, config: Record<string, unknown>): HttpRequestConfig {
        const username = config.username as string;
        const password = config.password as string;
        const encoded = Buffer.from(`${username}:${password}`).toString("base64");

        return {
            ...request,
            headers: { ...request.headers, Authorization: `Basic ${encoded}` },
        };
    }
}
