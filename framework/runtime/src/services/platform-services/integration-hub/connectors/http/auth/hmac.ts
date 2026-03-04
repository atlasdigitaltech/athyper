/**
 * HMAC auth strategy — signs request body with HMAC-SHA256.
 */

import { createHmac } from "node:crypto";

import type {
  AuthStrategy,
  HttpRequestConfig,
} from "../HttpConnectorClient.js";

export function computeHmacSignature(
  body: string,
  secret: string,
  algorithm = "sha256",
): string {
  return createHmac(algorithm, secret).update(body, "utf8").digest("hex");
}

export class HmacAuthStrategy implements AuthStrategy {
  apply(
    request: HttpRequestConfig,
    config: Record<string, unknown>,
  ): HttpRequestConfig {
    const secret = config.secret as string;
    const algorithm = (config.algorithm as string) ?? "sha256";
    const headerName = (config.headerName as string) ?? "X-Signature-256";
    const timestampHeader = (config.timestampHeader as string) ?? "X-Timestamp";

    const bodyStr = request.body != null ? JSON.stringify(request.body) : "";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signable = `${timestamp}.${bodyStr}`;
    const signature = computeHmacSignature(signable, secret, algorithm);

    return {
      ...request,
      headers: {
        ...request.headers,
        [headerName]: `${algorithm}=${signature}`,
        [timestampHeader]: timestamp,
      },
    };
  }
}
