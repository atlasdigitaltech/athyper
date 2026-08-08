// Context-aware outbound fetch helper.
//
// Outbound fetch wrapper that propagates the active request's correlationId
// and OTel traceparent header to downstream services (docparser, virusscan,
// searchcore, Gotenberg). Without this, cross-service request tracing is
// broken at every service boundary.

import { trace, propagation, context } from "@opentelemetry/api";
import { tryGetContext } from "@athyper/server-foundation/context";

export type FetchWithContextInit = RequestInit & {
  // When true, skip propagation (e.g. external third-party calls where
  // injecting internal trace headers is undesirable).
  skipContextPropagation?: boolean;
};

export async function fetchWithContext(
  url: string | URL,
  init: FetchWithContextInit = {},
): Promise<Response> {
  const { skipContextPropagation = false, ...fetchInit } = init;

  const headers = new Headers(fetchInit.headers);

  if (!skipContextPropagation) {
    const ctx = tryGetContext();

    // Inject W3C traceparent/tracestate headers from the active OTel context
    // so Tempo can stitch inbound and outbound spans into a single trace.
    propagation.inject(context.active(), {
      set: (_carrier: unknown, key: string, value: string) => headers.set(key, value),
    });

    // Inject correlationId as a custom header for services that don't use OTel.
    const correlationId = ctx?.correlationId ?? ctx?.requestId;
    if (correlationId && !headers.has("x-correlation-id")) {
      headers.set("x-correlation-id", correlationId);
    }
  }

  return fetch(url, { ...fetchInit, headers });
}
